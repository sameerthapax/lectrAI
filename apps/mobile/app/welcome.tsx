import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StatusBar,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

const ORANGE = '#ff6a00';
const AMBER = '#ffb36b';
const INK = '#0b0b0b';
const CREAM = '#f7f1e8';
const PANEL = '#fffaf3';
const BORDER = '#eadfce';
const SPLASH_DURATION_MS = 5000;

const featureScreens = [
  {
    eyebrow: 'Capture + Review',
    title: 'Turn every lecture into something you can actually study.',
    body: 'Record class, keep it organized, and come back to clean summaries, transcripts, and key ideas.',
    accent: '#fff0e3',
    glow: 'rgba(255, 106, 0, 0.18)',
  },
  {
    eyebrow: 'Practice',
    title: 'Study with quizzes that keep pace with your classes.',
    body: 'Review with quick AI-powered quizzes that help you spot gaps before exams do.',
    accent: '#fff6de',
    glow: 'rgba(255, 179, 107, 0.24)',
  },
  {
    eyebrow: 'Ask Loki',
    title: 'Get help from Loki, your lecture-aware AI assistant.',
    body: 'Ask Loki about your own lectures and get grounded answers based on your class material.',
    accent: '#fbe9df',
    glow: 'rgba(255, 106, 0, 0.14)',
  },
];

