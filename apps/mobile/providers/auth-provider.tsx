import { router, useRootNavigationState, useSegments } from 'expo-router';
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  type AuthResponse,
  type AuthSession,
  type AuthUser,
  logoutAuthSession,
  refreshAuthSession,
  signInWithEmailAndPassword,
  signUpWithEmailAndPassword,
} from '../services/auth-api';
import {
  clearStoredAuthSession,
  getStoredAuthSession,
  setStoredAuthSession,
  type StoredAuthSession,
} from '../services/auth-storage';
import {
  clearLocalCache,
  initializeLocalDatabase,
} from '../services/local-db';
import { bootstrapLocalCacheFromApi } from '../services/bootstrap-sync';
import { logMobileError } from '../services/error-monitor';
import { useDelayedLoadingOverlay } from './loading-overlay-provider';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type SignUpPayload = {
  email: string;
  password: string;
  fullName: string;
  universityName: string;
  major: string;
  timezone: string;
  role?: 'student' | 'instructor' | 'admin';
};

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  session: AuthSession | null;
  signIn: (email: string, password: string) => Promise<AuthResponse>;
  signUp: (input: SignUpPayload) => Promise<AuthResponse>;
  signOut: () => Promise<void>;
  getValidAccessToken: () => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const REFRESH_SKEW_SECONDS = 60;
