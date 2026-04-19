import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import LottieView from 'lottie-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { NativeBackButton } from '../../../../components/ui/native-back-button';
import quickQuizAnimation from '../../../../assets/animations/quick-quiz.json';
import buttonPressSoundFx from '../../../../assets/animations/soundfx/button-press-soundfx.mp3';
import poppingAnimationSoundFx from '../../../../assets/animations/soundfx/popping-animation-soundfx.mp3';
import { useSettings } from '../../../../providers/settings-provider';

type MockQuizOption = {
  id: string;
  label: string;
  text: string;
  isCorrect: boolean;
};

type MockQuizQuestion = {
  id: string;
  questionText: string;
  explanation: string;
  options: MockQuizOption[];
};

type QuizAnswerState = {
  questionId: string;
  selectedOptionId: string;
  isCorrect: boolean;
};

type MockQuiz = {
  id: string;
  title: string;
  subtitle: string;
  estimatedMinutes: number;
  questionCount: number;
  questions: MockQuizQuestion[];
};

const MOCK_DYNAMIC_QUIZ: MockQuiz = {
  id: 'mock-dynamic-quiz-1',
  title: 'Dynamic Quiz Mode',
  subtitle: 'Full-screen mock quiz flow for course practice',
  estimatedMinutes: 8,
  questionCount: 10,
  questions: [
    {
      id: 'q1',
      questionText: 'Which layer of the OSI model handles end-to-end delivery between applications?',
      explanation: 'The transport layer is responsible for host-to-host delivery, reliability, and flow control.',
      options: [
        { id: 'q1-a', label: 'A', text: 'Network', isCorrect: false },
        { id: 'q1-b', label: 'B', text: 'Transport', isCorrect: true },
        { id: 'q1-c', label: 'C', text: 'Data link', isCorrect: false },
        { id: 'q1-d', label: 'D', text: 'Physical', isCorrect: false },
      ],
    },
    {
      id: 'q2',
      questionText: 'What is the time complexity of binary search on a sorted array?',
      explanation: 'Binary search halves the search space each step, which gives logarithmic time.',
      options: [
        { id: 'q2-a', label: 'A', text: 'O(n)', isCorrect: false },
        { id: 'q2-b', label: 'B', text: 'O(log n)', isCorrect: true },
        { id: 'q2-c', label: 'C', text: 'O(n log n)', isCorrect: false },
        { id: 'q2-d', label: 'D', text: 'O(1)', isCorrect: false },
      ],
    },
    {
      id: 'q3',
      questionText: 'Which SQL clause filters grouped results after aggregation?',
      explanation: 'HAVING applies conditions after GROUP BY has produced grouped rows.',
      options: [
        { id: 'q3-a', label: 'A', text: 'WHERE', isCorrect: false },
        { id: 'q3-b', label: 'B', text: 'ORDER BY', isCorrect: false },
        { id: 'q3-c', label: 'C', text: 'HAVING', isCorrect: true },
        { id: 'q3-d', label: 'D', text: 'LIMIT', isCorrect: false },
      ],
    },
    {
      id: 'q4',
      questionText: 'What does immutability primarily help with in React state updates?',
      explanation: 'Immutable updates make change detection predictable and reduce accidental shared-state mutations.',
      options: [
        { id: 'q4-a', label: 'A', text: 'It removes the need for re-renders', isCorrect: false },
        { id: 'q4-b', label: 'B', text: 'It guarantees constant-time rendering', isCorrect: false },
        { id: 'q4-c', label: 'C', text: 'It makes state changes easier to detect safely', isCorrect: true },
        { id: 'q4-d', label: 'D', text: 'It prevents asynchronous code entirely', isCorrect: false },
      ],
    },
    {
      id: 'q5',
      questionText: 'Which HTTP status code usually represents a successful resource creation?',
      explanation: '201 Created is the standard success response for creating a new resource.',
      options: [
        { id: 'q5-a', label: 'A', text: '200', isCorrect: false },
        { id: 'q5-b', label: 'B', text: '201', isCorrect: true },
        { id: 'q5-c', label: 'C', text: '204', isCorrect: false },
        { id: 'q5-d', label: 'D', text: '302', isCorrect: false },
      ],
    },
    {
      id: 'q6',
      questionText: 'In Git, which command stage moves tracked file changes into the index?',
      explanation: 'git add stages changes so they are included in the next commit.',
      options: [
        { id: 'q6-a', label: 'A', text: 'git push', isCorrect: false },
        { id: 'q6-b', label: 'B', text: 'git merge', isCorrect: false },
        { id: 'q6-c', label: 'C', text: 'git add', isCorrect: true },
        { id: 'q6-d', label: 'D', text: 'git fetch', isCorrect: false },
      ],
    },
    {
      id: 'q7',
      questionText: 'What is the primary role of an index in a relational database?',
      explanation: 'Indexes trade storage and write cost for faster lookups on queried columns.',
      options: [
        { id: 'q7-a', label: 'A', text: 'To validate JSON payloads', isCorrect: false },
        { id: 'q7-b', label: 'B', text: 'To speed up data retrieval', isCorrect: true },
        { id: 'q7-c', label: 'C', text: 'To encrypt rows automatically', isCorrect: false },
        { id: 'q7-d', label: 'D', text: 'To replace foreign keys', isCorrect: false },
      ],
    },
    {
      id: 'q8',
      questionText: 'Which data structure uses FIFO ordering?',
      explanation: 'A queue processes items in first-in, first-out order.',
      options: [
        { id: 'q8-a', label: 'A', text: 'Stack', isCorrect: false },
        { id: 'q8-b', label: 'B', text: 'Queue', isCorrect: true },
        { id: 'q8-c', label: 'C', text: 'Tree', isCorrect: false },
        { id: 'q8-d', label: 'D', text: 'Graph', isCorrect: false },
      ],
    },
    {
      id: 'q9',
      questionText: 'Which React hook is intended for side effects like subscriptions or timers?',
      explanation: 'useEffect is designed for synchronizing with systems outside rendering.',
      options: [
        { id: 'q9-a', label: 'A', text: 'useEffect', isCorrect: true },
        { id: 'q9-b', label: 'B', text: 'useState', isCorrect: false },
        { id: 'q9-c', label: 'C', text: 'useRef', isCorrect: false },
        { id: 'q9-d', label: 'D', text: 'useId', isCorrect: false },
      ],
    },
    {
      id: 'q10',
      questionText: 'Which statement best describes normalization in database design?',
      explanation: 'Normalization reduces redundancy and update anomalies by organizing data into related tables.',
      options: [
        { id: 'q10-a', label: 'A', text: 'It duplicates records for faster inserts', isCorrect: false },
        { id: 'q10-b', label: 'B', text: 'It removes all joins from a schema', isCorrect: false },
        { id: 'q10-c', label: 'C', text: 'It organizes data to reduce redundancy', isCorrect: true },
        { id: 'q10-d', label: 'D', text: 'It converts SQL into NoSQL', isCorrect: false },
      ],
    },
  ],
};

