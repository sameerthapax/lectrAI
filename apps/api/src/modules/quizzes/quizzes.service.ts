import { getDb, getSupabaseAdminClient } from '@lectrai/db';
import { HttpError } from '../../lib/http-error.js';
import { refreshDailyQuizStreakForUser } from '../stats/stats.service.js';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_DAILY_QUIZ_MODEL = 'gpt-4o-2024-08-06';
const DAILY_QUIZ_SCOPE = 'daily_quick';
const LOKI_QUIZ_SCOPE = 'loki';
const DAILY_QUIZ_QUESTION_COUNT = 5;
const DEFAULT_LOKI_QUIZ_QUESTION_COUNT = 5;
const MIN_LOKI_QUIZ_QUESTION_COUNT = 3;
const MAX_LOKI_QUIZ_QUESTION_COUNT = 10;
const MAX_LOKI_QUIZ_GENERATION_ATTEMPTS = 2;
const MAX_TRANSCRIPT_CONTEXTS = 5;
const MAX_FILE_CONTEXTS = 5;
const MAX_CONTEXT_CHARS = 4_000;

export type DailyQuickQuizRecord = {
  id: string;
  title: string | null;
  quizType: string;
  difficulty: string;
  questionCount: number | null;
  estimatedMinutes: number | null;
  availableOn: string;
  createdAt: string;
  updatedAt: string;
  questions: DailyQuickQuizQuestionRecord[];
};

