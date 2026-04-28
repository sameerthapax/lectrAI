export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  expiresAt: number | null;
};

export type AuthUser = {
  id: string;
  email: string | null;
  fullName: string | null;
  role: 'student' | 'instructor' | 'admin';
  universityName: string | null;
  major: string | null;
  timezone: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  emailConfirmedAt: string | null;
};

export type AuthResponse = {
  message: string;
  user: AuthUser;
  session: AuthSession | null;
  emailVerificationRequired: boolean;
};

type LogoutResponse = {
  message: string;
  scope: 'global' | 'local' | 'others';
};

type RequestOptions = {
  accessToken?: string;
};

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
const AUTH_REQUEST_TIMEOUT_MS = 8000;

function requireApiBaseUrl() {
  if (!API_BASE_URL) {
    throw new Error('Set EXPO_PUBLIC_API_BASE_URL to enable backend auth calls.');
  }

  return API_BASE_URL;
}

async function request<TResponse>(
  path: string,
  init: RequestInit,
  options?: RequestOptions
): Promise<TResponse> {
  const headers = new Headers(init.headers);

  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (options?.accessToken) {
    headers.set('Authorization', `Bearer ${options.accessToken}`);
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, AUTH_REQUEST_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch(`${requireApiBaseUrl()}${path}`, {
      ...init,
      headers,
      signal: abortController.signal,
    });
  } catch (error) {
    clearTimeout(timeout);

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The request timed out. Please try again.');
    }

    throw error;
  }

  clearTimeout(timeout);

  if (!response.ok) {
    let message = 'Request failed. Please try again.';

    try {
      const data = (await response.json()) as { error?: string; message?: string };
      message = data.error ?? data.message ?? message;
    } catch {
      // Ignore non-JSON error bodies.
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  return (await response.json()) as TResponse;
}

export function signInWithEmailAndPassword(email: string, password: string) {
  return request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function signUpWithEmailAndPassword(input: {
  email: string;
  password: string;
  fullName: string;
  universityName: string;
  major: string;
  timezone: string;
  role?: 'student' | 'instructor' | 'admin';
}) {
  return request<AuthResponse>('/auth/sign-up', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function refreshAuthSession(refreshToken: string) {
  return request<AuthResponse>('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
}

export function logoutAuthSession(
  accessToken: string,
  scope: 'global' | 'local' | 'others' = 'global'
) {
  return request<LogoutResponse>(
    '/auth/logout',
    {
      method: 'POST',
      body: JSON.stringify({ scope }),
    },
    { accessToken }
  );
}

export async function authorizedRequest<TResponse>(
  path: string,
  init: RequestInit,
  accessToken: string
) {
  return request<TResponse>(path, init, { accessToken });
}

export async function authorizedBinaryRequest(
  path: string,
  init: RequestInit,
  accessToken: string
) {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);

  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, AUTH_REQUEST_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch(`${requireApiBaseUrl()}${path}`, {
      ...init,
      headers,
      signal: abortController.signal,
    });
  } catch (error) {
    clearTimeout(timeout);

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The request timed out. Please try again.');
    }

    throw error;
  }

  clearTimeout(timeout);

  if (!response.ok) {
    let message = 'Request failed. Please try again.';

    try {
      const data = (await response.json()) as { error?: string; message?: string };
      message = data.error ?? data.message ?? message;
    } catch {
      // Ignore non-JSON error bodies.
    }

    throw new Error(message);
  }

  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get('Content-Type'),
    contentDisposition: response.headers.get('Content-Disposition'),
  };
}