export default function DynamicQuizRoute() {
  const { courseId, courseName } = useLocalSearchParams<{
    courseId?: string;
    courseName?: string;
  }>();
  const settingsState = useSettings();
  const theme = settingsState.theme;
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswerState[]>([]);
  const [quizCompleted, setQuizCompleted] = useState(false);
  const optionPressPlayer = useAudioPlayer(buttonPressSoundFx);
  const completionPlayer = useAudioPlayer(poppingAnimationSoundFx);

  const currentQuestion = MOCK_DYNAMIC_QUIZ.questions[questionIndex] ?? null;
  const answerMap = useMemo(
    () => new Map(answers.map((answer) => [answer.questionId, answer])),
    [answers]
  );
  const currentAnswer = currentQuestion ? answerMap.get(currentQuestion.id) ?? null : null;
  const score = answers.filter((answer) => answer.isCorrect).length;
  const isFinished = quizCompleted;
  const answeredCount = answers.length;
  const progressRatio = answeredCount / MOCK_DYNAMIC_QUIZ.questionCount;
  const displayCourseName =
    typeof courseName === 'string' && courseName.trim().length > 0 ? courseName : 'Selected course';

  useEffect(() => {
    void setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    });
  }, []);

  const handleSelectOption = (optionId: string) => {
    if (!currentQuestion || currentAnswer) {
      return;
    }

    const selectedOption = currentQuestion.options.find((option) => option.id === optionId);

    if (!selectedOption) {
      return;
    }

    if (settingsState.settings?.permissions.soundFx) {
      void optionPressPlayer
        .seekTo(0)
        .catch(() => null)
        .finally(() => {
          optionPressPlayer.play();
        });
    }

    setAnswers((current) => [
      ...current,
      {
        questionId: currentQuestion.id,
        selectedOptionId: selectedOption.id,
        isCorrect: selectedOption.isCorrect,
      },
    ]);
  };

  const handleAdvance = () => {
    if (!currentAnswer) {
      return;
    }

    if (questionIndex >= MOCK_DYNAMIC_QUIZ.questions.length - 1) {
      if (settingsState.settings?.permissions.soundFx) {
        void completionPlayer
          .seekTo(0)
          .catch(() => null)
          .finally(() => {
            completionPlayer.play();
          });
      }
      setQuizCompleted(true);
      return;
    }

    setQuestionIndex((current) => Math.min(current + 1, MOCK_DYNAMIC_QUIZ.questions.length - 1));
  };

  const handleRestart = () => {
    setAnswers([]);
    setQuestionIndex(0);
    setQuizCompleted(false);
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={{ flex: 1, backgroundColor: theme.colors.screen }}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          style={{ backgroundColor: theme.colors.screen }}
          contentContainerStyle={{
            flexGrow: 1,
            padding: 16,
            paddingBottom: 32,
            gap: 16,
            backgroundColor: theme.colors.screen,
          }}
        >
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 22,
              right: -26,
              width: 190,
              height: 190,
              borderRadius: 999,
              backgroundColor: 'rgba(255, 106, 0, 0.10)',
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              bottom: 110,
              left: -30,
              width: 170,
              height: 170,
              borderRadius: 999,
              backgroundColor: 'rgba(251, 191, 36, 0.08)',
            }}
          />

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              paddingTop: 4,
            }}
            >
              <NativeBackButton theme={theme} onPress={() => router.back()} />

            <View
              style={{
                minWidth: 62,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 8,
                alignItems: 'center',
                backgroundColor: theme.colors.accentSoft,
              }}
            >
              <Text style={{ color: theme.colors.accentMuted, fontSize: 12, fontWeight: '800' }}>
                {`${answeredCount}/${MOCK_DYNAMIC_QUIZ.questionCount}`}
              </Text>
            </View>
          </View>

          <View
            style={{
              borderRadius: 30,
              borderCurve: 'continuous',
              padding: 18,
              gap: 16,
              overflow: 'hidden',
              backgroundColor: theme.colors.overlay,
              borderWidth: 1,
              borderColor: theme.colors.border,
              boxShadow: '0 20px 44px rgba(15, 23, 42, 0.12)',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={{ color: theme.colors.text, fontSize: 26, lineHeight: 30, fontWeight: '900' }}>
                  Quiz
                </Text>
                <Text style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 20, fontWeight: '600' }}>
                  {displayCourseName}
                </Text>
              </View>

              <LottieView
                autoPlay
                loop
                source={quickQuizAnimation}
                style={{ width: 86, height: 86 }}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pill label={`${MOCK_DYNAMIC_QUIZ.questionCount} questions`} themeColor={theme.colors.cardMuted} textColor={theme.colors.text} />
              <Pill label={`${MOCK_DYNAMIC_QUIZ.estimatedMinutes} min`} themeColor={theme.colors.cardMuted} textColor={theme.colors.text} />
              <Pill label={courseId ? 'Course-linked' : 'Mock'} themeColor={theme.colors.accentSoft} textColor={theme.colors.accentMuted} />
            </View>

            <View
              style={{
                height: 10,
                borderRadius: 999,
                overflow: 'hidden',
                backgroundColor: theme.colors.cardMuted,
              }}
            >
              <View
                style={{
                  width: `${Math.max(6, progressRatio * 100)}%`,
                  height: '100%',
                  borderRadius: 999,
                  backgroundColor: theme.colors.accent,
                }}
              />
            </View>
          </View>

          {!isFinished && currentQuestion ? (
            <>
              <View
                style={{
                  borderRadius: 28,
                  borderCurve: 'continuous',
                  padding: 18,
                  gap: 14,
                  backgroundColor: theme.colors.card,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  boxShadow: '0 14px 28px rgba(15, 23, 42, 0.08)',
                }}
              >
                <Text style={{ color: theme.colors.textMuted, fontSize: 13, fontWeight: '800' }}>
                  {`Question ${questionIndex + 1} of ${MOCK_DYNAMIC_QUIZ.questionCount}`}
                </Text>
                <View
                  style={{
                    borderRadius: 22,
                    borderCurve: 'continuous',
                    padding: 16,
                    backgroundColor: theme.colors.cardMuted,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontSize: 24,
                      lineHeight: 30,
                      fontWeight: '900',
                    }}
                  >
                    {currentQuestion.questionText}
                  </Text>
                </View>

                <View style={{ gap: 10 }}>
                  {currentQuestion.options.map((option) => (
                    <Pressable
                      key={option.id}
                      disabled={Boolean(currentAnswer)}
                      onPress={() => handleSelectOption(option.id)}
                      style={({ pressed }) => ({
                        minHeight: 66,
                        borderRadius: 20,
                        borderCurve: 'continuous',
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        flexDirection: 'row',
                        gap: 12,
                        alignItems: 'center',
                        backgroundColor: getOptionBackgroundColor({
                          option,
                          answer: currentAnswer,
                          theme,
                        }),
                        borderWidth: 1,
                        borderColor: getOptionBorderColor({
                          option,
                          answer: currentAnswer,
                          theme,
                        }),
                        opacity: !currentAnswer && pressed ? 0.92 : 1,
                      })}
                    >
                      <View
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 17,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: getOptionBadgeColor({
                            option,
                            answer: currentAnswer,
                            theme,
                          }),
                        }}
                      >
                        <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '900' }}>{option.label}</Text>
                      </View>

                      <Text
                        style={{
                          flex: 1,
                          color: theme.colors.text,
                          fontSize: 15,
                          lineHeight: 20,
                          fontWeight: currentAnswer?.selectedOptionId === option.id ? '800' : '600',
                        }}
                      >
                        {option.text}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {currentAnswer ? (
                  <View
                    style={{
                      borderRadius: 18,
                      borderCurve: 'continuous',
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      gap: 6,
                      backgroundColor: currentAnswer.isCorrect ? theme.colors.successSoft : theme.colors.dangerSoft,
                      borderWidth: 1,
                      borderColor: currentAnswer.isCorrect ? theme.colors.successBorder : theme.colors.dangerBorder,
                    }}
                  >
                    <Text
                      style={{
                        color: currentAnswer.isCorrect ? theme.colors.success : theme.colors.danger,
                        fontSize: 13,
                        fontWeight: '800',
                      }}
                    >
                      {currentAnswer.isCorrect ? 'Correct answer' : 'Incorrect answer'}
                    </Text>
                    <Text
                      style={{
                        color: theme.colors.text,
                        fontSize: 14,
                        lineHeight: 20,
                        fontWeight: '600',
                      }}
                    >
                      {currentQuestion.explanation}
                    </Text>
                  </View>
                ) : (
                  <Text style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 20, fontWeight: '600' }}>
                    Tap one answer to lock it in. This mock flow behaves like quick quiz, just full-screen.
                  </Text>
                )}
              </View>

              <View
                style={{
                  borderRadius: 28,
                  borderCurve: 'continuous',
                  padding: 18,
                  gap: 12,
                  backgroundColor: theme.colors.card,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  boxShadow: '0 14px 28px rgba(15, 23, 42, 0.08)',
                }}
              >
                <Text style={{ color: theme.colors.textMuted, fontSize: 14, lineHeight: 20, fontWeight: '700' }}>
                  {currentAnswer
                    ? questionIndex === MOCK_DYNAMIC_QUIZ.questions.length - 1
                      ? 'Review the explanation, then finish the quiz.'
                      : 'Review the explanation, then move to the next question.'
                    : 'Quiz data is mocked right now, but the screen is ready to receive dynamic questions and answers.'}
                </Text>

                <Pressable
                  disabled={!currentAnswer}
                  onPress={handleAdvance}
                  style={({ pressed }) => ({
                    minHeight: 56,
                    borderRadius: 20,
                    borderCurve: 'continuous',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: pressed ? theme.colors.accentMuted : theme.colors.accent,
                    opacity: currentAnswer ? 1 : 0.42,
                  })}
                >
                  <Text style={{ color: theme.colors.accentContrast, fontSize: 16, fontWeight: '900' }}>
                    {questionIndex === MOCK_DYNAMIC_QUIZ.questions.length - 1 ? 'Finish quiz' : 'Next question'}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View
              style={{
                borderRadius: 30,
                borderCurve: 'continuous',
                padding: 22,
                gap: 16,
                alignItems: 'center',
                backgroundColor: theme.colors.card,
                borderWidth: 1,
                borderColor: theme.colors.border,
                boxShadow: '0 14px 28px rgba(15, 23, 42, 0.08)',
              }}
            >
              <LottieView
                autoPlay
                loop
                source={quickQuizAnimation}
                style={{ width: 220, height: 220 }}
              />
              <Text
                style={{
                  color: theme.colors.text,
                  fontSize: 28,
                  lineHeight: 32,
                  fontWeight: '900',
                  textAlign: 'center',
                }}
              >
                Quiz complete
              </Text>
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontSize: 15,
                  lineHeight: 22,
                  fontWeight: '700',
                  textAlign: 'center',
                }}
              >
                {`You scored ${score}/${MOCK_DYNAMIC_QUIZ.questionCount} on the mock dynamic quiz.`}
              </Text>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <ResultStat label="Correct" value={`${score}`} tone="success" />
                <ResultStat label="Missed" value={`${MOCK_DYNAMIC_QUIZ.questionCount - score}`} tone="danger" />
                <ResultStat label="Course" value={courseId ? 'linked' : 'mock'} tone="neutral" />
              </View>

              <Pressable
                onPress={handleRestart}
                style={({ pressed }) => ({
                  minWidth: 220,
                  minHeight: 54,
                  borderRadius: 20,
                  borderCurve: 'continuous',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: pressed ? theme.colors.accentMuted : theme.colors.accent,
                })}
              >
                <Text style={{ color: theme.colors.accentContrast, fontSize: 16, fontWeight: '900' }}>
                  Restart mock quiz
                </Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </View>
    </>
  );
}

