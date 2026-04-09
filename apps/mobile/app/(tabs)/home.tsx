import { BlurView } from 'expo-blur';
import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { router, useFocusEffect } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Alert,
  Easing,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import {
  CurrentCourseCarousel,
  buildCourseSelectorCards,
} from '../../components/home/current-course-carousel';
import { useAuth } from '../../providers/auth-provider';
import {
  getSelectedCourseId,
  listCoursesForUser,
  NO_CLASS_COURSE_ID,
  setSelectedCourseId,
  type LocalCourseRecord,
} from '../../services/courses-repository';
import { useSettings } from '../../providers/settings-provider';
import { fetchStatsOverview, incrementStreak } from '../../services/stats-api';
import {
  getCachedStatsForUser,
  upsertStatsForUser,
  type LocalStatsRecord,
} from '../../services/stats-repository';
import { saveRecordedLecture } from '../../services/recordings-repository';

const DIGIT_HEIGHT = 28;
const DIGIT_WIDTH = 16;
const DIGIT_GAP = 1;
const MIN_STREAK_DIGITS = 2;
const DIGIT_REPEAT_COUNT = 24;
const DIGIT_REPEAT_OFFSET = 10;

export default function HomeRoute() {
  const auth = useAuth();
  const settingsState = useSettings();
  const theme = settingsState.theme;
  const { width } = useWindowDimensions();
  const isCompact = width < 390;
  const [courses, setCourses] = useState<LocalCourseRecord[]>([]);
  const [stats, setStats] = useState<LocalStatsRecord | null>(null);
  const [selectedCourseId, setSelectedCourseIdState] = useState(NO_CLASS_COURSE_ID);
  const [recordingVisible, setRecordingVisible] = useState(false);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [streakBusy, setStreakBusy] = useState(false);
  const recordingOverlay = useRef(new Animated.Value(0)).current;
  const recordingPulse = useRef(new Animated.Value(0)).current;
  const recordingFloat = useRef(new Animated.Value(0)).current;
  const recordingShimmer = useRef(new Animated.Value(0)).current;
  const streakValue = useRef(new Animated.Value(0)).current;
  const hasAnimatedInitialStreak = useRef(false);
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const recorderState = useAudioRecorderState(recorder, 120);

  const quizOptions = [
    'A system that stores every lecture as raw audio only',
    'A grounded answer pipeline built from transcript embeddings',
    'A reminder tool that replaces note-taking entirely',
    'A static chatbot with no lecture context',
  ];
  const courseCards = buildCourseSelectorCards(courses);
  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) ?? null,
    [courses, selectedCourseId]
  );
  const recordingSeconds = Math.max(0, Math.floor((recorderState.durationMillis ?? 0) / 1000));
  const formattedRecordingTime = useMemo(() => {
    const minutes = Math.floor(recordingSeconds / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (recordingSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }, [recordingSeconds]);

  useFocusEffect(
    useCallback(() => {
      const user = auth.user;
      let cancelled = false;

      const loadHomeCourses = async () => {
        if (!user) {
          if (!cancelled) {
            setCourses([]);
            setSelectedCourseIdState(NO_CLASS_COURSE_ID);
          }
          return;
        }

        const [nextCourses, persistedCourseId] = await Promise.all([
          listCoursesForUser(user),
          getSelectedCourseId(),
        ]);

        if (!cancelled) {
          setCourses(nextCourses);
          setSelectedCourseIdState(
            nextCourses.some((course) => course.id === persistedCourseId) || persistedCourseId === NO_CLASS_COURSE_ID
              ? persistedCourseId
              : NO_CLASS_COURSE_ID
          );
        }
      };

      void loadHomeCourses();

      return () => {
        cancelled = true;
      };
    }, [auth.user?.id])
  );

  useFocusEffect(
    useCallback(() => {
      const user = auth.user;
      let cancelled = false;

      const loadStats = async () => {
        if (!user) {
          if (!cancelled) {
            setStats(null);
            hasAnimatedInitialStreak.current = false;
            streakValue.setValue(0);
          }
          return;
        }

        const cachedStats = await getCachedStatsForUser(user);

        if (!cancelled) {
          setStats(cachedStats);

          if (!hasAnimatedInitialStreak.current) {
            hasAnimatedInitialStreak.current = true;
            animateStreakValue(streakValue, 0, cachedStats.streakDays, 3000);
          } else {
            streakValue.setValue(cachedStats.streakDays);
          }
        }

        try {
          const accessToken = await auth.getValidAccessToken();

          if (!accessToken) {
            throw new Error('Your session expired. Please sign in again.');
          }

          const remoteStats = await fetchStatsOverview(accessToken);
          await upsertStatsForUser(user, remoteStats);
          const nextStats = await getCachedStatsForUser(user);

          if (!cancelled) {
            const previousStreak = cachedStats.streakDays;
            setStats(nextStats);

            if (nextStats.streakDays !== previousStreak) {
              animateStreakValue(streakValue, previousStreak, nextStats.streakDays, 450);
            } else {
              streakValue.setValue(nextStats.streakDays);
            }
          }
        } catch {
          // Keep cached stats visible when the sync request fails.
        }
      };

      void loadStats();

      return () => {
        cancelled = true;
        streakValue.stopAnimation();
      };
    }, [auth.user?.id, streakValue])
  );

  const handleSelectCourse = async (courseId: string) => {
    setSelectedCourseIdState(courseId);
    await setSelectedCourseId(courseId);
  };

  const handleIncrementStreak = async () => {
    if (!auth.user || streakBusy) {
      return;
    }

    const previousStreak = stats?.streakDays ?? 0;
    setStreakBusy(true);

    try {
      const accessToken = await auth.getValidAccessToken();

      if (!accessToken) {
        throw new Error('Your session expired. Please sign in again.');
      }

      const remoteStats = await incrementStreak(accessToken);
      await upsertStatsForUser(auth.user, remoteStats);
      const nextStats = await getCachedStatsForUser(auth.user);
      setStats(nextStats);
      animateStreakValue(streakValue, previousStreak, nextStats.streakDays, 450);
    } catch (error) {
      Alert.alert(
        'Could not update streak',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setStreakBusy(false);
    }
  };

  useEffect(() => {
    if (!recordingVisible) {
      recordingOverlay.setValue(0);
      return;
    }

    Animated.spring(recordingOverlay, {
      toValue: 1,
      friction: 8,
      tension: 48,
      useNativeDriver: true,
    }).start();
  }, [recordingOverlay, recordingVisible]);

  useEffect(() => {
    if (!recordingVisible || !recorderState.isRecording) {
      return;
    }

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(recordingPulse, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(recordingPulse, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(recordingFloat, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(recordingFloat, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const shimmerLoop = Animated.loop(
      Animated.timing(recordingShimmer, {
        toValue: 1,
        duration: 2400,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    pulseLoop.start();
    floatLoop.start();
    shimmerLoop.start();

    return () => {
      pulseLoop.stop();
      floatLoop.stop();
      shimmerLoop.stop();
      recordingPulse.setValue(0);
      recordingFloat.setValue(0);
      recordingShimmer.setValue(0);
    };
  }, [
    recordingFloat,
    recordingPulse,
    recordingShimmer,
    recorderState.isRecording,
    recordingVisible,
  ]);

  useEffect(() => {
    return () => {
      if (recorderState.isRecording) {
        void recorder.stop();
      }
    };
  }, [recorder, recorderState.isRecording]);

  const startRecording = async () => {
    try {
      setRecordingBusy(true);

      if (!selectedCourse || selectedCourseId === NO_CLASS_COURSE_ID) {
        Alert.alert(
          'Course required',
          'Select a course before starting a lecture recording so the file can be stored and synced.'
        );
        return;
      }

      if (settingsState.loading || !settingsState.settings?.permissions.microphone) {
        Alert.alert(
          'Microphone disabled',
          'Turn on microphone access in Settings before starting a lecture recording.'
        );
        return;
      }

      const currentPermission = await getRecordingPermissionsAsync();
      const permission = currentPermission.granted
        ? currentPermission
        : await requestRecordingPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'Microphone access needed',
          permission.canAskAgain
            ? 'Please allow microphone access to record your lecture.'
            : 'Microphone access is blocked on this device. Enable it in system settings to record your lecture.'
        );
        settingsState.updatePermissionSetting('microphone', false);
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });

      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecordingVisible(true);
    } catch (error) {
      Alert.alert(
        'Recording failed',
        error instanceof Error ? error.message : 'Unable to start recording right now.'
      );
    } finally {
      setRecordingBusy(false);
    }
  };

  const closeRecording = async (navigateToResults = false) => {
    try {
      setRecordingBusy(true);
      const durationMillis = recorderState.durationMillis ?? 0;

      if (recorderState.isRecording) {
        await recorder.stop();
      }

      const recordingUri = recorder.uri ?? recorderState.url;

      if (navigateToResults) {
        if (!auth.user) {
          throw new Error('You must be signed in to save a recording.');
        }

        if (!selectedCourse || selectedCourseId === NO_CLASS_COURSE_ID) {
          throw new Error('Select a course before saving a recording.');
        }

        if (!recordingUri) {
          throw new Error('The recorder did not return an audio file.');
        }

        const accessToken = await auth.getValidAccessToken();
        const savedRecording = await saveRecordedLecture({
          user: auth.user,
          accessToken,
          courseId: selectedCourse.id,
          courseName: selectedCourse.courseName,
          recordingUri,
          durationMillis,
        });

        await setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
          interruptionMode: 'mixWithOthers',
          shouldPlayInBackground: false,
          shouldRouteThroughEarpiece: false,
        });

        Animated.timing(recordingOverlay, {
          toValue: 0,
          duration: 220,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }).start(() => {
          setRecordingVisible(false);
          router.push({
            pathname: '/recording-results-page',
            params: {
              lectureId: savedRecording?.lectureId ?? '',
            },
          });
        });

        return;
      }

      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        interruptionMode: 'mixWithOthers',
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });

      Animated.timing(recordingOverlay, {
        toValue: 0,
        duration: 220,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        setRecordingVisible(false);
      });
    } catch (error) {
      Alert.alert(
        'Could not stop recording',
        error instanceof Error ? error.message : 'Something went wrong while stopping the recorder.'
      );
    } finally {
      setRecordingBusy(false);
    }
  };

  const overlayOpacity = recordingOverlay.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const overlayScale = recordingOverlay.interpolate({
    inputRange: [0, 1],
    outputRange: [0.84, 1],
  });

  const overlayTranslateY = recordingOverlay.interpolate({
    inputRange: [0, 1],
    outputRange: [48, 0],
  });

  const contentScale = recordingOverlay.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.98],
  });

  const pulseScale = recordingPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.16],
  });

  const pulseOpacity = recordingPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.18, 0.34],
  });

  const liveMetering = typeof recorderState.metering === 'number' ? recorderState.metering : -60;
  const normalizedMeter = Math.min(1, Math.max(0, (liveMetering + 60) / 60));
  const micLift = normalizedMeter * 22;
  const micScale = 1 + normalizedMeter * 0.16;
  const micGlowOpacity = 0.22 + normalizedMeter * 0.46;
  const micLiveTranslate = -normalizedMeter * 16;
  const micLiveRotate = `${-6 + normalizedMeter * 12}deg`;
  const outerRingScale = 1 + normalizedMeter * 0.28;
  const innerRingScale = 1 + normalizedMeter * 0.16;
  const micCoreColor = normalizedMeter > 0.65 ? '#dc2626' : normalizedMeter > 0.3 ? '#ef4444' : '#f87171';

  const micFloatTranslateY = recordingFloat.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, -8 - micLift * 0.35, 0],
  });

  const micFloatRotate = recordingFloat.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: ['-3deg', '3deg', '-3deg'],
  });

  const shimmerTranslateX = recordingShimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-120, 120],
  });

  const waveformHeights = [0.32, 0.56, 0.74, 0.48, 0.92, 0.4, 0.7, 0.52, 0.36].map(
    (multiplier, index) =>
      8 +
      normalizedMeter * (30 + multiplier * 34) +
      (index % 2 === 0 ? 10 : 2)
  );
  const statsSummary = stats ?? EMPTY_STATS;
  const statsCardScale = getStatsCardScale(statsSummary);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.screen }}>
      <Animated.View style={{ flex: 1, transform: [{ scale: contentScale }] }}>
        <ScrollView
          scrollEnabled={!recordingVisible}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{
            flexGrow: 1,
            padding: 16,
            gap: 12,
            paddingBottom: 32,
            backgroundColor: theme.colors.screen,
          }}
        >
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 24,
              right: -32,
              width: 220,
              height: 220,
              borderRadius: 999,
              backgroundColor: 'rgba(254, 215, 170, 0.16)',
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 160,
              left: -44,
              width: 200,
              height: 200,
              borderRadius: 999,
              backgroundColor: 'rgba(191, 219, 254, 0.14)',
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              bottom: 220,
              right: 56,
              width: 160,
              height: 160,
              borderRadius: 999,
              backgroundColor: 'rgba(187, 247, 208, 0.12)',
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              bottom: 40,
              left: 24,
              width: 180,
              height: 180,
              borderRadius: 999,
              backgroundColor: 'rgba(196, 181, 253, 0.08)',
            }}
          />

          <View
            style={{
              flexDirection: 'row',
              gap: 12,
              alignItems: 'stretch',
            }}
          >
            <Pressable
              onPress={startRecording}
              disabled={recordingBusy}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 104,
                borderRadius: 30,
                borderCurve: 'continuous',
                paddingHorizontal: 16,
                paddingVertical: 14,
                justifyContent: 'space-between',
                backgroundColor: theme.colors.overlay,
                borderWidth: 1,
                borderColor: theme.colors.border,
                opacity: recordingVisible ? 0.3 : recordingBusy || pressed ? 0.9 : 1,
                boxShadow: pressed
                  ? '0 10px 20px rgba(15, 23, 42, 0.06)'
                  : '0 16px 28px rgba(15, 23, 42, 0.08)',
              })}
            >
              <View
                style={{
                  width: '100%',
                  aspectRatio: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <View
                  style={{
                    width: 160,
                    height: 160,
                    borderRadius: 48,
                    backgroundColor: theme.colors.cardMuted,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 22px 38px rgba(249, 115, 22, 0.14)',
                  }}
                >
                  <Svg width={92} height={92} viewBox="0 0 44 44" fill="none">
                    <Rect x="14" y="6" width="16" height="21" rx="8" fill="#F97316" />
                    <Path
                      d="M11 21.5C11 27.299 15.701 32 21.5 32C27.299 32 32 27.299 32 21.5"
                      stroke="#F97316"
                      strokeWidth="3.2"
                      strokeLinecap="round"
                    />
                    <Path
                      d="M21.5 32V37"
                      stroke="#F97316"
                      strokeWidth="3.2"
                      strokeLinecap="round"
                    />
                    <Path
                      d="M16.5 37H26.5"
                      stroke="#F97316"
                      strokeWidth="3.2"
                      strokeLinecap="round"
                    />
                    <Path
                      d="M8 16.5V26.5"
                      stroke="#FDBA74"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                    />
                    <Path
                      d="M36 16.5V26.5"
                      stroke="#FDBA74"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                    />
                  </Svg>
                </View>
              </View>

              <View style={{ gap: 4 }}>
                <Text selectable style={{ fontSize: 9, letterSpacing: 1.2, color: theme.colors.danger, fontWeight: '800', textTransform: 'uppercase' }}>
                  Recording
                </Text>
                <Text selectable style={{ fontSize: 18, lineHeight: 22, color: theme.colors.text, fontWeight: '800' }}>
                  Record lecture
                </Text>
              </View>
            </Pressable>

            <View style={{ gap: 12 }}>
              <CurrentCourseCarousel
                cards={courseCards}
                onSelect={handleSelectCourse}
                selectedCourseId={selectedCourseId}
                width={Math.max(152, width * 0.36)}
              />

              <View
                style={{
                  flex: 1,
                  minHeight: 58,
                  borderRadius: 24,
                  borderCurve: 'continuous',
                  padding: 12,
                  justifyContent: 'center',
                  alignItems: 'center',
                  backgroundColor: theme.colors.overlay,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  boxShadow: '0 14px 30px rgba(15, 23, 42, 0.10)',
                }}
              >
                <Text selectable style={{ fontSize: 32, textAlign: 'center' }}>🧠</Text>
                <Text selectable style={{ marginTop: 4, fontSize: 14, color: theme.colors.textMuted, fontWeight: '700' }}>
                  Exam review
                </Text>
              </View>
            </View>
          </View>

          <View
            style={{
              flexDirection: 'row',
              gap: 10,
            }}
          >
            <StatCard
              disabled={streakBusy}
              icon="🔥"
              label="Streak"
              onPress={handleIncrementStreak}
              scale={statsCardScale}
              theme={theme}
              value={(
                <RollingNumber
                  animatedValue={streakValue}
                  color={theme.colors.text}
                  scale={statsCardScale}
                  value={statsSummary.streakDays}
                />
              )}
            />
            <StatCard
              icon="📈"
              label="Semester"
              scale={statsCardScale}
              theme={theme}
              value={
                <Text
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  numberOfLines={1}
                  selectable
                  style={{
                    color: theme.colors.text,
                    fontSize: 22 * statsCardScale,
                    fontWeight: '800',
                    lineHeight: 26 * statsCardScale,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {statsSummary.progressPercent}%
                </Text>
              }
            />
            <StatCard
              icon="📚"
              label="Courses"
              scale={statsCardScale}
              theme={theme}
              value={
                <Text
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  numberOfLines={1}
                  selectable
                  style={{
                    color: theme.colors.text,
                    fontSize: 22 * statsCardScale,
                    fontWeight: '800',
                    lineHeight: 26 * statsCardScale,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {statsSummary.coursesThisSemester}
                </Text>
              }
            />
          </View>

          <View
            style={{
              borderRadius: 30,
              borderCurve: 'continuous',
              padding: 16,
              gap: 12,
              backgroundColor: theme.colors.overlay,
              borderWidth: 1,
              borderColor: theme.colors.border,
              boxShadow: '0 20px 44px rgba(15, 23, 42, 0.12)',
            }}
          >
            <View
              style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <Text selectable style={{ color: theme.colors.text, fontSize: 22, fontWeight: '800' }}>
                Quick quiz
              </Text>
              <View
                style={{
                  borderRadius: 999,
                  paddingHorizontal: 11,
                  paddingVertical: 7,
                  backgroundColor: theme.colors.accentSoft,
                }}
              >
                <Text
                  selectable
                  style={{ color: theme.colors.accentMuted, fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] }}
                >
                  04/10
                </Text>
              </View>
            </View>

            <View
              style={{
                height: 94,
                borderRadius: 22,
                borderCurve: 'continuous',
                padding: 14,
                justifyContent: 'center',
                backgroundColor: theme.colors.cardMuted,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Text
                selectable
                adjustsFontSizeToFit
                minimumFontScale={0.72}
                numberOfLines={3}
                style={{
                  color: theme.colors.text,
                  fontSize: isCompact ? 20 : 22,
                  lineHeight: isCompact ? 24 : 26,
                  fontWeight: '800',
                }}
              >
                Which LectrAI component retrieves relevant lecture segments before generating a grounded answer?
              </Text>
            </View>

            <View style={{ gap: 8 }}>
              {quizOptions.map((option, index) => (
                <View
                  key={option}
                  style={{
                    minHeight: 58,
                    borderRadius: 18,
                    borderCurve: 'continuous',
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    flexDirection: 'row',
                    gap: 10,
                    alignItems: 'center',
                    backgroundColor: index === 1 ? theme.colors.successSoft : theme.colors.neutralSoft,
                    borderWidth: 1,
                    borderColor: index === 1 ? theme.colors.successBorder : theme.colors.neutralBorder,
                  }}
                >
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: index === 1 ? theme.colors.success : theme.colors.neutralBorder,
                    }}
                  >
                    <Text selectable style={{ color: index === 1 ? '#ffffff' : theme.colors.textMuted, fontSize: 13, fontWeight: '800' }}>
                      {String.fromCharCode(65 + index)}
                    </Text>
                  </View>
                  <Text
                    selectable
                    adjustsFontSizeToFit
                    minimumFontScale={0.82}
                    numberOfLines={2}
                    style={{
                      flex: 1,
                      color: theme.colors.text,
                      fontSize: 14,
                      lineHeight: 18,
                      fontWeight: index === 1 ? '700' : '600',
                    }}
                  >
                    {option}
                  </Text>
                </View>
              ))}
            </View>
          </View>

        </ScrollView>
      </Animated.View>

      {recordingVisible ? (
        <Animated.View
          style={{
            position: 'absolute',
            inset: 0,
            opacity: overlayOpacity,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 20,
          }}
        >
          <BlurView
            intensity={55}
            tint={theme.resolvedMode === 'dark' ? 'dark' : 'light'}
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: theme.resolvedMode === 'dark' ? 'rgba(10, 13, 16, 0.54)' : 'rgba(248, 250, 252, 0.36)',
            }}
          />

          <Animated.View
            style={{
              width: Math.min(width - 40, 360),
              borderRadius: 34,
              borderCurve: 'continuous',
              padding: 24,
              backgroundColor: theme.colors.card,
              borderWidth: 1,
              borderColor: theme.colors.border,
              alignItems: 'center',
              gap: 18,
              boxShadow: '0 24px 48px rgba(15, 23, 42, 0.18)',
              transform: [{ translateY: overlayTranslateY }, { scale: overlayScale }],
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 999,
                backgroundColor: theme.colors.dangerSoft,
              }}
            >
              <Animated.View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  backgroundColor: theme.colors.danger,
                  opacity: recordingPulse.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.45, 1],
                  }),
                }}
              />
              <Text style={{ fontSize: 11, letterSpacing: 1.4, color: theme.colors.danger, fontWeight: '900', textTransform: 'uppercase' }}>
                Recording in progress
              </Text>
            </View>

            <View style={{ alignItems: 'center', justifyContent: 'center', width: 180, height: 180 }}>
              <Animated.View
                style={{
                  position: 'absolute',
                  width: 170,
                  height: 170,
                  borderRadius: 999,
                  backgroundColor: theme.colors.dangerBorder,
                  opacity: pulseOpacity,
                  transform: [{ scale: pulseScale }, { scale: outerRingScale }],
                }}
              />
              <Animated.View
                style={{
                  position: 'absolute',
                  width: 142,
                  height: 142,
                  borderRadius: 999,
                  backgroundColor: 'rgba(254, 202, 202, 0.7)',
                  opacity: micGlowOpacity,
                  transform: [{ scale: pulseScale }, { scale: innerRingScale }],
                }}
              />
              <Animated.View
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: 999,
                  overflow: 'hidden',
                  backgroundColor: micCoreColor,
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 16px 30px rgba(239, 68, 68, 0.28)',
                  transform: [
                    { translateY: micLiveTranslate },
                    { translateY: micFloatTranslateY },
                    { rotate: micFloatRotate },
                    { rotate: micLiveRotate },
                    { scale: micScale },
                  ],
                }}
              >
                <Animated.View
                  style={{
                    position: 'absolute',
                    top: -20,
                    width: 38,
                    height: 150,
                    backgroundColor: 'rgba(255,255,255,0.22)',
                    transform: [{ translateX: shimmerTranslateX }, { rotate: '-18deg' }],
                  }}
                />
                <View
                  style={{
                    width: 34,
                    height: 52,
                    borderRadius: 18,
                    backgroundColor: '#ffffff',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <View
                    style={{
                      width: 8,
                      height: 30,
                      borderRadius: 999,
                      backgroundColor: '#ef4444',
                    }}
                  />
                </View>
                <View
                  style={{
                    width: 5,
                    height: 22,
                    marginTop: 6,
                    borderRadius: 999,
                    backgroundColor: '#ffffff',
                  }}
                />
                <View
                  style={{
                    width: 34,
                    height: 5,
                    marginTop: 5,
                    borderRadius: 999,
                    backgroundColor: '#ffffff',
                  }}
                />
              </Animated.View>
            </View>

            <View style={{ alignItems: 'center', gap: 8 }}>
              <Text
                style={{
                  fontSize: 34,
                  lineHeight: 40,
                  color: theme.colors.text,
                  fontWeight: '900',
                  fontVariant: ['tabular-nums'],
                }}
              >
                {formattedRecordingTime}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 50 }}>
              {waveformHeights.map((height, index) => (
                <View
                  key={`wave-${index}`}
                  style={{
                    width: 8,
                    height,
                    borderRadius: 999,
                    backgroundColor:
                      normalizedMeter > 0.55
                        ? index % 3 === 1
                          ? '#dc2626'
                          : '#ea580c'
                        : index % 3 === 1
                          ? '#ef4444'
                          : '#f97316',
                    opacity: index === 4 ? 1 : 0.84,
                  }}
                />
              ))}
            </View>

            <View style={{ width: '100%', flexDirection: 'row', gap: 12 }}>
              <Pressable
                onPress={() => {
                  void closeRecording(false);
                }}
                disabled={recordingBusy}
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: 52,
                  borderRadius: 18,
                  borderCurve: 'continuous',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.neutralSoft,
                  borderWidth: 1,
                  borderColor: theme.colors.neutralBorder,
                  opacity: pressed ? 0.92 : 1,
                })}
              >
                <Text style={{ color: theme.colors.textMuted, fontSize: 15, fontWeight: '800' }}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  void closeRecording(true);
                }}
                disabled={recordingBusy}
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: 52,
                  borderRadius: 18,
                  borderCurve: 'continuous',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.danger,
                  opacity: pressed ? 0.92 : 1,
                })}
              >
                <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '800' }}>Done</Text>
              </Pressable>
            </View>
          </Animated.View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const EMPTY_STATS: LocalStatsRecord = {
  userId: '',
  streakDays: 0,
  progressPercent: 0,
  coursesThisSemester: 0,
  currentSemesterLabel: '',
  lastIncrementedOn: null,
  syncStatus: 'pending_pull',
  createdAt: null,
  updatedAt: null,
};

