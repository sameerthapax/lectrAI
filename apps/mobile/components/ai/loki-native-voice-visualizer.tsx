import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

export type LokiVisualizerMode = 'idle' | 'listening' | 'waiting' | 'speaking';

type LokiNativeVoiceVisualizerProps = {
  mode?: LokiVisualizerMode;
  speechLevel?: number;
  playbackTimeSeconds?: number;
  collapsed?: boolean;
};

function getSpeechEnvelope(playbackTimeSeconds: number, speechLevel: number) {
  const rapidCarrier = (Math.sin(playbackTimeSeconds * 20) * 0.5 + 0.5) * 0.26;
  const midCarrier = (Math.sin(playbackTimeSeconds * 11.5 + 0.8) * 0.5 + 0.5) * 0.22;
  const shimmer = (Math.sin(playbackTimeSeconds * 31) * 0.5 + 0.5) * 0.12;

  return Math.min(1, 0.08 + speechLevel * 0.92 + rapidCarrier + midCarrier + shimmer);
}

export default function LokiNativeVoiceVisualizer({
  mode = 'idle',
  speechLevel = 0,
  playbackTimeSeconds = 0,
  collapsed = false,
}: LokiNativeVoiceVisualizerProps) {
  const waitingFloat = useRef(new Animated.Value(0)).current;
  const waitingPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (mode !== 'waiting') {
      waitingFloat.stopAnimation();
      waitingPulse.stopAnimation();
      waitingFloat.setValue(0);
      waitingPulse.setValue(0);
      return;
    }

    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(waitingFloat, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(waitingFloat, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ])
    );

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(waitingPulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(waitingPulse, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ])
    );

    floatLoop.start();
    pulseLoop.start();

    return () => {
      floatLoop.stop();
      pulseLoop.stop();
    };
  }, [mode, waitingFloat, waitingPulse]);

  const normalizedSpeechLevel = Math.min(1, Math.max(0, speechLevel));
  const speakingEnvelope = getSpeechEnvelope(playbackTimeSeconds, normalizedSpeechLevel);

  const intensity =
    mode === 'speaking'
      ? 0.22 + speakingEnvelope * 1.05
      : mode === 'listening'
        ? 0.14
        : mode === 'waiting'
          ? 0.18
          : 0.08;

  const waitingLift = waitingFloat.interpolate({
    inputRange: [0, 1],
    outputRange: [5, -8],
  });
  const waitingHaloLift = waitingFloat.interpolate({
    inputRange: [0, 1],
    outputRange: [9, -12],
  });
  const waitingPulseScale = waitingPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });

  const orbScale = 0.92 + intensity * 0.52;
  const coreScale = 0.98 + intensity * 0.24;
  const haloScale = 1.02 + intensity * 0.72;
  const orbRotate =
    mode === 'speaking'
      ? `${Math.sin(playbackTimeSeconds * 7.5) * 10}deg`
      : mode === 'waiting'
        ? '0deg'
        : '-4deg';
  const haloRotate = mode === 'speaking' ? `${Math.sin(playbackTimeSeconds * 4.5) * -18}deg` : '14deg';
  const shimmerOffset =
    mode === 'speaking'
      ? -52 + Math.sin(playbackTimeSeconds * 9.5) * 48
      : mode === 'waiting'
        ? -16
        : -40;
  const haloSize = collapsed ? 96 : 224;
  const orbShellSize = collapsed ? 64 : 148;
  const orbCoreSize = collapsed ? 54 : 130;
  const badgeLabel =
    mode === 'listening'
      ? 'Listening'
      : mode === 'waiting'
        ? 'Thinking'
        : mode === 'speaking'
          ? 'Speaking'
          : 'Ready';

  return (
    <View style={styles.frame}>
      <View style={styles.scene}>
        <Animated.View
          style={[
            styles.halo,
            {
              width: haloSize,
              height: haloSize,
              transform: [
                { translateY: mode === 'waiting' ? waitingHaloLift : 0 },
                { scale: mode === 'waiting' ? waitingPulseScale : haloScale },
                { rotate: haloRotate },
              ],
              opacity: 0.2 + intensity * 0.28,
            },
          ]}
        />
        <Animated.View
          style={[
            styles.orbShell,
            {
              width: orbShellSize,
              height: orbShellSize,
              transform: [
                { translateY: mode === 'waiting' ? waitingLift : 0 },
                { scale: orbScale },
                { rotate: orbRotate },
              ],
              shadowOpacity: 0.22 + intensity * 0.16,
            },
          ]}
        >
          <Animated.View
          style={[
            styles.orbCore,
            {
              width: orbCoreSize,
              height: orbCoreSize,
              transform: [{ scale: coreScale }],
              opacity: 0.88 + intensity * 0.1,
            },
            ]}
          >
            <View style={styles.orbGrid} />
            <Animated.View
              style={[
                styles.shimmer,
                {
                  transform: [{ translateX: shimmerOffset }, { rotate: '-18deg' }],
                  opacity: 0.18 + intensity * 0.1,
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
              mode === 'waiting'
                ? styles.statusDotWaiting
                : mode === 'speaking'
                  ? styles.statusDotSpeaking
                  : mode === 'listening'
                    ? styles.statusDotListening
                    : styles.statusDotIdle,
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
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  badge: {
    minHeight: 24,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(17, 12, 8, 0.58)',
    borderWidth: 1,
    borderColor: 'rgba(255, 237, 213, 0.08)',
  },
  badgeCompact: {
    display: 'none',
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#fb923c',
  },
  badgeLinePrimary: {
    width: 24,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 237, 213, 0.74)',
  },
  badgeLineSecondary: {
    width: 14,
    height: 3,
    borderRadius: 999,
    marginTop: 3,
    backgroundColor: 'rgba(255, 237, 213, 0.24)',
  },
  badgeGlow: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#fb923c',
    shadowColor: '#fb923c',
    shadowOpacity: 0.65,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  statusBadge: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(17, 12, 8, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255, 237, 213, 0.08)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  statusDotIdle: {
    backgroundColor: '#f59e0b',
  },
  statusDotListening: {
    backgroundColor: '#ef4444',
  },
  statusDotWaiting: {
    backgroundColor: '#f97316',
  },
  statusDotSpeaking: {
    backgroundColor: '#22c55e',
  },
  statusLabel: {
    color: '#fff7ed',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