export type DailyQuickQuizAttemptAnswerRecord = {
  id: string;
  questionId: string;
  selectedOptionId: string | null;
  shortAnswerText: string | null;
  isCorrect: boolean | null;
  awardedPoints: number | null;
  answeredAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type DailyQuickQuizAttemptRecord = {
  id: string;
  quizId: string;
  userId: string;
  score: number | null;
  maxScore: number | null;
  percentageScore: number | null;
  timeSpentSeconds: number | null;
  isCompleted: boolean;
  startedAt: string | null;
  submittedAt: string | null;
  createdAt: string;
  answers: DailyQuickQuizAttemptAnswerRecord[];
};

export type DailyQuickQuizBundle = {
  quiz: DailyQuickQuizRecord;
  attempt: DailyQuickQuizAttemptRecord | null;
};

export type DailyQuickQuizAvailabilityRecord = {
  canGenerate: boolean;
  reason: 'ready' | 'no_courses';
  message: string | null;
};

export type DailyQuickQuizResponse = {
  quiz: DailyQuickQuizRecord | null;
  attempt: DailyQuickQuizAttemptRecord | null;
  availability: DailyQuickQuizAvailabilityRecord;
};

export type DailyQuickQuizQuestionRecord = {
  id: string;
  questionOrder: number;
  questionType: string;
  questionText: string;
  explanation: string | null;
  difficulty: string | null;
  isRelatedToAnyCourse: boolean;
  createdAt: string | null;
  options: DailyQuickQuizOptionRecord[];
};

export type DailyQuickQuizOptionRecord = {
  id: string;
  optionLabel: string | null;
  optionText: string;
  isCorrect: boolean;
  optionOrder: number;
  createdAt: string | null;
};

export type StoredQuizRecord = {
  id: string;
  title: string | null;
  quizType: string;
  difficulty: string;
  questionCount: number | null;
  estimatedMinutes: number | null;
  availableOn: string | null;
  createdAt: string;
  updatedAt: string;
  questions: StoredQuizQuestionRecord[];
};

export type StoredQuizQuestionRecord = {
  id: string;
  questionOrder: number;
  questionType: string;
  questionText: string;
  explanation: string | null;
  difficulty: string | null;
  isRelatedToAnyCourse: boolean;
  createdAt: string | null;
  options: StoredQuizOptionRecord[];
};

export type StoredQuizOptionRecord = {
  id: string;
  optionLabel: string | null;
  optionText: string;
  isCorrect: boolean;
  optionOrder: number;
  createdAt: string | null;
};

export type StoredQuizAttemptAnswerRecord = DailyQuickQuizAttemptAnswerRecord;
export type StoredQuizAttemptRecord = DailyQuickQuizAttemptRecord;

export type StoredQuizBundle = {
  quiz: StoredQuizRecord;
  attempt: StoredQuizAttemptRecord | null;
};

export type LokiQuizSourceContext = {
  lectureId: string;
  lectureTitle: string;
  courseId: string;
  courseName: string;
  similarity: number;
  content: string;
};

type SemesterWindow = {
  label: string;
  startDate: Date;
  endDate: Date;
};

type CourseContextRow = {
  id: string;
  courseCode: string | null;
  courseName: string;
  description: string | null;
  instructorName: string | null;
  semester: string | null;
};

type TranscriptContextRow = {
  lectureId: string;
  lectureTitle: string;
  courseId: string;
  courseCode: string | null;
  courseName: string;
  transcriptId: string;
  formattedText: string;
};

type CourseFileContextRow = {
  id: string;
  courseId: string;
  courseCode: string | null;
  courseName: string;
  title: string;
  description: string | null;
  sourceType: 'file' | 'link';
  bucketName: string | null;
  objectPath: string | null;
  externalUrl: string | null;
  originalFilename: string | null;
  mimeType: string | null;
};

type DailyQuizSourceContext =
  | {
      sourceType: 'transcript';
      sourceId: string;
      courseId: string;
      courseLabel: string;
      title: string;
      text: string;
    }
  | {
      sourceType: 'course_file';
      sourceId: string;
      courseId: string;
      courseLabel: string;
      title: string;
      text: string;
    }
  | {
      sourceType: 'course_metadata';
      sourceId: string;
      courseId: string;
      courseLabel: string;
      title: string;
      text: string;
    };

type GeneratedDailyQuizPayload = {
  title: string;
  estimatedMinutes: number;
  questions: GeneratedDailyQuizQuestion[];
};

type GeneratedDailyQuizQuestion = {
  questionOrder: number;
  questionText: string;
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
  isRelatedToAnyCourse: boolean;
  sourceExcerpt: string | null;
  options: GeneratedDailyQuizOption[];
};

type GeneratedDailyQuizOption = {
  optionLabel: string;
  optionText: string;
  isCorrect: boolean;
};

type OpenAiResponsesOutputContent = {
  type?: unknown;
  text?: unknown;
};

type OpenAiResponsesOutput = {
  type?: unknown;
  content?: unknown;
};

type OpenAiResponsesResponse = {
  output?: unknown;
};

export type UpsertDailyQuickQuizAnswerInput = {
  quizId: string;
  questionId: string;
  selectedOptionId: string;
  timeSpentSeconds?: number | null;
  isCompleted?: boolean;
};

export type SubmitDailyQuickQuizAttemptInput = {
  quizId: string;
  answers: Array<{
    questionId: string;
    selectedOptionId: string;
  }>;
  timeSpentSeconds?: number | null;
};

export type SubmitStoredQuizAttemptInput = SubmitDailyQuickQuizAttemptInput;

export type GenerateLokiQuizForUserInput = {
  userId: string;
  message: string;
  contexts: LokiQuizSourceContext[];
  questionCount?: number;
  titleHint?: string | null;
};

export async function getDailyQuickQuizForUser(userId: string): Promise<DailyQuickQuizRecord | null> {
  const userTimezone = await getUserTimezone(userId);
  const todayKey = getDateKeyForTimezone(userTimezone);
  return findDailyQuickQuizForUser(userId, todayKey);
}

export async function getDailyQuickQuizBundleForUser(userId: string): Promise<DailyQuickQuizBundle | null> {
  const quiz = await getDailyQuickQuizForUser(userId);

  if (!quiz) {
    return null;
  }

  return {
    quiz,
    attempt: await getDailyQuickQuizAttemptForUser(userId, quiz.id),
  };
}

export async function getDailyQuickQuizResponseForUser(userId: string): Promise<DailyQuickQuizResponse> {
  const bundle = await getDailyQuickQuizBundleForUser(userId);

  if (bundle) {
    return {
      quiz: bundle.quiz,
      attempt: bundle.attempt,
      availability: {
        canGenerate: true,
        reason: 'ready',
        message: null,
      },
    };
  }

  const semester = getCurrentSemesterWindow(new Date());
  const courses = await listCurrentSemesterCoursesForUser(userId, semester.label);

  if (courses.length === 0) {
    return {
      quiz: null,
      attempt: null,
      availability: {
        canGenerate: false,
        reason: 'no_courses',
        message: 'Add at least one current-semester course to generate a daily quiz.',
      },
    };
  }

  const generated = await generateDailyQuickQuizBundleForUser(userId);
  return {
    quiz: generated.quiz,
    attempt: generated.attempt,
    availability: {
      canGenerate: true,
      reason: 'ready',
      message: null,
    },
  };
}

export async function generateDailyQuickQuizResponseForUser(userId: string): Promise<DailyQuickQuizResponse> {
  const semester = getCurrentSemesterWindow(new Date());
  const courses = await listCurrentSemesterCoursesForUser(userId, semester.label);

  if (courses.length === 0) {
    return {
      quiz: null,
      attempt: null,
      availability: {
        canGenerate: false,
        reason: 'no_courses',
        message: 'Add at least one current-semester course to generate a daily quiz.',
      },
    };
  }

  const generated = await generateDailyQuickQuizBundleForUser(userId);
  return {
    quiz: generated.quiz,
    attempt: generated.attempt,
    availability: {
      canGenerate: true,
      reason: 'ready',
      message: null,
    },
  };
}

export async function generateDailyQuickQuizForUser(userId: string): Promise<DailyQuickQuizRecord> {
  const userTimezone = await getUserTimezone(userId);
  const todayKey = getDateKeyForTimezone(userTimezone);
  const existingQuiz = await findDailyQuickQuizForUser(userId, todayKey);

  if (existingQuiz) {
    return existingQuiz;
  }

  const semester = getCurrentSemesterWindow(new Date());
  const courses = await listCurrentSemesterCoursesForUser(userId, semester.label);

  if (courses.length === 0) {
    throw new HttpError(409, 'Cannot generate a daily quiz without at least one current-semester course.');
  }

  const [transcriptContexts, fileContexts] = await Promise.all([
    listTranscriptContextsForUser(userId, semester.label),
    listCourseFileContextsForUser(userId, semester.label),
  ]);

  const contexts = await buildDailyQuizContexts(courses, transcriptContexts, fileContexts);
  const generatedQuiz = await generateQuizWithOpenAi({
    todayKey,
    semesterLabel: semester.label,
    courses,
    contexts,
  });

  const quizId = await persistGeneratedDailyQuiz(userId, todayKey, generatedQuiz);

  return (
    (await findDailyQuickQuizForUser(userId, todayKey, quizId)) ??
    (await findDailyQuickQuizForUser(userId, todayKey)) ??
    (() => {
      throw new HttpError(500, 'Daily quiz was generated but could not be loaded.');
    })()
  );
}

export async function generateDailyQuickQuizBundleForUser(userId: string): Promise<DailyQuickQuizBundle> {
  const quiz = await generateDailyQuickQuizForUser(userId);

  return {
    quiz,
    attempt: await getDailyQuickQuizAttemptForUser(userId, quiz.id),
  };
}

export async function getStoredQuizBundleForUser(userId: string, quizId: string): Promise<StoredQuizBundle> {
  const quiz = await findStoredQuizForUser(userId, {
    quizId,
    scopes: [DAILY_QUIZ_SCOPE, LOKI_QUIZ_SCOPE],
  });

  if (!quiz) {
    throw new HttpError(404, 'Quiz not found for this user.');
  }

  return {
    quiz,
    attempt: await getDailyQuickQuizAttemptForUser(userId, quiz.id),
  };
}

export async function generateLokiQuizForUser(input: GenerateLokiQuizForUserInput): Promise<StoredQuizRecord> {
  const questionCount = resolveLokiQuizQuestionCount(input.questionCount, input.message);
  const generatedQuiz = await generateLokiQuizWithOpenAi({
    message: input.message,
    titleHint: input.titleHint ?? null,
    contexts: input.contexts,
    questionCount,
  });
  const quizId = await persistGeneratedStoredQuiz({
    userId: input.userId,
    scope: LOKI_QUIZ_SCOPE,
    availableOn: null,
    generatedQuiz,
  });
  const quiz = await findStoredQuizForUser(input.userId, {
    quizId,
    scopes: [LOKI_QUIZ_SCOPE],
  });

  if (!quiz) {
    throw new HttpError(500, 'Quiz was generated but could not be loaded.');
  }

  return quiz;
}

export async function upsertDailyQuickQuizAnswerForUser(
  userId: string,
  input: UpsertDailyQuickQuizAnswerInput
): Promise<DailyQuickQuizBundle> {
  const db = getDb();
  const validationRows = await db<DbDailyQuickQuizAnswerValidationRow[]>`
    select
      q.id::text as "quizId",
      qq.id::text as "questionId",
      qq.question_order as "questionOrder",
      qo.id::text as "selectedOptionId",
      qo.is_correct as "isCorrect"
    from public.quizzes q
    join public.quiz_questions qq on qq.quiz_id = q.id
    join public.quiz_options qo on qo.question_id = qq.id
    where q.id = ${input.quizId}::uuid
      and q.scope = ${DAILY_QUIZ_SCOPE}
      and q.generated_by_user_id = ${userId}::uuid
      and qq.id = ${input.questionId}::uuid
      and qo.id = ${input.selectedOptionId}::uuid
    limit 1
  `;

  const validation = validationRows[0];

  if (!validation) {
    throw new HttpError(404, 'Quiz question or selected option not found for this user.');
  }

  await db.begin(async (transaction) => {
    const tx = transaction as unknown as ReturnType<typeof getDb>;
    const nowIso = new Date().toISOString();
    const existingAttemptRows = await tx<{ id: string }[]>`
      select id::text as id
      from public.quiz_attempts
      where quiz_id = ${input.quizId}::uuid
        and user_id = ${userId}::uuid
        and is_completed = false
      order by created_at desc
      limit 1
    `;

    let attemptId = existingAttemptRows[0]?.id ?? null;

    if (!attemptId) {
      const insertedAttemptRows = await tx<{ id: string }[]>`
        insert into public.quiz_attempts (
          quiz_id,
          user_id,
          score,
          max_score,
          percentage_score,
          time_spent_seconds,
          is_completed,
          started_at,
          created_at
        )
        values (
          ${input.quizId}::uuid,
          ${userId}::uuid,
          null,
          null,
          null,
          ${normalizeOptionalInteger(input.timeSpentSeconds)},
          false,
          ${nowIso}::timestamptz,
          timezone('utc', now())
        )
        returning id::text as id
      `;

      attemptId = insertedAttemptRows[0]?.id ?? null;
    }

    if (!attemptId) {
      throw new HttpError(500, 'Failed to create or load a quiz attempt.');
    }

    await tx`
      insert into public.quiz_attempt_answers (
        quiz_attempt_id,
        question_id,
        selected_option_id,
        short_answer_text,
        is_correct,
        awarded_points,
        answered_at
      ) values (
        ${attemptId}::uuid,
        ${input.questionId}::uuid,
        ${input.selectedOptionId}::uuid,
        null,
        ${validation.isCorrect},
        ${validation.isCorrect ? 1 : 0},
        ${nowIso}::timestamptz
      )
      on conflict (quiz_attempt_id, question_id) do update
      set
        selected_option_id = excluded.selected_option_id,
        short_answer_text = excluded.short_answer_text,
        is_correct = excluded.is_correct,
        awarded_points = excluded.awarded_points,
        answered_at = excluded.answered_at
    `;

    const scoreRows = await tx<DbQuizAttemptScoreRow[]>`
      select
        count(*)::int as "answeredCount",
        coalesce(sum(case when is_correct = true then 1 else 0 end), 0)::int as score
      from public.quiz_attempt_answers
      where quiz_attempt_id = ${attemptId}::uuid
    `;

    const answeredCount = scoreRows[0]?.answeredCount ?? 0;
    const score = scoreRows[0]?.score ?? 0;
    const maxScore = DAILY_QUIZ_QUESTION_COUNT;
    const shouldComplete = Boolean(input.isCompleted) || answeredCount >= DAILY_QUIZ_QUESTION_COUNT;

    await tx`
      update public.quiz_attempts
      set
        score = ${score},
        max_score = ${maxScore},
        percentage_score = ${(score / maxScore) * 100},
        time_spent_seconds = ${normalizeOptionalInteger(input.timeSpentSeconds)},
        is_completed = ${shouldComplete},
        submitted_at = case
          when ${shouldComplete} then coalesce(submitted_at, ${nowIso}::timestamptz)
          else submitted_at
        end
      where id = ${attemptId}::uuid
    `;
  });

  const attempt = await getDailyQuickQuizAttemptForUser(userId, input.quizId);

  if (attempt?.isCompleted) {
    await refreshDailyQuizStreakForUser(userId);
  }

  return {
    quiz:
      (await findDailyQuickQuizForUser(userId, '', input.quizId)) ??
      (() => {
        throw new HttpError(404, 'Daily quiz not found after saving the answer.');
      })(),
    attempt,
  };
}

export async function submitDailyQuickQuizAttemptForUser(
  userId: string,
  input: SubmitDailyQuickQuizAttemptInput
): Promise<DailyQuickQuizBundle> {
  const result = await submitStoredQuizAttemptInternal(userId, input, [DAILY_QUIZ_SCOPE]);

  if (result.quiz.quizType && result.quiz.id) {
    await refreshDailyQuizStreakForUser(userId);
  }

  return {
    quiz: mapStoredQuizToDailyQuickQuiz(result.quiz),
    attempt: result.attempt,
  };
}

export async function submitStoredQuizAttemptForUser(
  userId: string,
  input: SubmitStoredQuizAttemptInput
): Promise<StoredQuizBundle> {
  const result = await submitStoredQuizAttemptInternal(userId, input, [DAILY_QUIZ_SCOPE, LOKI_QUIZ_SCOPE]);

  const quizScope = await getQuizScopeForUser(userId, input.quizId);

  if (quizScope === DAILY_QUIZ_SCOPE) {
    await refreshDailyQuizStreakForUser(userId);
  }

  return result;
}

async function submitStoredQuizAttemptInternal(
  userId: string,
  input: SubmitStoredQuizAttemptInput,
  allowedScopes: string[]
): Promise<StoredQuizBundle> {
  if (input.answers.length === 0) {
    throw new HttpError(400, 'Quiz submissions must include at least one answer.');
  }

  const normalizedAnswers = new Map<string, string>();

  for (const answer of input.answers) {
    if (normalizedAnswers.has(answer.questionId)) {
      throw new HttpError(400, 'Daily quiz submission contains duplicate question answers.');
    }

    normalizedAnswers.set(answer.questionId, answer.selectedOptionId);
  }

  const db = getDb();
  const validationRows = await db<DbDailyQuickQuizAttemptValidationRow[]>`
    select
      qq.id::text as "questionId",
      qq.question_order as "questionOrder",
      qo.id::text as "selectedOptionId",
      qo.is_correct as "isCorrect"
    from public.quizzes q
    join public.quiz_questions qq on qq.quiz_id = q.id
    join public.quiz_options qo on qo.question_id = qq.id
    where q.id = ${input.quizId}::uuid
      and q.scope = any(${allowedScopes}::text[])
      and q.generated_by_user_id = ${userId}::uuid
    order by qq.question_order asc, qo.option_order asc
  `;

  if (validationRows.length === 0) {
    throw new HttpError(404, 'Quiz not found for this user.');
  }

  const answersToPersist = new Map<
    string,
    {
      questionId: string;
      questionOrder: number;
      selectedOptionId: string;
      isCorrect: boolean;
      awardedPoints: number;
    }
  >();
  const questionIds = new Set<string>();

  for (const row of validationRows) {
    questionIds.add(row.questionId);

    const submittedOptionId = normalizedAnswers.get(row.questionId);

    if (!submittedOptionId) {
      continue;
    }

    if (submittedOptionId === row.selectedOptionId) {
      answersToPersist.set(row.questionId, {
        questionId: row.questionId,
        questionOrder: row.questionOrder,
        selectedOptionId: row.selectedOptionId,
        isCorrect: row.isCorrect,
        awardedPoints: row.isCorrect ? 1 : 0,
      });
    }
  }

  if (questionIds.size !== answersToPersist.size || questionIds.size !== normalizedAnswers.size) {
    throw new HttpError(400, 'Quiz submission must answer every question with a valid option.');
  }

  const orderedAnswers = Array.from(answersToPersist.values()).sort(
    (left, right) => left.questionOrder - right.questionOrder
  );
  const score = orderedAnswers.reduce((total, answer) => total + answer.awardedPoints, 0);
  const maxScore = questionIds.size;

  await db.begin(async (transaction) => {
    const tx = transaction as unknown as ReturnType<typeof getDb>;
    const nowIso = new Date().toISOString();
    const existingAttemptRows = await tx<{ id: string }[]>`
      select id::text as id
      from public.quiz_attempts
      where quiz_id = ${input.quizId}::uuid
        and user_id = ${userId}::uuid
      order by created_at desc
      limit 1
    `;

    let attemptId = existingAttemptRows[0]?.id ?? null;

    if (!attemptId) {
      const insertedAttemptRows = await tx<{ id: string }[]>`
        insert into public.quiz_attempts (
          quiz_id,
          user_id,
          score,
          max_score,
          percentage_score,
          time_spent_seconds,
          is_completed,
          started_at,
          submitted_at,
          created_at
        )
        values (
          ${input.quizId}::uuid,
          ${userId}::uuid,
          ${score},
          ${maxScore},
          ${(score / maxScore) * 100},
          ${normalizeOptionalInteger(input.timeSpentSeconds)},
          true,
          ${nowIso}::timestamptz,
          ${nowIso}::timestamptz,
          timezone('utc', now())
        )
        returning id::text as id
      `;

      attemptId = insertedAttemptRows[0]?.id ?? null;
    } else {
      await tx`
        update public.quiz_attempts
        set
          score = ${score},
          max_score = ${maxScore},
          percentage_score = ${(score / maxScore) * 100},
          time_spent_seconds = ${normalizeOptionalInteger(input.timeSpentSeconds)},
          is_completed = true,
          started_at = coalesce(started_at, ${nowIso}::timestamptz),
          submitted_at = ${nowIso}::timestamptz
        where id = ${attemptId}::uuid
      `;
    }

    if (!attemptId) {
      throw new HttpError(500, 'Failed to create or load a quiz attempt.');
    }

    await tx`
      delete from public.quiz_attempt_answers
      where quiz_attempt_id = ${attemptId}::uuid
    `;

    for (const answer of orderedAnswers) {
      await tx`
        insert into public.quiz_attempt_answers (
          quiz_attempt_id,
          question_id,
          selected_option_id,
          short_answer_text,
          is_correct,
          awarded_points,
          answered_at
        ) values (
          ${attemptId}::uuid,
          ${answer.questionId}::uuid,
          ${answer.selectedOptionId}::uuid,
          null,
          ${answer.isCorrect},
          ${answer.awardedPoints},
          ${nowIso}::timestamptz
        )
      `;
    }
  });

  return {
    quiz:
      (await findStoredQuizForUser(userId, {
        quizId: input.quizId,
        scopes: allowedScopes,
      })) ??
      (() => {
        throw new HttpError(404, 'Quiz not found after submitting the attempt.');
      })(),
    attempt: await getDailyQuickQuizAttemptForUser(userId, input.quizId),
  };
}

async function findDailyQuickQuizForUser(
  userId: string,
  todayKey: string,
  quizId?: string
): Promise<DailyQuickQuizRecord | null> {
  const quiz = await findStoredQuizForUser(userId, {
    quizId,
    availableOn: quizId ? undefined : todayKey,
    scopes: [DAILY_QUIZ_SCOPE],
  });

  if (!quiz) {
    return null;
  }

  return {
    id: quiz.id,
    title: quiz.title,
    quizType: quiz.quizType,
    difficulty: quiz.difficulty,
    questionCount: quiz.questionCount,
    estimatedMinutes: quiz.estimatedMinutes,
    availableOn: quiz.availableOn ?? '',
    createdAt: quiz.createdAt,
    updatedAt: quiz.updatedAt,
    questions: quiz.questions.map((question) => ({
      id: question.id,
      questionOrder: question.questionOrder,
      questionType: question.questionType,
      questionText: question.questionText,
      explanation: question.explanation,
      difficulty: question.difficulty,
      isRelatedToAnyCourse: question.isRelatedToAnyCourse,
      createdAt: question.createdAt,
      options: question.options.map((option) => ({
        id: option.id,
        optionLabel: option.optionLabel,
        optionText: option.optionText,
        isCorrect: option.isCorrect,
        optionOrder: option.optionOrder,
        createdAt: option.createdAt,
      })),
    })),
  };
}

async function findStoredQuizForUser(
  userId: string,
  input: {
    quizId?: string;
    availableOn?: string;
    scopes: string[];
  }
): Promise<StoredQuizRecord | null> {
  const db = getDb();
  let quizRows: DbDailyQuickQuizRow[];

  if (input.quizId) {
    quizRows = await db<DbDailyQuickQuizRow[]>`
      select
        id::text as id,
        title,
        quiz_type as "quizType",
        difficulty,
        question_count as "questionCount",
        estimated_minutes as "estimatedMinutes",
        available_on::text as "availableOn",
        created_at::text as "createdAt",
        updated_at::text as "updatedAt"
      from public.quizzes
      where id = ${input.quizId}::uuid
        and scope = any(${input.scopes}::text[])
        and generated_by_user_id = ${userId}::uuid
        and is_published = true
      limit 1
    `;
  } else {
    if (!input.availableOn) {
      throw new HttpError(400, 'availableOn is required when quizId is missing.');
    }

    quizRows = await db<DbDailyQuickQuizRow[]>`
      select
        id::text as id,
        title,
        quiz_type as "quizType",
        difficulty,
        question_count as "questionCount",
        estimated_minutes as "estimatedMinutes",
        available_on::text as "availableOn",
        created_at::text as "createdAt",
        updated_at::text as "updatedAt"
      from public.quizzes
      where scope = any(${input.scopes}::text[])
        and generated_by_user_id = ${userId}::uuid
        and is_published = true
        and available_on = ${input.availableOn}::date
      order by created_at desc
      limit 1
    `;
  }

  const quiz = quizRows[0];

  if (!quiz) {
    return null;
  }

  const questionRows = await db<DbDailyQuickQuizQuestionRow[]>`
    select
      id::text as id,
      question_order as "questionOrder",
      question_type as "questionType",
      question_text as "questionText",
      explanation,
      difficulty,
      is_related_to_any_course as "isRelatedToAnyCourse",
      created_at::text as "createdAt"
    from public.quiz_questions
    where quiz_id = ${quiz.id}::uuid
    order by question_order asc, created_at asc
  `;

  const optionRows = await db<DbDailyQuickQuizOptionRow[]>`
    select
      id::text as id,
      question_id::text as "questionId",
      option_label as "optionLabel",
      option_text as "optionText",
      is_correct as "isCorrect",
      option_order as "optionOrder",
      created_at::text as "createdAt"
    from public.quiz_options
    where question_id in (
      select id
      from public.quiz_questions
      where quiz_id = ${quiz.id}::uuid
    )
    order by question_id asc, option_order asc, created_at asc
  `;

  const optionsByQuestionId = new Map<string, DailyQuickQuizOptionRecord[]>();

  for (const option of optionRows) {
    const nextOptions = optionsByQuestionId.get(option.questionId) ?? [];
    nextOptions.push({
      id: option.id,
      optionLabel: option.optionLabel,
      optionText: option.optionText,
      isCorrect: option.isCorrect,
      optionOrder: option.optionOrder,
      createdAt: option.createdAt,
    });
    optionsByQuestionId.set(option.questionId, nextOptions);
  }

  return {
    id: quiz.id,
    title: quiz.title,
    quizType: quiz.quizType,
    difficulty: quiz.difficulty,
    questionCount: quiz.questionCount,
    estimatedMinutes: quiz.estimatedMinutes,
    availableOn: quiz.availableOn,
    createdAt: quiz.createdAt,
    updatedAt: quiz.updatedAt,
    questions: questionRows.map((question) => ({
      id: question.id,
      questionOrder: question.questionOrder,
      questionType: question.questionType,
      questionText: question.questionText,
      explanation: question.explanation,
      difficulty: question.difficulty,
      isRelatedToAnyCourse: question.isRelatedToAnyCourse,
      createdAt: question.createdAt,
      options: optionsByQuestionId.get(question.id) ?? [],
    })),
  };
}

async function getDailyQuickQuizAttemptForUser(
  userId: string,
  quizId: string
): Promise<DailyQuickQuizAttemptRecord | null> {
  const db = getDb();
  const attemptRows = await db<DbDailyQuickQuizAttemptRow[]>`
    select
      id::text as id,
      quiz_id::text as "quizId",
      user_id::text as "userId",
      score,
      max_score as "maxScore",
      percentage_score as "percentageScore",
      time_spent_seconds as "timeSpentSeconds",
      is_completed as "isCompleted",
      started_at::text as "startedAt",
      submitted_at::text as "submittedAt",
      created_at::text as "createdAt"
    from public.quiz_attempts
    where quiz_id = ${quizId}::uuid
      and user_id = ${userId}::uuid
    order by is_completed asc, created_at desc
    limit 1
  `;

  const attempt = attemptRows[0];

  if (!attempt) {
    return null;
  }

  const answerRows = await db<DbDailyQuickQuizAttemptAnswerRow[]>`
    select
      id::text as id,
      question_id::text as "questionId",
      selected_option_id::text as "selectedOptionId",
      short_answer_text as "shortAnswerText",
      is_correct as "isCorrect",
      awarded_points as "awardedPoints",
      answered_at::text as "answeredAt",
      answered_at::text as "createdAt",
      answered_at::text as "updatedAt"
    from public.quiz_attempt_answers
    where quiz_attempt_id = ${attempt.id}::uuid
    order by answered_at asc nulls last, id asc
  `;

  return {
    id: attempt.id,
    quizId: attempt.quizId,
    userId: attempt.userId,
    score: attempt.score,
    maxScore: attempt.maxScore,
    percentageScore: attempt.percentageScore,
    timeSpentSeconds: attempt.timeSpentSeconds,
    isCompleted: attempt.isCompleted,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    createdAt: attempt.createdAt,
    answers: answerRows.map((answer) => ({
      id: answer.id,
      questionId: answer.questionId,
      selectedOptionId: answer.selectedOptionId,
      shortAnswerText: answer.shortAnswerText,
      isCorrect: answer.isCorrect,
      awardedPoints: answer.awardedPoints,
      answeredAt: answer.answeredAt,
      createdAt: answer.createdAt,
      updatedAt: answer.updatedAt,
    })),
  };
}

async function listCurrentSemesterCoursesForUser(userId: string, semesterLabel: string) {
  const db = getDb();
  return db<CourseContextRow[]>`
    select
      id::text as id,
      course_code as "courseCode",
      course_name as "courseName",
      description,
      instructor_name as "instructorName",
      semester
    from public.courses
    where owner_user_id = ${userId}::uuid
      and is_archived = false
      and semester = ${semesterLabel}
    order by updated_at desc, course_name asc
  `;
}

async function listTranscriptContextsForUser(userId: string, semesterLabel: string) {
  const db = getDb();
  return db<TranscriptContextRow[]>`
    select
      l.id::text as "lectureId",
      l.title as "lectureTitle",
      c.id::text as "courseId",
      c.course_code as "courseCode",
      c.course_name as "courseName",
      pt.id::text as "transcriptId",
      pt.formatted_text as "formattedText"
    from public.processed_transcripts pt
    join public.lectures l on l.id = pt.lecture_id
    join public.courses c on c.id = l.course_id
    where c.owner_user_id = ${userId}::uuid
      and c.is_archived = false
      and c.semester = ${semesterLabel}
      and pt.status = 'ready'
      and length(trim(pt.formatted_text)) > 0
    order by random()
    limit ${MAX_TRANSCRIPT_CONTEXTS}
  `;
}

async function listCourseFileContextsForUser(userId: string, semesterLabel: string) {
  const db = getDb();
  return db<CourseFileContextRow[]>`
    select
      cf.id::text as id,
      c.id::text as "courseId",
      c.course_code as "courseCode",
      c.course_name as "courseName",
      cf.title,
      cf.description,
      cf.source_type as "sourceType",
      cf.bucket_name as "bucketName",
      cf.object_path as "objectPath",
      cf.external_url as "externalUrl",
      cf.original_filename as "originalFilename",
      cf.mime_type as "mimeType"
    from public.course_files cf
    join public.courses c on c.id = cf.course_id
    where c.owner_user_id = ${userId}::uuid
      and c.is_archived = false
      and c.semester = ${semesterLabel}
      and (
        (cf.source_type = 'file' and cf.upload_status = 'uploaded')
        or cf.source_type = 'link'
      )
    order by random()
    limit ${MAX_FILE_CONTEXTS}
  `;
}

async function buildDailyQuizContexts(
  courses: CourseContextRow[],
  transcripts: TranscriptContextRow[],
  files: CourseFileContextRow[]
) {
  const transcriptContexts: DailyQuizSourceContext[] = transcripts.map((transcript) => ({
    sourceType: 'transcript',
    sourceId: transcript.transcriptId,
    courseId: transcript.courseId,
    courseLabel: formatCourseLabel(transcript.courseCode, transcript.courseName),
    title: transcript.lectureTitle,
    text: truncateText(cleanText(transcript.formattedText), MAX_CONTEXT_CHARS),
  }));

  const fileContexts: DailyQuizSourceContext[] = [];

  for (const file of files) {
    const extractedText = await extractCourseFileContextText(file);
    fileContexts.push({
      sourceType: 'course_file',
      sourceId: file.id,
      courseId: file.courseId,
      courseLabel: formatCourseLabel(file.courseCode, file.courseName),
      title: file.title,
      text: truncateText(extractedText, MAX_CONTEXT_CHARS),
    });
  }

  const metadataContexts: DailyQuizSourceContext[] = courses.map((course) => ({
    sourceType: 'course_metadata',
    sourceId: course.id,
    courseId: course.id,
    courseLabel: formatCourseLabel(course.courseCode, course.courseName),
    title: `${formatCourseLabel(course.courseCode, course.courseName)} course context`,
    text: cleanText(
      [
        `Course: ${formatCourseLabel(course.courseCode, course.courseName)}`,
        course.instructorName ? `Instructor: ${course.instructorName}` : null,
        course.semester ? `Semester: ${course.semester}` : null,
        course.description ? `Description: ${course.description}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    ),
  }));

  return [...transcriptContexts, ...fileContexts, ...metadataContexts];
}

async function extractCourseFileContextText(file: CourseFileContextRow) {
  const header = [
    `Course: ${formatCourseLabel(file.courseCode, file.courseName)}`,
    `File title: ${file.title}`,
    file.description ? `Description: ${file.description}` : null,
    file.originalFilename ? `Original filename: ${file.originalFilename}` : null,
    file.mimeType ? `MIME type: ${file.mimeType}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  if (file.sourceType === 'link') {
    return cleanText(
      [
        header,
        file.externalUrl ? `External URL: ${file.externalUrl}` : null,
        'Content body unavailable. Use only the metadata above if needed.',
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  if (!file.bucketName || !file.objectPath) {
    return cleanText(`${header}\nContent body unavailable because the file storage location is missing.`);
  }

  try {
    const supabase = getSupabaseAdminClient();
    const result = await supabase.storage.from(file.bucketName).download(file.objectPath);

    if (result.error || !result.data) {
      return cleanText(
        `${header}\nContent body unavailable because the file could not be downloaded.`
      );
    }

    const buffer = Buffer.from(await result.data.arrayBuffer());
    const text = decodeSupportedFileBuffer(buffer, file.mimeType, file.originalFilename);

    if (!text) {
      return cleanText(
        `${header}\nContent body unavailable because this file type is not currently supported for text extraction.`
      );
    }

    return cleanText(`${header}\n\nExtracted content:\n${text}`);
  } catch {
    return cleanText(
      `${header}\nContent body unavailable because reading the file content failed.`
    );
  }
}

function decodeSupportedFileBuffer(buffer: Buffer, mimeType: string | null, filename: string | null) {
  const normalizedMimeType = mimeType?.toLowerCase() ?? '';
  const extension = filename?.split('.').pop()?.toLowerCase() ?? '';
  const supportsUtf8Text =
    normalizedMimeType.startsWith('text/') ||
    normalizedMimeType.includes('json') ||
    normalizedMimeType.includes('xml') ||
    extension === 'txt' ||
    extension === 'md' ||
    extension === 'csv' ||
    extension === 'json' ||
    extension === 'xml' ||
    extension === 'html' ||
    extension === 'htm';

  if (!supportsUtf8Text) {
    return null;
  }

  return buffer.toString('utf8');
}

async function generateQuizWithOpenAi(input: {
  todayKey: string;
  semesterLabel: string;
  courses: CourseContextRow[];
  contexts: DailyQuizSourceContext[];
}): Promise<GeneratedDailyQuizPayload> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new HttpError(500, 'Missing OpenAI API key. Set OPENAI_API_KEY for daily quiz generation.');
  }

  const modelName = process.env.OPENAI_DAILY_QUIZ_MODEL ?? DEFAULT_DAILY_QUIZ_MODEL;
  const directContextCount = input.contexts.filter((context) => context.sourceType !== 'course_metadata').length;

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text:
                'You generate daily multiple-choice quizzes for students. ' +
                'Return exactly 5 questions and keep them grounded in the provided course contexts. ' +
                'Use direct transcript and file content whenever available. ' +
                'If there are fewer than 5 direct content sources, you may generate course-related questions inferred from course metadata. ' +
                'Set isRelatedToAnyCourse to true only when a question is related to one of the user courses, even if it is not directly quoted from a source. ' +
                'Every question must have exactly 4 answer options with exactly 1 correct option. ' +
                'Do not mention missing context or say that you are inferring in the question text. ' +
                'Use lecture transcripts as knowledge context, not as transcript trivia. ' +
                'Do not ask who said something, which speaker said a line, or questions that depend on exact lecture wording. ' +
                'Do not make the quiz lecture-specific unless the underlying concept itself is lecture-specific. ' +
                'Prefer concept-based questions that test understanding of ideas taught across the provided materials.',
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify({
                date: input.todayKey,
                semester: input.semesterLabel,
                targetQuestionCount: DAILY_QUIZ_QUESTION_COUNT,
                directContextCount,
                courses: input.courses.map((course) => ({
                  courseId: course.id,
                  courseLabel: formatCourseLabel(course.courseCode, course.courseName),
                  description: course.description,
                  instructorName: course.instructorName,
                })),
                contexts: input.contexts.map((context) => ({
                  sourceType: context.sourceType,
                  sourceId: context.sourceId,
                  courseId: context.courseId,
                  courseLabel: context.courseLabel,
                  title: context.title,
                  text: context.text,
                })),
              }),
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'daily_quick_quiz',
          strict: true,
          schema: DAILY_QUIZ_SCHEMA,
        },
      },
    }),
  });

  if (!response.ok) {
    const errorDetails = await readOpenAiErrorDetails(response);
    throw new HttpError(502, 'OpenAI daily quiz generation failed.', errorDetails);
  }

  const rawResponse = (await response.json()) as OpenAiResponsesResponse;
  return normalizeGeneratedQuizPayload(parseGeneratedQuizPayload(rawResponse), DAILY_QUIZ_QUESTION_COUNT);
}

async function generateLokiQuizWithOpenAi(input: {
  message: string;
  titleHint: string | null;
  contexts: LokiQuizSourceContext[];
  questionCount: number;
}): Promise<GeneratedDailyQuizPayload> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new HttpError(500, 'Missing OpenAI API key. Set OPENAI_API_KEY for Loki quiz generation.');
  }

  const modelName = process.env.OPENAI_DAILY_QUIZ_MODEL ?? DEFAULT_DAILY_QUIZ_MODEL;
  let lastError: unknown = null;
  let previousFailureMessage: string | null = null;

  for (let attempt = 1; attempt <= MAX_LOKI_QUIZ_GENERATION_ATTEMPTS; attempt += 1) {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName,
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text:
                  'You generate multiple-choice quizzes for students inside a tutoring chat. ' +
                  `Return exactly ${input.questionCount} questions in valid JSON. ` +
                  'Keep the quiz grounded in the provided lecture context when available, but use the lecture only as reference knowledge. ' +
                  'If context is thin, use the student request as the topic and keep the quiz high-level and educational. ' +
                  'Every question must have exactly 4 answer options with exactly 1 correct option. ' +
                  'Do not ask speaker-identification, quote-matching, transcript-order, or exact-transcript recall questions. ' +
                  'Do not refer to speakers, students, or labels such as Student A, Speaker 1, professor, or lecturer in the question text or answer options unless the concept itself is explicitly about roles in a scenario. ' +
                  'Do not test whether the student remembers the wording of the lecture. ' +
                  'Rewrite lecture content into clean standalone knowledge questions that test understanding, application, and conceptual reasoning. ' +
                  'If a transcript chunk looks like dialogue, ignore identity labels and extract only the underlying subject-matter ideas.',
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: JSON.stringify({
                  request: input.message,
                  titleHint: input.titleHint,
                  targetQuestionCount: input.questionCount,
                  previousFailureMessage,
                  contexts: input.contexts.map((context) => ({
                    lectureId: context.lectureId,
                    lectureTitle: context.lectureTitle,
                    courseId: context.courseId,
                    courseName: context.courseName,
                    similarity: context.similarity,
                    content: truncateText(normalizeQuizContextText(context.content), MAX_CONTEXT_CHARS),
                  })),
                }),
              },
            ],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'loki_quiz',
            strict: true,
            schema: buildQuizSchema(input.questionCount),
          },
        },
      }),
    });

    if (!response.ok) {
      const errorDetails = await readOpenAiErrorDetails(response);
      throw new HttpError(502, 'OpenAI Loki quiz generation failed.', errorDetails);
    }

    try {
      const rawResponse = (await response.json()) as OpenAiResponsesResponse;
      const normalizedQuiz = normalizeGeneratedQuizPayload(
        parseGeneratedQuizPayload(rawResponse),
        input.questionCount,
        input.titleHint
      );
      assertQuizDoesNotDependOnTranscriptTrivia(normalizedQuiz);
      return normalizedQuiz;
    } catch (error) {
      lastError = error;
      previousFailureMessage = describeQuizGenerationFailure(error);
      console.warn('[ quizzes ] Loki quiz generation attempt failed.', {
        attempt,
        modelName,
        failure: previousFailureMessage,
      });
    }
  }

  throw new HttpError(
    502,
    'Loki could not generate a valid quiz from that lecture yet. Please try again.',
    lastError
  );
}