export default function WelcomeRoute() {
  const { width } = useWindowDimensions();
  const [phase, setPhase] = useState<'splash' | 'features'>('splash');
  const [featureIndex, setFeatureIndex] = useState(0);

  const splashOpacity = useRef(new Animated.Value(1)).current;
  const splashScale = useRef(new Animated.Value(0.9)).current;
  const sloganOpacity = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const logoDrift = useRef(new Animated.Value(0)).current;
  const ringSpin = useRef(new Animated.Value(0)).current;
  const featureOpacity = useRef(new Animated.Value(0)).current;
  const featureTranslateX = useRef(new Animated.Value(26)).current;
  const featureScale = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const logoLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(logoDrift, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(logoDrift, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const spinLoop = Animated.loop(
      Animated.timing(ringSpin, {
        toValue: 1,
        duration: 5200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    Animated.parallel([
      Animated.spring(splashScale, {
        toValue: 1,
        friction: 7,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(sloganOpacity, {
        toValue: 1,
        duration: 700,
        delay: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    pulseLoop.start();
    logoLoop.start();
    spinLoop.start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(splashOpacity, {
          toValue: 0,
          duration: 500,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(splashScale, {
          toValue: 1.08,
          duration: 500,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        pulseLoop.stop();
        logoLoop.stop();
        spinLoop.stop();
        setPhase('features');
      });
    }, SPLASH_DURATION_MS);

    return () => {
      clearTimeout(timer);
      pulseLoop.stop();
      logoLoop.stop();
      spinLoop.stop();
    };
  }, [logoDrift, pulse, ringSpin, sloganOpacity, splashOpacity, splashScale]);

  useEffect(() => {
    if (phase !== 'features') {
      return;
    }

    featureOpacity.setValue(0);
    featureTranslateX.setValue(30);
    featureScale.setValue(0.96);

    Animated.parallel([
      Animated.timing(featureOpacity, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(featureTranslateX, {
        toValue: 0,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(featureScale, {
        toValue: 1,
        duration: 340,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [featureIndex, featureOpacity, featureScale, featureTranslateX, phase]);

  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
  });

  const haloOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.16, 0.34],
  });

  const logoTranslateY = logoDrift.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -10],
  });

  const logoRotate = logoDrift.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['-4deg', '4deg', '-4deg'],
  });

  const logoScale = logoDrift.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.035],
  });

  const ringRotate = ringSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const currentScreen = featureScreens[featureIndex];
  const isLastScreen = featureIndex === featureScreens.length - 1;

  const cardWidth = useMemo(() => Math.min(width - 40, 440), [width]);

  const goToNextFeature = () => {
    if (isLastScreen) {
      router.replace('/login');
      return;
    }

    Animated.parallel([
      Animated.timing(featureOpacity, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(featureTranslateX, {
        toValue: -24,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(featureScale, {
        toValue: 0.98,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setFeatureIndex((index) => Math.min(index + 1, featureScreens.length - 1));
    });
  };

  if (phase === 'splash') {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: INK,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 28,
          overflow: 'hidden',
        }}
      >
        <StatusBar barStyle="light-content" />

        <Animated.View
          style={{
            position: 'absolute',
            width: 320,
            height: 320,
            borderRadius: 999,
            backgroundColor: ORANGE,
            opacity: haloOpacity,
            transform: [{ scale: pulseScale }],
          }}
        />
        <View
          style={{
            position: 'absolute',
            top: -40,
            right: -20,
            width: 220,
            height: 220,
            borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.07)',
          }}
        />
        <View
          style={{
            position: 'absolute',
            bottom: -70,
            left: -40,
            width: 240,
            height: 240,
            borderRadius: 999,
            backgroundColor: 'rgba(255,179,107,0.12)',
          }}
        />

        <Animated.View
          style={{
            alignItems: 'center',
            gap: 22,
            opacity: splashOpacity,
            transform: [{ scale: splashScale }],
          }}
        >
          <Animated.View
            style={{
              width: 132,
              height: 132,
              borderRadius: 34,
              backgroundColor: 'rgba(255,255,255,0.08)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.12)',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: ORANGE,
              shadowOpacity: 0.35,
              shadowRadius: 28,
              shadowOffset: { width: 0, height: 16 },
              transform: [
                { translateY: logoTranslateY },
                { rotate: logoRotate },
                { scale: logoScale },
              ],
            }}
          >
            <Animated.View
              style={{
                position: 'absolute',
                width: 152,
                height: 152,
                borderRadius: 999,
                borderWidth: 1.5,
                borderColor: 'rgba(255,255,255,0.22)',
                borderStyle: 'dashed',
                transform: [{ rotate: ringRotate }],
              }}
            />
            <Image
              source={require('../assets/images/icon.png')}
              style={{ width: 88, height: 88, borderRadius: 24 }}
              resizeMode="contain"
            />
          </Animated.View>

          <View style={{ alignItems: 'center', gap: 8 }}>
            <Text
              style={{
                color: '#ffffff',
                fontSize: 34,
                fontWeight: '900',
                letterSpacing: 0.5,
              }}
            >
              LectrAI
            </Text>
            <Animated.Text
              style={{
                color: 'rgba(255,255,255,0.84)',
                fontSize: 18,
                lineHeight: 26,
                fontWeight: '700',
                textAlign: 'center',
                opacity: sloganOpacity,
              }}
            >
              Catch the lecture. Keep the meaning.
            </Animated.Text>
          </View>
        </Animated.View>
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: CREAM,
        paddingHorizontal: 20,
        paddingTop: 72,
        paddingBottom: 32,
        justifyContent: 'space-between',
      }}
    >
      <StatusBar barStyle="dark-content" />

      <View style={{ gap: 18 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ gap: 6 }}>
            <Text style={{ color: '#5b4a3a', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 }}>
              MEET LECTRAI
            </Text>
            <Text style={{ color: INK, fontSize: 28, lineHeight: 34, fontWeight: '900' }}>
              Built to help you learn from every lecture.
            </Text>
          </View>

          <Image
            source={require('../assets/images/icon.png')}
            style={{ width: 56, height: 56, borderRadius: 16 }}
            resizeMode="contain"
          />
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {featureScreens.map((screen, index) => (
            <View
              key={screen.title}
              style={{
                flex: 1,
                height: 6,
                borderRadius: 999,
                backgroundColor: index === featureIndex ? ORANGE : '#e6d8c7',
              }}
            />
          ))}
        </View>
      </View>

      <Animated.View
        style={{
          alignSelf: 'center',
          width: cardWidth,
          borderRadius: 30,
          borderCurve: 'continuous',
          padding: 24,
          backgroundColor: PANEL,
          borderWidth: 1,
          borderColor: BORDER,
          overflow: 'hidden',
          gap: 18,
          opacity: featureOpacity,
          transform: [{ translateX: featureTranslateX }, { scale: featureScale }],
        }}
      >
        <View
          style={{
            position: 'absolute',
            top: -34,
            right: -24,
            width: 180,
            height: 180,
            borderRadius: 999,
            backgroundColor: currentScreen.glow,
          }}
        />
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 22,
            backgroundColor: currentScreen.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: ORANGE, fontSize: 24, fontWeight: '900' }}>
            0{featureIndex + 1}
          </Text>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ color: ORANGE, fontSize: 12, fontWeight: '900', letterSpacing: 0.5 }}>
            {currentScreen.eyebrow.toUpperCase()}
          </Text>
          <Text style={{ color: '#18120d', fontSize: 28, lineHeight: 34, fontWeight: '900' }}>
            {currentScreen.title}
          </Text>
          <Text style={{ color: '#6a6157', fontSize: 15, lineHeight: 23, fontWeight: '500' }}>
            {currentScreen.body}
          </Text>
        </View>
      </Animated.View>

      <View style={{ gap: 14 }}>
        <Pressable
          onPress={goToNextFeature}
          style={({ pressed }) => ({
            minHeight: 58,
            borderRadius: 18,
            borderCurve: 'continuous',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: ORANGE,
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '900' }}>
            {isLastScreen ? 'Get Started' : 'Next'}
          </Text>
        </Pressable>

        <Text
          style={{
            textAlign: 'center',
            color: '#7b6f62',
            fontSize: 13,
            fontWeight: '600',
          }}
        >
          {isLastScreen ? 'Head straight to login and start exploring.' : `Step ${featureIndex + 1} of ${featureScreens.length}`}
        </Text>
      </View>
    </View>
  );
}