function Pill({
  label,
  themeColor,
  textColor,
}: {
  label: string;
  themeColor: string;
  textColor: string;
}) {
  return (
    <View
      style={{
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: themeColor,
      }}
    >
      <Text style={{ color: textColor, fontSize: 12, fontWeight: '800' }}>{label}</Text>
    </View>
  );
}

function ResultStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'success' | 'danger' | 'neutral';
}) {
  const settingsState = useSettings();
  const theme = settingsState.theme;

  const backgroundColor =
    tone === 'success'
      ? theme.colors.successSoft
      : tone === 'danger'
        ? theme.colors.dangerSoft
        : theme.colors.cardMuted;
  const borderColor =
    tone === 'success'
      ? theme.colors.successBorder
      : tone === 'danger'
        ? theme.colors.dangerBorder
        : theme.colors.border;
  const valueColor =
    tone === 'success'
      ? theme.colors.success
      : tone === 'danger'
        ? theme.colors.danger
        : theme.colors.text;

  return (
    <View
      style={{
        minWidth: 92,
        borderRadius: 18,
        borderCurve: 'continuous',
        paddingHorizontal: 14,
        paddingVertical: 12,
        alignItems: 'center',
        gap: 4,
        backgroundColor,
        borderWidth: 1,
        borderColor,
      }}
    >
      <Text style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: '800' }}>{label}</Text>
      <Text style={{ color: valueColor, fontSize: 20, fontWeight: '900' }}>{value}</Text>
    </View>
  );
}