async function persistGeneratedDailyQuiz(userId: string, todayKey: string, generatedQuiz: GeneratedDailyQuizPayload) {
  return persistGeneratedStoredQuiz({
    userId,
    scope: DAILY_QUIZ_SCOPE,
    availableOn: todayKey,
    generatedQuiz,
  });
}

async function persistGeneratedStoredQuiz(input: {
  userId: string;
  scope: typeof DAILY_QUIZ_SCOPE | typeof LOKI_QUIZ_SCOPE;
  availableOn: string | null;
  generatedQuiz: GeneratedDailyQuizPayload;
}) {
  const db = getDb();

  return db.begin(async (transaction) => {
    const tx = transaction as unknown as ReturnType<typeof getDb>;
    const quizInsertRows = await tx<{ id: string }[]>`
      insert into public.quizzes (
        generated_by_user_id,
        title,
        quiz_type,
        difficulty,
        question_count,
        estimated_minutes,
        is_ai_generated,
        is_published,
        scope,
        available_on
      ) values (
        ${input.userId}::uuid,
        ${input.generatedQuiz.title},
        'mcq',
        'mixed',
        ${input.generatedQuiz.questions.length},
        ${input.generatedQuiz.estimatedMinutes},
        true,
        true,
        ${input.scope},
        ${input.availableOn}::date
      )
      on conflict do nothing
      returning id::text as id
    `;

    const insertedQuizId = quizInsertRows[0]?.id;

    if (!insertedQuizId) {
      if (input.scope === DAILY_QUIZ_SCOPE && input.availableOn) {
        const existingQuiz = await findDailyQuickQuizForUser(input.userId, input.availableOn);

        if (!existingQuiz) {
          throw new HttpError(409, 'Daily quiz generation is already in progress for today.');
        }

        return existingQuiz.id;
      }

      throw new HttpError(409, 'Quiz generation is already in progress.');
    }

    for (const question of input.generatedQuiz.questions) {
      const questionRows = await tx<{ id: string }[]>`
        insert into public.quiz_questions (
          quiz_id,
          lecture_id,
          question_order,
          question_type,
          question_text,
          explanation,
          source_excerpt,
          difficulty,
          is_related_to_any_course
        ) values (
          ${insertedQuizId}::uuid,
          null,
          ${question.questionOrder},
          'mcq',
          ${question.questionText},
          ${question.explanation},
          ${nullable(question.sourceExcerpt)},
          ${question.difficulty},
          ${question.isRelatedToAnyCourse}
        )
        returning id::text as id
      `;

      const questionId = questionRows[0]?.id;

      if (!questionId) {
        throw new HttpError(500, 'Failed to persist a generated quiz question.');
      }

      for (const [optionIndex, option] of question.options.entries()) {
        await tx`
          insert into public.quiz_options (
            question_id,
            option_label,
            option_text,
            is_correct,
            option_order
          ) values (
            ${questionId}::uuid,
            ${option.optionLabel},
            ${option.optionText},
            ${option.isCorrect},
            ${optionIndex + 1}
          )
        `;
      }
    }

    return insertedQuizId;
  });
}