function animateStreakValue(
  animatedValue: Animated.Value,
  fromValue: number,
  toValue: number,
  duration: number
) {
  animatedValue.stopAnimation();
  animatedValue.setValue(fromValue);

  Animated.timing(animatedValue, {
    toValue,
    duration,
    easing: Easing.out(Easing.cubic),
    useNativeDriver: false,
  }).start();
}

function StatCard({
  disabled,
  icon,
  label,
  onPress,
  scale,
  theme,
  value,
}: {
  disabled?: boolean;
  icon: string;
  label: string;
  onPress?: () => void;
  scale: number;
  theme: ReturnType<typeof useSettings>['theme'];
  value: ReactNode;
}) {
  const content = (
    <View
      style={{
        width: '100%',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'center',
          justifyContent: 'center',
          gap: 4 * scale,
        }}
      >
        <Text
          numberOfLines={1}
          selectable
          style={{
            fontSize: 15 * scale,
            lineHeight: 17 * scale,
          }}
        >
          {icon}
        </Text>
        <Text
          numberOfLines={1}
          selectable
          style={{
            color: theme.colors.textMuted,
            fontSize: 11 * scale,
            lineHeight: 13 * scale,
            fontWeight: '700',
          }}
        >
          {label}
        </Text>
      </View>
      <View
        style={{
          flex: 1,
          minWidth: 0,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          marginTop: 4 * scale,
        }}
      >
        {value}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => ({
          ...statCardContainerStyle(theme),
          opacity: disabled ? 0.62 : pressed ? 0.92 : 1,
        })}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={statCardContainerStyle(theme)}>{content}</View>;
}