function getOptionBackgroundColor(input: {
  option: MockQuizOption;
  answer: QuizAnswerState | null;
  theme: ReturnType<typeof useSettings>['theme'];
}) {
  if (!input.answer) {
    return input.theme.colors.neutralSoft;
  }

  if (input.option.isCorrect) {
    return input.theme.colors.successSoft;
  }

  if (input.answer.selectedOptionId === input.option.id) {
    return input.theme.colors.dangerSoft;
  }

  return input.theme.colors.neutralSoft;
}

function getOptionBorderColor(input: {
  option: MockQuizOption;
  answer: QuizAnswerState | null;
  theme: ReturnType<typeof useSettings>['theme'];
}) {
  if (!input.answer) {
    return input.theme.colors.neutralBorder;
  }

  if (input.option.isCorrect) {
    return input.theme.colors.successBorder;
  }

  if (input.answer.selectedOptionId === input.option.id) {
    return input.theme.colors.dangerBorder;
  }

  return input.theme.colors.neutralBorder;
}

function getOptionBadgeColor(input: {
  option: MockQuizOption;
  answer: QuizAnswerState | null;
  theme: ReturnType<typeof useSettings>['theme'];
}) {
  if (!input.answer) {
    return input.theme.colors.textSubtle;
  }

  if (input.option.isCorrect) {
    return input.theme.colors.success;
  }

  if (input.answer.selectedOptionId === input.option.id) {
    return input.theme.colors.danger;
  }

  return input.theme.colors.textSubtle;
}