async function getUserTimezone(userId: string) {
  const db = getDb();
  const rows = await db<{ timezone: string | null }[]>`
    select timezone
    from public.users
    where id = ${userId}::uuid
    limit 1
  `;

  return rows[0]?.timezone?.trim() || 'UTC';
}

function getDateKeyForTimezone(timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());

    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;

    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Fall back to UTC if the saved timezone value is invalid.
  }

  return new Date().toISOString().slice(0, 10);
}

function getCurrentSemesterWindow(now: Date): SemesterWindow {
  const month = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();

  if (month >= 1 && month <= 4) {
    return {
      label: `Spring ${year}`,
      startDate: new Date(Date.UTC(year, 0, 1)),
      endDate: new Date(Date.UTC(year, 3, 30, 23, 59, 59, 999)),
    };
  }

  if (month >= 5 && month <= 7) {
    return {
      label: `Summer ${year}`,
      startDate: new Date(Date.UTC(year, 4, 1)),
      endDate: new Date(Date.UTC(year, 6, 31, 23, 59, 59, 999)),
    };
  }

  return {
    label: `Fall ${year}`,
    startDate: new Date(Date.UTC(year, 7, 1)),
    endDate: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
  };
}

async function readOpenAiErrorDetails(response: Response) {
  try {
    return await response.json();
  } catch {
    return await response.text().catch(() => response.statusText);
  }
}

