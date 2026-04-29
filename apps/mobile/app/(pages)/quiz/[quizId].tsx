import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { useLocalSearchParams } from 'expo-router';
import LottieView from 'lottie-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import quizCompletedAnimation from '../../../assets/animations/quiz-completed.json';
import quickQuizAnimation from '../../../assets/animations/quick-quiz.json';
import buttonPressSoundFx from '../../../assets/animations/soundfx/button-press-soundfx.mp3';
import poppingAnimationSoundFx from '../../../assets/animations/soundfx/popping-animation-soundfx.mp3';
import { getResponsiveStudyLayout } from '../../../components/study/responsive-study-layout';
import { useAuth } from '../../../providers/auth-provider';
import { useSettings } from '../../../providers/settings-provider';
import {
  fetchQuizById,
  submitQuizAttempt,
  type RemoteDailyQuickQuizAttemptRecord,
  type RemoteStoredQuizBundle,
  type RemoteStoredQuizRecord,
} from '../../../services/quick-quiz-api';
import { triggerCompletionHaptic } from '../../../services/haptics';

type QuizAnswerState = {
  questionId: string;
  selectedOptionId: string;
  isCorrect: boolean;
};

export default function QuizDetailRoute() {
  const settingsState = useSettings();
  const theme = settingsState.theme;
  const { width: screenWidth } = useWindowDimensions();
  const auth = useAuth();
  const { quizId } = useLocalSearchParams<{ quizId?: string }>();
  const [quiz, setQuiz] = useState<RemoteStoredQuizRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswerState[]>([]);
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [finishCelebrationVisible, setFinishCelebrationVisible] = useState(false);
  const startedAtRef = useRef(Date.now());
  const optionPressPlayer = useAudioPlayer(buttonPressSoundFx);
  const completionPlayer = useAudioPlayer(poppingAnimationSoundFx);

  useEffect(() => {
    void setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadQuiz = async () => {
      if (auth.status !== 'authenticated') {
        setLoading(false);
        setErrorMessage('Sign in again to open this quiz.');
        return;
      }

      if (!quizId || typeof quizId !== 'string') {
        setLoading(false);
        setErrorMessage('Quiz id is missing.');
        return;
      }

      try {
        setLoading(true);
        setErrorMessage(null);
        const accessToken = await auth.getValidAccessToken();

        if (!accessToken) {
          throw new Error('Your session expired. Please sign in again.');
        }

        const bundle = await fetchQuizById(accessToken, quizId);

        if (cancelled) {
          return;
        }

        hydrateQuizState(bundle);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Could not load this quiz.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadQuiz();

    return () => {
      cancelled = true;
    };
  }, [auth, quizId]);

  const currentQuestion = quiz?.questions[questionIndex] ?? null;
  const answerMap = useMemo(() => new Map(answers.map((answer) => [answer.questionId, answer])), [answers]);
  const currentAnswer = currentQuestion ? answerMap.get(currentQuestion.id) ?? null : null;
  const questionCount = quiz?.questionCount ?? quiz?.questions.length ?? 0;
  const answeredCount = answers.length;
  const score = answers.filter((answer) => answer.isCorrect).length;
  const missedCount = Math.max(0, answeredCount - score);
  const progressRatio = questionCount > 0 ? answeredCount / questionCount : 0;
  const subtitleLayout = getResponsiveStudyLayout(getQuizSubtitle(quiz), {
    screenWidth,
    baseFontSize: 14,
    minFontSize: 12,
    baseLineHeight: 20,
    minLineHeight: 17,
    shrinkStartWords: 7,
    shrinkWordsPerStep: 4,
  });
  const questionLayout = getResponsiveStudyLayout(currentQuestion?.questionText, {
    screenWidth,
    baseFontSize: 22,
    minFontSize: 17,
    baseLineHeight: 28,
    minLineHeight: 22,
    shrinkStartWords: 12,
    shrinkWordsPerStep: 5,
    baseMinHeight: 136,
    expandStartWords: 24,
    expandWordsPerStep: 8,
    expandHeightStep: 26,
    maxExtraHeight: 156,
  });
  const explanationLayout = getResponsiveStudyLayout(currentQuestion?.explanation, {
    screenWidth,
    baseFontSize: 14,
    minFontSize: 13,
    baseLineHeight: 20,
    minLineHeight: 18,
    shrinkStartWords: 18,
    shrinkWordsPerStep: 10,
    baseMinHeight: 72,
    expandStartWords: 28,
    expandWordsPerStep: 12,
    expandHeightStep: 18,
    maxExtraHeight: 72,
  });

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

  const handleAdvance = async () => {
    if (!quiz || !currentAnswer || submitting) {
      return;
    }

    if (questionIndex >= quiz.questions.length - 1) {
      await handleSubmitAttempt();
      return;
    }

    setQuestionIndex((current) => Math.min(current + 1, quiz.questions.length - 1));
  };

  const handleRestart = () => {
    setAnswers([]);
    setQuestionIndex(0);
    setQuizCompleted(false);
    setErrorMessage(null);
    setFinishCelebrationVisible(false);
    startedAtRef.current = Date.now();
  };

  const hydrateQuizState = (bundle: RemoteStoredQuizBundle) => {
    setQuiz(bundle.quiz);

    if (!bundle.attempt?.isCompleted) {
      setAnswers([]);
      setQuestionIndex(0);
      setQuizCompleted(false);
      startedAtRef.current = Date.now();
      return;
    }

    const restoredAnswers = buildRestoredAnswers(bundle.quiz, bundle.attempt);
    setAnswers(restoredAnswers);
    setQuestionIndex(Math.max(0, bundle.quiz.questions.length - 1));
    setQuizCompleted(true);
  };

  const handleSubmitAttempt = async () => {
    if (!quiz || auth.status !== 'authenticated' || submitting) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      triggerCompletionHaptic();
      if (settingsState.settings?.permissions.soundFx) {
        void completionPlayer
          .seekTo(0)
          .catch(() => null)
          .finally(() => {
            completionPlayer.play();
          });
      }

      setFinishCelebrationVisible(true);

      const accessToken = await auth.getValidAccessToken();

      if (!accessToken) {
        throw new Error('Your session expired. Please sign in again.');
      }

      const result = await submitQuizAttempt(accessToken, {
        quizId: quiz.id,
        answers: answers.map((answer) => ({
          questionId: answer.questionId,
          selectedOptionId: answer.selectedOptionId,
        })),
        timeSpentSeconds: Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)),
      });

      hydrateQuizState(result);
    } catch (error) {
      setFinishCelebrationVisible(false);
      setErrorMessage(error instanceof Error ? error.message : 'Could not save your quiz results.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.screen }}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          style={{ backgroundColor: theme.colors.screen }}
          contentContainerStyle={{
            flexGrow: 1,
            padding: 16,
            gap: 16,
            paddingBottom: 36,
            backgroundColor: theme.colors.screen,
          }}
        >
          <View
            style={{
              alignSelf: 'flex-end',
              minWidth: 72,
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 8,
              alignItems: 'center',
              backgroundColor: theme.colors.accentSoft,
            }}
          >
            <Text style={{ color: theme.colors.accentMuted, fontSize: 12, fontWeight: '800' }}>
              {quiz ? `${answeredCount}/${questionCount}` : 'Quiz'}
            </Text>
          </View>

          <View
            style={{
              borderRadius: 28,
              borderCurve: 'continuous',
              padding: 18,
              gap: 14,
              backgroundColor: theme.colors.overlay,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={{ color: theme.colors.text, fontSize: 30, lineHeight: 34, fontWeight: '900' }}>
                  Quiz
                </Text>
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontSize: subtitleLayout.fontSize,
                    lineHeight: subtitleLayout.lineHeight,
                    fontWeight: '700',
                  }}
                >
                  {getQuizSubtitle(quiz)}
                </Text>
              </View>
              <LottieView autoPlay loop source={quickQuizAnimation} style={{ width: 74, height: 74 }} />
            </View>

            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
              <Pill label={`${questionCount || 0} questions`} backgroundColor={theme.colors.cardMuted} textColor={theme.colors.text} />
              <Pill
                label={`${quiz?.estimatedMinutes ?? Math.max(1, questionCount * 2)} min`}
                backgroundColor={theme.colors.cardMuted}
                textColor={theme.colors.text}
              />
              <Pill
                label={formatDifficultyLabel(quiz?.difficulty)}
                backgroundColor={theme.colors.accentSoft}
                textColor={theme.colors.accentMuted}
              />
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
                  width: `${Math.max(answeredCount > 0 ? 8 : 0, progressRatio * 100)}%`,
                  height: '100%',
                  borderRadius: 999,
                  backgroundColor: theme.colors.accent,
                }}
              />
            </View>
          </View>

          {loading ? (
            <StateCard theme={theme} message="Loading quiz..." />
          ) : errorMessage ? (
            <StateCard theme={theme} message={errorMessage} tone="error" />
          ) : !quiz || !currentQuestion ? (
            <StateCard theme={theme} message="This quiz is empty." />
          ) : quizCompleted ? (
            <View
              style={{
                borderRadius: 28,
                borderCurve: 'continuous',
                paddingHorizontal: 20,
                paddingVertical: 24,
                alignItems: 'center',
                gap: 14,
                backgroundColor: theme.colors.overlay,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <LottieView autoPlay loop source={quizCompletedAnimation} style={{ width: 190, height: 190 }} />
              <Text
                style={{
                  color: theme.colors.text,
                  fontSize: 24,
                  lineHeight: 30,
                  fontWeight: '900',
                  textAlign: 'center',
                }}
              >
                Quiz complete
              </Text>
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontSize: 16,
                  lineHeight: 22,
                  fontWeight: '700',
                  textAlign: 'center',
                }}
              >
                {`You scored ${score}/${questionCount} on this quiz.`}
              </Text>

              <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                <ResultPill
                  label="Correct"
                  value={score.toString()}
                  backgroundColor={theme.colors.successSoft}
                  borderColor={theme.colors.successBorder}
                  textColor={theme.colors.success}
                />
                <ResultPill
                  label="Missed"
                  value={missedCount.toString()}
                  backgroundColor={theme.colors.dangerSoft}
                  borderColor={theme.colors.dangerBorder}
                  textColor={theme.colors.danger}
                />
                <ResultPill
                  label="Quiz"
                  value="linked"
                  backgroundColor={theme.colors.cardMuted}
                  borderColor={theme.colors.border}
                  textColor={theme.colors.text}
                />
              </View>

              <Pressable
                onPress={handleRestart}
                style={({ pressed }) => ({
                  minHeight: 54,
                  minWidth: 220,
                  borderRadius: 18,
                  borderCurve: 'continuous',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 20,
                  backgroundColor: pressed ? theme.colors.accentMuted : theme.colors.accent,
                })}
              >
                <Text style={{ color: theme.colors.accentContrast, fontSize: 16, fontWeight: '900' }}>
                  Restart quiz
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View
                style={{
                  borderRadius: 28,
                  borderCurve: 'continuous',
                  padding: 18,
                  gap: 14,
                  backgroundColor: theme.colors.overlay,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Text style={{ color: theme.colors.textMuted, fontSize: 13, fontWeight: '800' }}>
                  {`Question ${questionIndex + 1} of ${questionCount}`}
                </Text>

                <View
                  style={{
                    minHeight: questionLayout.minHeight,
                    borderRadius: 22,
                    borderCurve: 'continuous',
                    paddingHorizontal: 18,
                    paddingVertical: 16,
                    justifyContent: 'center',
                    backgroundColor: theme.colors.cardMuted,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontSize: questionLayout.fontSize,
                      lineHeight: questionLayout.lineHeight,
                      fontWeight: '900',
                    }}
                  >
                    {currentQuestion.questionText}
                  </Text>
                </View>

                <View style={{ gap: 10 }}>
                  {currentQuestion.options.map((option, index) => (
                    <ResponsiveQuizOption
                      key={option.id ?? `${option.optionText}-${index}`}
                      optionText={option.optionText}
                      screenWidth={screenWidth}
                      disabled={Boolean(currentAnswer) || submitting}
                      onPress={() => handleSelectOption(option.id)}
                      backgroundColor={getOptionBackgroundColor({
                        option,
                        answer: currentAnswer,
                        theme,
                      })}
                      borderColor={getOptionBorderColor({
                        option,
                        answer: currentAnswer,
                        theme,
                      })}
                      opacity={submitting ? 0.72 : 1}
                      textColor={theme.colors.text}
                      badgeColor={getOptionBadgeColor({
                        option,
                        answer: currentAnswer,
                        theme,
                      })}
                      badgeLabel={option.optionLabel ?? String.fromCharCode(65 + index)}
                      isSelected={currentAnswer?.selectedOptionId === option.id}
                    >
                      {option.optionText}
                    </ResponsiveQuizOption>
                  ))}
                </View>

                {currentAnswer ? (
                  <View
                    style={{
                      borderRadius: 18,
                      borderCurve: 'continuous',
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      backgroundColor: currentAnswer.isCorrect ? theme.colors.successSoft : theme.colors.dangerSoft,
                      borderWidth: 1,
                      borderColor: currentAnswer.isCorrect ? theme.colors.successBorder : theme.colors.dangerBorder,
                      gap: 6,
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
                    {currentQuestion.explanation ? (
                      <View style={{ minHeight: explanationLayout.minHeight, justifyContent: 'center' }}>
                        <Text
                          style={{
                            color: theme.colors.text,
                            fontSize: explanationLayout.fontSize,
                            lineHeight: explanationLayout.lineHeight,
                            fontWeight: '600',
                          }}
                        >
                          {currentQuestion.explanation}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <Text
                  style={{
                    flex: 1,
                    color: theme.colors.textMuted,
                    fontSize: 13,
                    lineHeight: 18,
                    fontWeight: '700',
                  }}
                >
                  {currentAnswer
                    ? questionIndex >= quiz.questions.length - 1
                      ? 'Review the explanation, then finish the quiz.'
                      : 'Review the explanation, then move to the next question.'
                    : 'Choose one answer. Each question locks after your first tap.'}
                </Text>
                {currentAnswer ? (
                  <Pressable
                    disabled={submitting}
                    onPress={() => {
                      void handleAdvance();
                    }}
                    style={({ pressed }) => ({
                      minHeight: 44,
                      borderRadius: 999,
                      paddingHorizontal: 18,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: pressed ? theme.colors.accentMuted : theme.colors.accent,
                      opacity: submitting ? 0.72 : 1,
                    })}
                  >
                    <Text style={{ color: theme.colors.accentContrast, fontSize: 14, fontWeight: '800' }}>
                      {submitting ? 'Saving...' : questionIndex >= quiz.questions.length - 1 ? 'Finish' : 'Next'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </>
          )}
        </ScrollView>

        {finishCelebrationVisible ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255, 248, 240, 0.58)',
            }}
          >
            <LottieView
              autoPlay
              loop={false}
              onAnimationFinish={(isCancelled) => {
                if (!isCancelled) {
                  setFinishCelebrationVisible(false);
                }
              }}
              source={quizCompletedAnimation}
              style={{ width: 280, height: 280 }}
            />
          </View>
        ) : null}
      </View>
  );
}

function buildRestoredAnswers(quiz: RemoteStoredQuizRecord, attempt: RemoteDailyQuickQuizAttemptRecord) {
  return quiz.questions
    .map((question) => {
      const persistedAnswer = attempt.answers.find((answer) => answer.questionId === question.id);
      const selectedOptionId = persistedAnswer?.selectedOptionId ?? null;

      if (!selectedOptionId) {
        return null;
      }

      const selectedOption = question.options.find((option) => option.id === selectedOptionId);

      if (!selectedOption) {
        return null;
      }

      return {
        questionId: question.id,
        selectedOptionId,
        isCorrect: selectedOption.isCorrect,
      };
    })
    .filter((value): value is QuizAnswerState => value != null);
}

function getQuizSubtitle(quiz: RemoteStoredQuizRecord | null) {
  const title = quiz?.title?.trim();

  if (!title) {
    return 'AI-generated practice quiz';
  }

  return title.replace(/\s*[—-]\s*quiz\b/i, '').trim() || title;
}

function formatDifficultyLabel(value: string | null | undefined) {
  if (!value) {
    return 'mixed';
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getOptionBackgroundColor(input: {
  option: RemoteStoredQuizRecord['questions'][number]['options'][number];
  answer: QuizAnswerState | null;
  theme: ReturnType<typeof useSettings>['theme'];
}) {
  const isSelected = input.answer?.selectedOptionId === input.option.id;
  const isCorrect = Boolean(input.answer) && input.option.isCorrect;
  const isWrongSelected = isSelected && Boolean(input.answer) && !input.option.isCorrect;

  if (isCorrect) {
    return input.theme.colors.successSoft;
  }

  if (isWrongSelected) {
    return input.theme.colors.dangerSoft;
  }

  if (isSelected) {
    return input.theme.colors.accentSoft;
  }

  return input.theme.colors.overlay;
}

function getOptionBorderColor(input: {
  option: RemoteStoredQuizRecord['questions'][number]['options'][number];
  answer: QuizAnswerState | null;
  theme: ReturnType<typeof useSettings>['theme'];
}) {
  const isSelected = input.answer?.selectedOptionId === input.option.id;
  const isCorrect = Boolean(input.answer) && input.option.isCorrect;
  const isWrongSelected = isSelected && Boolean(input.answer) && !input.option.isCorrect;

  if (isCorrect) {
    return input.theme.colors.successBorder;
  }

  if (isWrongSelected) {
    return input.theme.colors.dangerBorder;
  }

  if (isSelected) {
    return input.theme.colors.accentBorder;
  }

  return input.theme.colors.border;
}

function getOptionBadgeColor(input: {
  option: RemoteStoredQuizRecord['questions'][number]['options'][number];
  answer: QuizAnswerState | null;
  theme: ReturnType<typeof useSettings>['theme'];
}) {
  const isSelected = input.answer?.selectedOptionId === input.option.id;
  const isCorrect = Boolean(input.answer) && input.option.isCorrect;
  const isWrongSelected = isSelected && Boolean(input.answer) && !input.option.isCorrect;

  if (isCorrect) {
    return input.theme.colors.success;
  }

  if (isWrongSelected) {
    return input.theme.colors.danger;
  }

  if (isSelected) {
    return input.theme.colors.accentMuted;
  }

  return input.theme.colors.accent;
}

function Pill(input: { label: string; backgroundColor: string; textColor: string }) {
  return (
    <View
      style={{
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 7,
        backgroundColor: input.backgroundColor,
      }}
    >
      <Text style={{ color: input.textColor, fontSize: 12, fontWeight: '800' }}>{input.label}</Text>
    </View>
  );
}

function ResultPill(input: {
  label: string;
  value: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
}) {
  return (
    <View
      style={{
        minWidth: 82,
        borderRadius: 18,
        borderCurve: 'continuous',
        paddingHorizontal: 14,
        paddingVertical: 12,
        gap: 4,
        alignItems: 'center',
        backgroundColor: input.backgroundColor,
        borderWidth: 1,
        borderColor: input.borderColor,
      }}
    >
      <Text style={{ color: input.textColor, fontSize: 12, fontWeight: '800' }}>{input.label}</Text>
      <Text style={{ color: input.textColor, fontSize: 24, lineHeight: 26, fontWeight: '900' }}>{input.value}</Text>
    </View>
  );
}

function ResponsiveQuizOption(input: {
  optionText: string;
  screenWidth: number;
  disabled: boolean;
  onPress: () => void;
  backgroundColor: string;
  borderColor: string;
  opacity: number;
  textColor: string;
  badgeColor: string;
  badgeLabel: string;
  isSelected: boolean;
  children: string;
}) {
  const optionLayout = getResponsiveStudyLayout(input.optionText, {
    screenWidth: input.screenWidth,
    baseFontSize: 15,
    minFontSize: 13,
    baseLineHeight: 20,
    minLineHeight: 18,
    shrinkStartWords: 8,
    shrinkWordsPerStep: 4,
    baseMinHeight: 62,
    expandStartWords: 16,
    expandWordsPerStep: 6,
    expandHeightStep: 14,
    maxExtraHeight: 70,
  });

  return (
    <Pressable
      disabled={input.disabled}
      onPress={input.onPress}
      style={{
        minHeight: optionLayout.minHeight,
        borderRadius: 18,
        borderCurve: 'continuous',
        paddingHorizontal: 14,
        paddingVertical: 12,
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
        backgroundColor: input.backgroundColor,
        borderWidth: 1,
        borderColor: input.borderColor,
        opacity: input.opacity,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: input.badgeColor,
        }}
      >
        <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '900' }}>{input.badgeLabel}</Text>
      </View>
      <Text
        style={{
          flex: 1,
          color: input.textColor,
          fontSize: optionLayout.fontSize,
          lineHeight: optionLayout.lineHeight,
          fontWeight: input.isSelected ? '800' : '600',
        }}
      >
        {input.children}
      </Text>
    </Pressable>
  );
}

function StateCard(input: {
  theme: ReturnType<typeof useSettings>['theme'];
  message: string;
  tone?: 'default' | 'error';
}) {
  return (
    <View
      style={{
        borderRadius: 24,
        borderCurve: 'continuous',
        paddingHorizontal: 18,
        paddingVertical: 20,
        backgroundColor: input.theme.colors.overlay,
        borderWidth: 1,
        borderColor: input.tone === 'error' ? input.theme.colors.dangerBorder : input.theme.colors.border,
      }}
    >
      <Text
        style={{
          color: input.tone === 'error' ? input.theme.colors.danger : input.theme.colors.textMuted,
          fontSize: 14,
          lineHeight: 20,
          fontWeight: '700',
        }}
      >
        {input.message}
      </Text>
    </View>
  );
}