function RollingNumber({
  animatedValue,
  color,
  scale,
  value,
}: {
  animatedValue: Animated.Value;
  color: string;
  scale: number;
  value: number;
}) {
  const safeValue = Math.max(0, value);
  const digitCount = Math.max(MIN_STREAK_DIGITS, String(safeValue).length);
  const places = Array.from({ length: digitCount }, (_, index) =>
    10 ** (digitCount - index - 1)
  );
  const intrinsicWidth = digitCount * DIGIT_WIDTH + (digitCount - 1) * DIGIT_GAP;
  const scaledDigitHeight = DIGIT_HEIGHT * scale;
  const scaledWidth = intrinsicWidth * scale;

  return (
    <View
      style={{
        width: scaledWidth,
        height: scaledDigitHeight,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: intrinsicWidth,
          flexDirection: 'row',
          alignItems: 'center',
          gap: DIGIT_GAP,
          transform: [{ scale }],
        }}
      >
        {places.map((place) => (
          <RollingDigit
            key={place}
            animatedValue={animatedValue}
            color={color}
            place={place}
          />
        ))}
      </View>
    </View>
  );
}

function RollingDigit({
  animatedValue,
  color,
  place,
}: {
  animatedValue: Animated.Value;
  color: string;
  place: number;
}) {
  const translateY = useRef(
    new Animated.Value(-(DIGIT_REPEAT_OFFSET * 10) * DIGIT_HEIGHT)
  ).current;
  const stepRef = useRef(0);

  useEffect(() => {
    stepRef.current = 0;
    translateY.setValue(-(DIGIT_REPEAT_OFFSET * 10) * DIGIT_HEIGHT);

    const listenerId = animatedValue.addListener(({ value }) => {
      const nextStep = Math.floor(Math.max(0, value) / place);

      if (nextStep === stepRef.current) {
        return;
      }

      stepRef.current = nextStep;
      translateY.stopAnimation();
      Animated.timing(translateY, {
        toValue: -(DIGIT_REPEAT_OFFSET * 10 + nextStep) * DIGIT_HEIGHT,
        duration: place === 1 ? 90 : 140,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });

    return () => {
      animatedValue.removeListener(listenerId);
    };
  }, [animatedValue, place, translateY]);

  return (
    <View
      style={{
        width: DIGIT_WIDTH,
        height: DIGIT_HEIGHT,
        overflow: 'hidden',
      }}
    >
      <Animated.View style={{ transform: [{ translateY }] }}>
        {DIGIT_STRIP.map((value, index) => (
          <Text
            key={`${value}-${index}`}
            selectable
            style={{
              height: DIGIT_HEIGHT,
              width: DIGIT_WIDTH,
              color,
              fontSize: 22,
              lineHeight: DIGIT_HEIGHT,
              fontWeight: '800',
              textAlign: 'center',
              fontVariant: ['tabular-nums'],
            }}
          >
            {value}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
const DIGIT_STRIP = Array.from(
  { length: DIGIT_REPEAT_COUNT * DIGITS.length },
  (_, index) => DIGITS[index % DIGITS.length]
);

function getStatsCardScale(stats: Pick<LocalStatsRecord, 'streakDays' | 'progressPercent' | 'coursesThisSemester'>) {
  const longestValueLength = Math.max(
    String(Math.max(0, stats.streakDays)).length,
    `${Math.max(0, stats.progressPercent)}%`.length,
    String(Math.max(0, stats.coursesThisSemester)).length
  );

  if (longestValueLength >= 6) {
    return 0.82;
  }

  if (longestValueLength === 5) {
    return 0.9;
  }

  if (longestValueLength === 4) {
    return 0.96;
  }

  return 1;
}

function statCardContainerStyle(theme: ReturnType<typeof useSettings>['theme']) {
  return {
    flex: 1,
    minHeight: 70,
    borderRadius: 20,
    borderCurve: 'continuous' as const,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    overflow: 'hidden' as const,
    backgroundColor: theme.colors.overlay,
    borderWidth: 1,
    borderColor: theme.colors.border,
    boxShadow: '0 14px 28px rgba(15, 23, 42, 0.10)',
  };
}
