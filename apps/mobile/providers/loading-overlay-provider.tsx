import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { StyleSheet, Text, View } from 'react-native';
import LottieView from 'lottie-react-native';

import loadingAnimation from '../assets/animations/loading.json';

const LOADING_OVERLAY_DELAY_MS = 2000;
const ORANGE = '#ff6a00';
const OVERLAY_BG = 'rgba(8, 9, 12, 0.7)';

type LoadingOverlayContextValue = {
  show: (token: symbol) => void;
  hide: (token: symbol) => void;
};

const LoadingOverlayContext = createContext<LoadingOverlayContextValue | null>(null);

export function LoadingOverlayProvider({ children }: PropsWithChildren) {
  const [visibleCount, setVisibleCount] = useState(0);

  const show = (token: symbol) => {
    void token;
    setVisibleCount((current) => current + 1);
  };

  const hide = (token: symbol) => {
    void token;
    setVisibleCount((current) => Math.max(0, current - 1));
  };

  return (
    <LoadingOverlayContext.Provider value={{ show, hide }}>
      {children}
      {visibleCount > 0 ? <GlobalLoadingOverlay /> : null}
    </LoadingOverlayContext.Provider>
  );
}

export function useDelayedLoadingOverlay(active: boolean, delayMs = LOADING_OVERLAY_DELAY_MS) {
  const context = useContext(LoadingOverlayContext);
  const tokenRef = useRef(Symbol('global-loading-overlay'));
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isShownRef = useRef(false);

  useEffect(() => {
    if (!context) {
      return;
    }

    if (!active) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      if (isShownRef.current) {
        context.hide(tokenRef.current);
        isShownRef.current = false;
      }

      return;
    }

    timeoutRef.current = setTimeout(() => {
      context.show(tokenRef.current);
      isShownRef.current = true;
    }, delayMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      if (isShownRef.current) {
        context.hide(tokenRef.current);
        isShownRef.current = false;
      }
    };
  }, [active, context, delayMs]);
}

export function useLoadingOverlayControl() {
  const context = useContext(LoadingOverlayContext);
  const tokenRef = useRef(Symbol('manual-global-loading-overlay'));
  const isShownRef = useRef(false);

  useEffect(() => {
    return () => {
      if (context && isShownRef.current) {
        context.hide(tokenRef.current);
        isShownRef.current = false;
      }
    };
  }, [context]);

  return {
    show() {
      if (!context || isShownRef.current) {
        return;
      }

      context.show(tokenRef.current);
      isShownRef.current = true;
    },
    hide() {
      if (!context || !isShownRef.current) {
        return;
      }

      context.hide(tokenRef.current);
      isShownRef.current = false;
    },
  };
}

function GlobalLoadingOverlay() {
  return (
    <View pointerEvents="auto" style={styles.overlay}>
      <View style={styles.panel}>
        <View style={styles.animationFrame}>
          <LottieView
            autoPlay
            loop
            source={loadingAnimation}
            style={styles.animation}
          />
        </View>
        <Text style={styles.title}>Loading</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: OVERLAY_BG,
    zIndex: 999,
    elevation: 999,
  },
  panel: {
    width: 220,
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingVertical: 22,
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(15, 18, 24, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  animationFrame: {
    width: 148,
    height: 148,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  animation: {
    width: '100%',
    height: '100%',
  },
  title: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
  },
});