function parseGeneratedQuizPayload(response: OpenAiResponsesResponse): GeneratedDailyQuizPayload {
  const outputText = extractOutputText(response);

  if (!outputText) {
    throw new HttpError(502, 'OpenAI daily quiz generation did not return output text.', response);
  }

  return JSON.parse(outputText) as GeneratedDailyQuizPayload;
}

function normalizeGeneratedQuizPayload(
  payload: GeneratedDailyQuizPayload,
  expectedQuestionCount: number,
  fallbackTitle?: string | null
): GeneratedDailyQuizPayload {
  if (!Array.isArray(payload.questions) || payload.questions.length !== expectedQuestionCount) {
    throw new HttpError(502, 'OpenAI daily quiz generation returned an unexpected number of questions.');
  }

  return {
    title: cleanText(payload.title) || cleanText(fallbackTitle ?? '') || 'Generated quiz',
    estimatedMinutes:
      typeof payload.estimatedMinutes === 'number' && Number.isFinite(payload.estimatedMinutes)
        ? Math.max(1, Math.min(30, Math.round(payload.estimatedMinutes)))
        : 5,
    questions: payload.questions.map((question, index) => {
      if (!Array.isArray(question.options) || question.options.length !== 4) {
        throw new HttpError(502, 'OpenAI daily quiz generation returned a question without 4 options.', {
          index,
          question,
        });
      }

      const correctOptionCount = question.options.filter((option) => option.isCorrect).length;

      if (correctOptionCount !== 1) {
        throw new HttpError(
          502,
          'OpenAI daily quiz generation returned a question without exactly one correct option.',
          { index, question }
        );
      }

      return {
        questionOrder: index + 1,
        questionText: cleanText(question.questionText),
        explanation: cleanText(question.explanation),
        difficulty: normalizeDifficulty(question.difficulty),
        isRelatedToAnyCourse: Boolean(question.isRelatedToAnyCourse),
        sourceExcerpt: question.sourceExcerpt ? truncateText(cleanText(question.sourceExcerpt), 600) : null,
        options: question.options.map((option, optionIndex) => ({
          optionLabel: option.optionLabel?.trim() || String.fromCharCode(65 + optionIndex),
          optionText: cleanText(option.optionText),
          isCorrect: Boolean(option.isCorrect),
        })),
      };
    }),
  };
}

