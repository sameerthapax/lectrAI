import { getDb } from '@lectrai/db';

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

export type DailyQuickQuizQuestionRecord = {
  id: string;
  questionOrder: number;
  questionType: string;
  questionText: string;
  explanation: string | null;
  difficulty: string | null;
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

export async function getDailyQuickQuizForUser(userId: string): Promise<DailyQuickQuizRecord | null> {
  const db = getDb();
  const userTimezone = await getUserTimezone(userId);
  const todayKey = getDateKeyForTimezone(userTimezone);
  const quizRows = await db<DbDailyQuickQuizRow[]>`
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
    where scope = 'daily_quick'
      and is_published = true
      and available_on = ${todayKey}::date
    order by created_at desc
    limit 1
  `;

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
      createdAt: question.createdAt,
      options: optionsByQuestionId.get(question.id) ?? [],
    })),
  };
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

type DbDailyQuickQuizRow = {
  id: string;
  title: string | null;
  quizType: string;
  difficulty: string;
  questionCount: number | null;
  estimatedMinutes: number | null;
  availableOn: string;
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
