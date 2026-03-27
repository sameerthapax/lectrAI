import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

const DEMO_DURATION_MS = 10000;

type Status = 'loading' | 'rendering' | 'complete';

function pulseAt(progress: number, center: number, width: number, amplitude: number) {
  const distance = Math.abs(progress - center);
  if (distance >= width) {
    return 0;
  }

  const normalized = 1 - distance / width;
  return Math.sin(normalized * Math.PI * 0.5) * amplitude;
}

function getEnvelope(progress: number) {
  const phraseBed =
    pulseAt(progress, 0.11, 0.09, 0.2) +
    pulseAt(progress, 0.29, 0.11, 0.34) +
    pulseAt(progress, 0.51, 0.13, 0.5) +
    pulseAt(progress, 0.79, 0.12, 0.42);

  const syllables = [
    [0.05, 0.018, 0.18],
    [0.09, 0.02, 0.28],
    [0.13, 0.016, 0.16],
    [0.22, 0.02, 0.22],
    [0.27, 0.022, 0.36],
    [0.33, 0.018, 0.22],
    [0.39, 0.02, 0.2],
    [0.45, 0.022, 0.42],
    [0.5, 0.018, 0.24],
    [0.56, 0.024, 0.48],
    [0.61, 0.02, 0.28],
    [0.67, 0.02, 0.22],
    [0.74, 0.024, 0.34],
    [0.8, 0.02, 0.26],
    [0.85, 0.02, 0.3],
    [0.9, 0.018, 0.22],
    [0.95, 0.016, 0.18],
  ] as const;

  const articulation = syllables.reduce(
    (total, [center, width, amplitude]) => total + pulseAt(progress, center, width, amplitude),
    0
  );

  const microVibrato =
    (Math.sin(progress * Math.PI * 34) * 0.5 + 0.5) *
    (0.035 + phraseBed * 0.025);

  return 0.08 + phraseBed + articulation + microVibrato;
}

export default function LokiNativeVoiceVisualizer() {
  const progress = useRef(new Animated.Value(0)).current;
  const [status, setStatus] = useState<Status>('loading');
  const [progressValue, setProgressValue] = useState(0);

  useEffect(() => {
    setStatus('loading');
    progress.setValue(0);

    let isMounted = true;
    const listenerId = progress.addListener(({ value }) => {
      if (!isMounted) {
        return;
      }

      setProgressValue(value);
      setStatus(value < 0.02 ? 'loading' : value < 1 ? 'rendering' : 'complete');
    });

    const timeout = setTimeout(() => {
      Animated.timing(progress, {
        toValue: 1,
        duration: DEMO_DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished && isMounted) {
          setProgressValue(1);
          setStatus('complete');
        }
      });
    }, 120);

    return () => {
      isMounted = false;
      clearTimeout(timeout);
      progress.removeListener(listenerId);
      progress.stopAnimation();
    };
  }, [progress]);

  const envelope = getEnvelope(progressValue);
  const orbScale = 0.9 + envelope * 0.72;
  const coreScale = 0.96 + envelope * 0.3;
  const haloScale = 1.02 + envelope * 0.68;
  const orbRotate = `${-12 + progressValue * 22 + Math.sin(progressValue * Math.PI * 8) * 4}deg`;
  const haloRotate = `${14 - progressValue * 36}deg`;
  const shimmerOffset = -60 + progressValue * 120;
  const badgeLabel =
    status === 'loading' ? 'Loading' : status === 'rendering' ? 'Rendering' : 'Animation Complete';

  return (
    <View style={styles.frame}>
      <View style={styles.scene}>
        <Animated.View
          style={[
            styles.halo,
            {
              transform: [{ scale: haloScale }, { rotate: haloRotate }],
              opacity: 0.24 + envelope * 0.42,
            },
          ]}
        />
        <Animated.View
          style={[
            styles.orbShell,
            {
              transform: [{ scale: orbScale }, { rotate: orbRotate }],
              shadowOpacity: 0.24 + envelope * 0.18,
            },
          ]}
        >
          <Animated.View
            style={[
              styles.orbCore,
              {
                transform: [{ scale: coreScale }],
                opacity: 0.88 + envelope * 0.1,
              },
            ]}
          >
            <View style={styles.orbGrid} />
            <Animated.View
              style={[
                styles.shimmer,
                {
                  transform: [{ translateX: shimmerOffset }, { rotate: '-18deg' }],
                  opacity: 0.18 + envelope * 0.1,
                },
              ]}
            />
          </Animated.View>
        </Animated.View>
      </View>

      <View pointerEvents="none" style={styles.overlay}>
        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <View style={styles.badgeDot} />
            <View>
              <View style={styles.badgeLinePrimary} />
              <View style={styles.badgeLineSecondary} />
            </View>
          </View>
          <View style={[styles.badge, styles.badgeCompact]}>
            <View style={styles.badgeGlow} />
          </View>
        </View>

        <View style={styles.statusBadge}>
          <View
            style={[
              styles.statusDot,
              status === 'loading'
                ? styles.statusDotLoading
                : status === 'rendering'
                  ? styles.statusDotRendering
                  : styles.statusDotComplete,
            ]}
          />
          <Text selectable style={styles.statusLabel}>
            {badgeLabel}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 32,
    backgroundColor: '#090706',
  },
  scene: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#120d08',
  },
  halo: {
    position: 'absolute',
    width: 224,
    height: 224,
    borderRadius: 999,
    backgroundColor: 'rgba(249, 115, 22, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(251, 146, 60, 0.3)',
  },
  orbShell: {
    width: 148,
    height: 148,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2a1508',
    shadowColor: '#fb923c',
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  orbCore: {
    width: 130,
    height: 130,
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 237, 213, 0.18)',
    backgroundColor: '#d45f12',
  },
  orbGrid: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.3,
    backgroundColor: '#d45f12',
    borderRadius: 999,
  },
  shimmer: {
    position: 'absolute',
    top: -8,
    bottom: -8,
    width: 34,
    backgroundColor: 'rgba(255, 243, 230, 0.4)',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 245, 235, 0.08)',
  },
  badgeCompact: {
    minWidth: 34,
    justifyContent: 'center',
  },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#ff8a3d',
  },
  badgeGlow: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#ff8a3d',
  },
  badgeLinePrimary: {
    width: 54,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 237, 213, 0.95)',
  },
  badgeLineSecondary: {
    width: 34,
    height: 4,
    borderRadius: 999,
    marginTop: 4,
    backgroundColor: 'rgba(255, 154, 75, 0.52)',
  },
  statusBadge: {
    alignSelf: 'center',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 245, 235, 0.12)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  statusDotLoading: {
    backgroundColor: '#fbbf24',
  },
  statusDotRendering: {
    backgroundColor: '#fb923c',
  },
  statusDotComplete: {
    backgroundColor: '#22c55e',
  },
  statusLabel: {
    color: '#fff7ed',
    fontSize: 12,
    fontWeight: '700',
  },
});