function assertQuizDoesNotDependOnTranscriptTrivia(payload: GeneratedDailyQuizPayload) {
  const forbiddenPattern =
    /\b(student\s*[a-z0-9]+|speaker\s*[a-z0-9]+|who said|which speaker|according to the lecture|according to the transcript|in the lecture, who|what did [^?]* say)\b/i;

  for (const question of payload.questions) {
    if (forbiddenPattern.test(question.questionText) || forbiddenPattern.test(question.explanation)) {
      throw new HttpError(502, 'OpenAI Loki quiz generation returned transcript-trivia content.', {
        questionText: question.questionText,
      });
    }

    for (const option of question.options) {
      if (forbiddenPattern.test(option.optionText)) {
        throw new HttpError(502, 'OpenAI Loki quiz generation returned transcript-trivia answer options.', {
          questionText: question.questionText,
          optionText: option.optionText,
        });
      }
    }
  }
}

function describeQuizGenerationFailure(error: unknown) {
  if (error instanceof HttpError) {
    const detail =
      typeof error.details === 'string'
        ? error.details
        : error.details && typeof error.details === 'object'
          ? JSON.stringify(error.details)
          : null;
    return detail ? `${error.message} Details: ${detail}` : error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown quiz generation failure.';
}

function extractOutputText(response: OpenAiResponsesResponse) {
  if (!Array.isArray(response.output)) {
    return null;
  }

  for (const item of response.output as OpenAiResponsesOutput[]) {
    if (item?.type !== 'message' || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content as OpenAiResponsesOutputContent[]) {
      if (content?.type === 'output_text' && typeof content.text === 'string' && content.text.trim()) {
        return content.text;
      }
    }
  }

  return null;
}

function normalizeDifficulty(value: unknown): 'easy' | 'medium' | 'hard' {
  if (value === 'easy' || value === 'medium' || value === 'hard') {
    return value;
  }

  return 'medium';
}

function formatCourseLabel(courseCode: string | null, courseName: string) {
  return courseCode?.trim() ? `${courseCode.trim()} - ${courseName}` : courseName;
}

function truncateText(value: string, maxChars: number) {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function cleanText(value: string) {
  return value.replace(/\r\n/g, '\n').split('\u0000').join('').trim();
}

function normalizeQuizContextText(value: string) {
  return cleanText(value)
    .split('\n')
    .map((line) => line.replace(/^\s*(student|speaker|professor|lecturer|teacher)\s*[a-z0-9_-]*\s*:\s*/i, ''))
    .map((line) => line.replace(/^\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s*:\s*/, ''))
    .filter((line) => line.trim().length > 0)
    .join('\n');
}

function resolveLokiQuizQuestionCount(questionCount: number | undefined, message: string) {
  const requestedCount =
    typeof questionCount === 'number' && Number.isFinite(questionCount)
      ? questionCount
      : (() => {
          const match = message.match(/\b(\d{1,2})\s+(?:question|questions|quiz questions)\b/i);
          return match ? Number.parseInt(match[1] ?? '', 10) : DEFAULT_LOKI_QUIZ_QUESTION_COUNT;
        })();

  return Math.max(MIN_LOKI_QUIZ_QUESTION_COUNT, Math.min(MAX_LOKI_QUIZ_QUESTION_COUNT, Math.round(requestedCount)));
}

async function getQuizScopeForUser(userId: string, quizId: string) {
  const db = getDb();
  const rows = await db<{ scope: string }[]>`
    select scope
    from public.quizzes
    where id = ${quizId}::uuid
      and generated_by_user_id = ${userId}::uuid
    limit 1
  `;

  return rows[0]?.scope ?? null;
}

function mapStoredQuizToDailyQuickQuiz(quiz: StoredQuizRecord): DailyQuickQuizRecord {
  return {
    id: quiz.id,
    title: quiz.title,
    quizType: quiz.quizType,
    difficulty: quiz.difficulty,
    questionCount: quiz.questionCount,
    estimatedMinutes: quiz.estimatedMinutes,
    availableOn: quiz.availableOn ?? '',
    createdAt: quiz.createdAt,
    updatedAt: quiz.updatedAt,
    questions: quiz.questions.map((question) => ({
      id: question.id,
      questionOrder: question.questionOrder,
      questionType: question.questionType,
      questionText: question.questionText,
      explanation: question.explanation,
      difficulty: question.difficulty,
      isRelatedToAnyCourse: question.isRelatedToAnyCourse,
      createdAt: question.createdAt,
      options: question.options.map((option) => ({
        id: option.id,
        optionLabel: option.optionLabel,
        optionText: option.optionText,
        isCorrect: option.isCorrect,
        optionOrder: option.optionOrder,
        createdAt: option.createdAt,
      })),
    })),
  };
}

function buildQuizSchema(questionCount: number) {
  return {
    type: 'object',
    properties: {
      title: { type: 'string' },
      estimatedMinutes: { type: 'integer' },
      questions: {
        type: 'array',
        minItems: questionCount,
        maxItems: questionCount,
        items: {
          type: 'object',
          properties: {
            questionOrder: { type: 'integer' },
            questionText: { type: 'string' },
            explanation: { type: 'string' },
            difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
            isRelatedToAnyCourse: { type: 'boolean' },
            sourceExcerpt: { type: ['string', 'null'] },
            options: {
              type: 'array',
              minItems: 4,
              maxItems: 4,
              items: {
                type: 'object',
                properties: {
                  optionLabel: { type: 'string' },
                  optionText: { type: 'string' },
                  isCorrect: { type: 'boolean' },
                },
                required: ['optionLabel', 'optionText', 'isCorrect'],
                additionalProperties: false,
              },
            },
          },
          required: [
            'questionOrder',
            'questionText',
            'explanation',
            'difficulty',
            'isRelatedToAnyCourse',
            'sourceExcerpt',
            'options',
          ],
          additionalProperties: false,
        },
      },
    },
    required: ['title', 'estimatedMinutes', 'questions'],
    additionalProperties: false,
  } as const;
}

function nullable(value: string | null) {
  return value?.trim() ? value.trim() : null;
}

function normalizeOptionalInteger(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

const DAILY_QUIZ_SCHEMA = buildQuizSchema(DAILY_QUIZ_QUESTION_COUNT);

type DbDailyQuickQuizRow = {
  id: string;
  title: string | null;
  quizType: string;
  difficulty: string;
  questionCount: number | null;
  estimatedMinutes: number | null;
  availableOn: string | null;
  createdAt: string;
  updatedAt: string;
};

type DbDailyQuickQuizQuestionRow = {
  id: string;
  questionOrder: number;
  questionType: string;
  questionText: string;
  explanation: string | null;
  difficulty: string | null;
  isRelatedToAnyCourse: boolean;
  createdAt: string | null;
};

type DbDailyQuickQuizOptionRow = {
  id: string;
  questionId: string;
  optionLabel: string | null;
  optionText: string;
  isCorrect: boolean;
  optionOrder: number;
  createdAt: string | null;
};

type DbDailyQuickQuizAttemptRow = {
  id: string;
  quizId: string;
  userId: string;
  score: number | null;
  maxScore: number | null;
  percentageScore: number | null;
  timeSpentSeconds: number | null;
  isCompleted: boolean;
  startedAt: string | null;
  submittedAt: string | null;
  createdAt: string;
};

type DbDailyQuickQuizAttemptAnswerRow = {
  id: string;
  questionId: string;
  selectedOptionId: string | null;
  shortAnswerText: string | null;
  isCorrect: boolean | null;
  awardedPoints: number | null;
  answeredAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type DbDailyQuickQuizAnswerValidationRow = {
  quizId: string;
  questionId: string;
  questionOrder: number;
  selectedOptionId: string;
  isCorrect: boolean;
};

type DbDailyQuickQuizAttemptValidationRow = {
  questionId: string;
  questionOrder: number;
  selectedOptionId: string;
  isCorrect: boolean;
};

type DbQuizAttemptScoreRow = {
  answeredCount: number;
  score: number;
};