const AUTH_RESTORE_TIMEOUT_MS = 8000;

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const refreshPromiseRef = useRef<Promise<AuthResponse | null> | null>(null);

  useDelayedLoadingOverlay(status === 'loading', 0);

  useEffect(() => {
    let mounted = true;

    const restoreSession = async () => {
      try {
        await withTimeout(initializeLocalDatabase(), AUTH_RESTORE_TIMEOUT_MS, 'initialize-local-db');
        const storedSession = await withTimeout(
          getStoredAuthSession(),
          AUTH_RESTORE_TIMEOUT_MS,
          'read-stored-auth-session'
        );

        if (!storedSession) {
          if (mounted) {
            setStatus('unauthenticated');
          }
          return;
        }

        const restored = await withTimeout(
          refreshStoredSession(storedSession),
          AUTH_RESTORE_TIMEOUT_MS,
          'refresh-stored-session'
        );

        if (!mounted) {
          return;
        }

        if (!restored?.session) {
          setUser(null);
          setSession(null);
          setStatus('unauthenticated');
          return;
        }

        setUser(restored.user);
        setSession(restored.session);
        setStatus('authenticated');
      } catch (error) {
        logMobileError(error, {
          source: 'auth-provider.restore-session',
        });
        await clearStoredAuthSession().catch((storageError) => {
          logMobileError(storageError, {
            source: 'auth-provider.clear-stored-session-after-restore-failure',
          });
        });
        await clearLocalCache().catch((cacheError) => {
          logMobileError(cacheError, {
            source: 'auth-provider.clear-local-cache-after-restore-failure',
          });
        });

        if (mounted) {
          setUser(null);
          setSession(null);
          setStatus('unauthenticated');
        }
      }
    };

    void restoreSession();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (status !== 'authenticated' || !user || !session?.accessToken) {
      return;
    }

    let cancelled = false;

    const bootstrapCache = async () => {
      try {
        const accessToken = await getValidAccessToken();

        if (!accessToken || cancelled) {
          return;
        }

        await bootstrapLocalCacheFromApi(user, accessToken);
      } catch (error) {
        logMobileError(error, {
          source: 'auth-provider.bootstrap-cache',
          extra: { userId: user.id },
        });
        // Keep existing cached data visible when bootstrap sync fails.
      }
    };

    void bootstrapCache();

    return () => {
      cancelled = true;
    };
  }, [status, user?.id, session?.accessToken]);

  const signIn = async (email: string, password: string) => {
    const result = await signInWithEmailAndPassword(email, password);
    await applyAuthResult(result);
    return result;
  };

  const signUp = async (input: SignUpPayload) => {
    const result = await signUpWithEmailAndPassword(input);
    await applyAuthResult(result);
    return result;
  };

  const signOut = async () => {
    const activeSession = session;

    try {
      if (activeSession?.accessToken) {
        await logoutAuthSession(activeSession.accessToken, 'global');
      }
    } catch (error) {
      logMobileError(error, {
        source: 'auth-provider.sign-out',
      });
      // Clear local state even if the server session is already invalid.
    } finally {
      refreshPromiseRef.current = null;
      await clearStoredAuthSession();
      await clearLocalCache();
      setUser(null);
      setSession(null);
      setStatus('unauthenticated');
    }
  };

  const getValidAccessToken = async () => {
    if (!session) {
      return null;
    }

    if (!shouldRefreshSession(session)) {
      return session.accessToken;
    }

    const refreshed = await refreshCurrentSession();
    return refreshed?.session?.accessToken ?? null;
  };

  async function applyAuthResult(result: AuthResponse) {
    if (result.session) {
      await initializeLocalDatabase();
      await setStoredAuthSession(toStoredSession(result.session));
      setSession(result.session);
      setUser(result.user);
      setStatus('authenticated');
      return;
    }

    await clearStoredAuthSession();
    await clearLocalCache();
    setSession(null);
    setUser(null);
    setStatus('unauthenticated');
  }

  async function refreshCurrentSession() {
    if (!session?.refreshToken) {
      return null;
    }

    return refreshWithLock({ refreshToken: session.refreshToken });
  }

  async function refreshStoredSession(storedSession: StoredAuthSession) {
    return refreshWithLock({ refreshToken: storedSession.refreshToken });
  }

  async function refreshWithLock(currentSession: { refreshToken: string }) {
    if (!refreshPromiseRef.current) {
      refreshPromiseRef.current = refreshAuthSession(currentSession.refreshToken)
        .then(async (result) => {
          await applyAuthResult(result);
          return result;
        })
        .catch(async (error) => {
          logMobileError(error, {
            source: 'auth-provider.refresh-session',
          });
          await clearStoredAuthSession().catch((storageError) => {
            logMobileError(storageError, {
              source: 'auth-provider.clear-stored-session-after-refresh-failure',
            });
          });
          await clearLocalCache().catch((cacheError) => {
            logMobileError(cacheError, {
              source: 'auth-provider.clear-local-cache-after-refresh-failure',
            });
          });
          setUser(null);
          setSession(null);
          setStatus('unauthenticated');
          return null;
        })
        .finally(() => {
          refreshPromiseRef.current = null;
        });
    }

    return refreshPromiseRef.current;
  }

  return (
    <AuthContext.Provider value={{ status, user, session, signIn, signUp, signOut, getValidAccessToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function AuthGate({ children }: PropsWithChildren) {
  const auth = useAuth();
  const segments = useSegments();
  const rootNavigationState = useRootNavigationState();

  useEffect(() => {
    if (!rootNavigationState?.key || auth.status === 'loading') {
      return;
    }

    const inAuthGroup = segments[0] === '(auth)';
    const currentPath = segments.join('/');
    const onWelcomeScreen = segments[0] === 'welcome' || currentPath === '(pages)/welcome';

    if (auth.status === 'authenticated' && (inAuthGroup || onWelcomeScreen)) {
      router.replace('/(tabs)/home');
      return;
    }

    if (auth.status === 'unauthenticated' && !onWelcomeScreen && !inAuthGroup) {
      router.replace('/welcome');
      return;
    }
  }, [auth.status, rootNavigationState?.key, segments]);

  if (auth.status === 'loading') {
    return null;
  }

  return <>{children}</>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }

  return context;
}

function shouldRefreshSession(sessionLike: { expiresAt: number | null }) {
  if (sessionLike.expiresAt == null) {
    return true;
  }

  const now = Math.floor(Date.now() / 1000);
  return sessionLike.expiresAt - now <= REFRESH_SKEW_SECONDS;
}

function toStoredSession(sessionValue: AuthSession): StoredAuthSession {
  return {
    accessToken: sessionValue.accessToken,
    refreshToken: sessionValue.refreshToken,
    tokenType: sessionValue.tokenType,
    expiresIn: sessionValue.expiresIn,
    expiresAt: sessionValue.expiresAt,
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out while trying to ${label}.`));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}
