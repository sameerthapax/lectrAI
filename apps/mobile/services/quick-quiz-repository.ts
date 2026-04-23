import {
  submitDailyQuickQuizAttempt,
  type RemoteDailyQuickQuizAttemptRecord,
  type RemoteDailyQuickQuizBundle,
} from './quick-quiz-api';
import {
  ensureDailyQuickQuizCacheReady,
  initializeLocalDatabase,
  runSerializedLocalWrite,
  type SyncStatus,
} from './local-db';

export type LocalDailyQuickQuizOptionRecord = {
  id: string;
  optionLabel: string | null;
  optionText: string;
  isCorrect: boolean;
  optionOrder: number;
  createdAt: string | null;
};

export type LocalDailyQuickQuizQuestionRecord = {
  id: string;
  questionOrder: number;
  questionType: string;
  questionText: string;
  explanation: string | null;
  difficulty: string | null;
  isRelatedToAnyCourse: boolean;
  createdAt: string | null;
  options: LocalDailyQuickQuizOptionRecord[];
};

export type LocalDailyQuickQuizRecord = {
  id: string;
  title: string | null;
  quizType: string;
  difficulty: string;
  questionCount: number | null;
  estimatedMinutes: number | null;
  availableOn: string;
  createdAt: string | null;
  updatedAt: string | null;
  questions: LocalDailyQuickQuizQuestionRecord[];
};

export type LocalDailyQuickQuizAttemptAnswerRecord = {
  id: string;
  serverId: string | null;
  questionId: string;
  selectedOptionId: string | null;
  shortAnswerText: string | null;
  isCorrect: boolean | null;
  awardedPoints: number | null;
  answeredAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  syncStatus: SyncStatus;
};

export type LocalDailyQuickQuizAttemptRecord = {
  id: string;
  serverId: string | null;
  quizId: string;
  userId: string;
  score: number | null;
  maxScore: number | null;
  percentageScore: number | null;
  timeSpentSeconds: number | null;
  isCompleted: boolean;
  startedAt: string | null;
  submittedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  syncStatus: SyncStatus;
  answers: LocalDailyQuickQuizAttemptAnswerRecord[];
};

export type LocalDailyQuickQuizBundle = {
  quiz: LocalDailyQuickQuizRecord;
  attempt: LocalDailyQuickQuizAttemptRecord | null;
};

export async function getCachedDailyQuickQuiz(availableOn: string, userId: string) {
  const db = await initializeLocalDatabase();
  await ensureDailyQuickQuizCacheReady(db);
  const quizRow = await db.getFirstAsync<{
    id: string;
    title: string | null;
    quiz_type: string;
    difficulty: string;
    question_count: number | null;
    estimated_minutes: number | null;
    available_on: string;
    created_at: string | null;
    updated_at: string | null;
  }>(
    `SELECT
       id,
       title,
       quiz_type,
       difficulty,
       question_count,
       estimated_minutes,
       available_on,
       created_at,
       updated_at
     FROM cached_quizzes
     WHERE scope = 'daily_quick'
       AND available_on = ?
     LIMIT 1`,
    [availableOn]
  );

  if (!quizRow) {
    return null;
  }

  const questionRows = await db.getAllAsync<{
    id: string;
    question_order: number;
    question_type: string;
    question_text: string;
    explanation: string | null;
    difficulty: string | null;
    is_related_to_any_course: number | null;
    created_at: string | null;
  }>(
    `SELECT
       id,
       question_order,
       question_type,
       question_text,
       explanation,
       difficulty,
       is_related_to_any_course,
       created_at
     FROM cached_quiz_questions
     WHERE quiz_id = ?
     ORDER BY question_order ASC, created_at ASC`,
    [quizRow.id]
  );

  const optionRows = await db.getAllAsync<{
    id: string;
    question_id: string;
    option_label: string | null;
    option_text: string;
    is_correct: number;
    option_order: number;
    created_at: string | null;
  }>(
    `SELECT
       id,
       question_id,
       option_label,
       option_text,
       is_correct,
       option_order,
       created_at
     FROM cached_quiz_options
     WHERE question_id IN (
       SELECT id
       FROM cached_quiz_questions
       WHERE quiz_id = ?
     )
     ORDER BY question_id ASC, option_order ASC, created_at ASC`,
    [quizRow.id]
  );

  const optionsByQuestionId = new Map<string, LocalDailyQuickQuizOptionRecord[]>();

  for (const option of optionRows) {
    const nextOptions = optionsByQuestionId.get(option.question_id) ?? [];
    nextOptions.push({
      id: option.id,
      optionLabel: option.option_label,
      optionText: option.option_text,
      isCorrect: option.is_correct === 1,
      optionOrder: option.option_order,
      createdAt: option.created_at,
    });
    optionsByQuestionId.set(option.question_id, nextOptions);
  }

  const quiz: LocalDailyQuickQuizRecord = {
    id: quizRow.id,
    title: quizRow.title,
    quizType: quizRow.quiz_type,
    difficulty: quizRow.difficulty,
    questionCount: quizRow.question_count,
    estimatedMinutes: quizRow.estimated_minutes,
    availableOn: quizRow.available_on,
    createdAt: quizRow.created_at,
    updatedAt: quizRow.updated_at,
    questions: questionRows.map((question) => ({
      id: question.id,
      questionOrder: question.question_order,
      questionType: question.question_type,
      questionText: question.question_text,
      explanation: question.explanation,
      difficulty: question.difficulty,
      isRelatedToAnyCourse: question.is_related_to_any_course !== 0,
      createdAt: question.created_at,
      options: optionsByQuestionId.get(question.id) ?? [],
    })),
  };

  const attempt = await getCachedDailyQuickQuizAttempt(db, quiz.id, userId);

  return { quiz, attempt };
}

export async function upsertDailyQuickQuiz(bundle: RemoteDailyQuickQuizBundle) {
  if (!bundle.quiz) {
    return;
  }

  const quiz = bundle.quiz;

  await runSerializedLocalWrite(async (db) => {
    await ensureDailyQuickQuizCacheReady(db);
    await db.withTransactionAsync(async () => {
      const existingQuizForDate = await db.getFirstAsync<{ id: string }>(
        `SELECT id
         FROM cached_quizzes
         WHERE scope = 'daily_quick'
           AND available_on = ?
         LIMIT 1`,
        [quiz.availableOn]
      );

      const incompleteAttemptForDate = await db.getFirstAsync<{
        id: string;
        quiz_id: string;
      }>(
        `SELECT
           local_quiz_attempts.id,
           local_quiz_attempts.quiz_id
         FROM local_quiz_attempts
         INNER JOIN cached_quizzes
           ON cached_quizzes.id = local_quiz_attempts.quiz_id
         WHERE cached_quizzes.scope = 'daily_quick'
           AND cached_quizzes.available_on = ?
           AND local_quiz_attempts.is_completed = 0
         LIMIT 1`,
        [quiz.availableOn]
      );

      // Keep the in-progress local quiz stable until the user finishes it.
      // Refreshing cached questions/options is destructive because local answers
      // reference those rows and get cascaded away if we delete them.
      if (
        incompleteAttemptForDate &&
        (!existingQuizForDate || existingQuizForDate.id === incompleteAttemptForDate.quiz_id)
      ) {
        return;
      }

      if (
        existingQuizForDate &&
        existingQuizForDate.id !== quiz.id &&
        incompleteAttemptForDate
      ) {
        return;
      }

      await db.runAsync(
        `DELETE FROM cached_quizzes
         WHERE scope = 'daily_quick'
           AND available_on = ?
           AND id <> ?`,
        [quiz.availableOn, quiz.id]
      );

      await db.runAsync(
        `INSERT INTO cached_quizzes (
           id,
           lecture_id,
           generated_by_user_id,
           processing_job_id,
           title,
           quiz_type,
           difficulty,
           question_count,
           estimated_minutes,
           is_ai_generated,
           is_published,
           version_no,
           scope,
           available_on,
           created_at,
           updated_at,
           sync_status,
           dirty_fields_json,
           last_synced_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1, 'daily_quick', ?, ?, ?, 'synced', ?, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
           lecture_id = excluded.lecture_id,
           generated_by_user_id = excluded.generated_by_user_id,
           processing_job_id = excluded.processing_job_id,
           title = excluded.title,
           quiz_type = excluded.quiz_type,
           difficulty = excluded.difficulty,
           question_count = excluded.question_count,
           estimated_minutes = excluded.estimated_minutes,
           is_ai_generated = excluded.is_ai_generated,
           is_published = excluded.is_published,
           version_no = excluded.version_no,
           scope = excluded.scope,
           available_on = excluded.available_on,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at,
           sync_status = excluded.sync_status,
           dirty_fields_json = excluded.dirty_fields_json,
           last_synced_at = excluded.last_synced_at`,
        [
          quiz.id,
          null,
          bundle.attempt?.userId ?? null,
          null,
          quiz.title,
          quiz.quizType,
          quiz.difficulty,
          quiz.questionCount,
          quiz.estimatedMinutes,
          quiz.availableOn,
          quiz.createdAt,
          quiz.updatedAt,
          JSON.stringify([]),
        ]
      );

      await db.runAsync(
        `DELETE FROM cached_quiz_options
         WHERE question_id IN (
           SELECT id
           FROM cached_quiz_questions
           WHERE quiz_id = ?
         )`,
        [quiz.id]
      );
      await db.runAsync('DELETE FROM cached_quiz_questions WHERE quiz_id = ?', [quiz.id]);

      for (const question of quiz.questions) {
        await db.runAsync(
          `INSERT INTO cached_quiz_questions (
             id,
             quiz_id,
             lecture_id,
             question_order,
             question_type,
             question_text,
             explanation,
             source_excerpt,
             source_segment_index,
             difficulty,
             points,
             is_related_to_any_course,
             created_at,
             sync_status,
             dirty_fields_json,
             last_synced_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, CURRENT_TIMESTAMP)
           ON CONFLICT(id) DO UPDATE SET
             quiz_id = excluded.quiz_id,
             lecture_id = excluded.lecture_id,
             question_order = excluded.question_order,
             question_type = excluded.question_type,
             question_text = excluded.question_text,
             explanation = excluded.explanation,
             source_excerpt = excluded.source_excerpt,
             source_segment_index = excluded.source_segment_index,
             difficulty = excluded.difficulty,
             points = excluded.points,
             is_related_to_any_course = excluded.is_related_to_any_course,
             created_at = excluded.created_at,
             sync_status = excluded.sync_status,
             dirty_fields_json = excluded.dirty_fields_json,
             last_synced_at = excluded.last_synced_at`,
          [
            question.id,
            quiz.id,
            null,
            question.questionOrder,
            question.questionType,
            question.questionText,
            question.explanation,
            null,
            null,
            question.difficulty,
            null,
            question.isRelatedToAnyCourse ? 1 : 0,
            question.createdAt,
            JSON.stringify([]),
          ]
        );

        for (const option of question.options) {
          await db.runAsync(
            `INSERT INTO cached_quiz_options (
               id,
               question_id,
               option_label,
               option_text,
               is_correct,
               option_order,
               created_at,
               sync_status,
               dirty_fields_json,
               last_synced_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, 'synced', ?, CURRENT_TIMESTAMP)
             ON CONFLICT(id) DO UPDATE SET
               question_id = excluded.question_id,
               option_label = excluded.option_label,
               option_text = excluded.option_text,
               is_correct = excluded.is_correct,
               option_order = excluded.option_order,
               created_at = excluded.created_at,
               sync_status = excluded.sync_status,
               dirty_fields_json = excluded.dirty_fields_json,
               last_synced_at = excluded.last_synced_at`,
            [
              option.id,
              question.id,
              option.optionLabel,
              option.optionText,
              option.isCorrect ? 1 : 0,
              option.optionOrder,
              option.createdAt,
              JSON.stringify([]),
            ]
          );
        }
      }

      if (bundle.attempt) {
        await upsertAttemptIntoCache(db, bundle.attempt);
      }
    });
  });
}

export async function answerDailyQuickQuizQuestion(input: {
  userId: string;
  quizId: string;
  questionId: string;
  selectedOptionId: string;
  timeSpentSeconds?: number | null;
}) {
  await upsertOptimisticLocalAnswer(input);
  const cachedBundle = await getCachedDailyQuickQuizForQuizId(input.quizId, input.userId);

  if (!cachedBundle) {
    throw new Error('Quiz answer was saved locally but the cached quiz could not be reloaded.');
  }

  return cachedBundle;
}

export async function completeDailyQuickQuizAttempt(input: {
  userId: string;
  accessToken: string;
  quizId: string;
  timeSpentSeconds?: number | null;
}) {
  const finalizedBundle = await finalizeLocalDailyQuickQuizAttempt(input);

  if (!finalizedBundle.attempt?.isCompleted) {
    return finalizedBundle;
  }

  try {
    const remoteBundle = await submitDailyQuickQuizAttempt(input.accessToken, {
      quizId: input.quizId,
      answers: finalizedBundle.attempt.answers
        .filter((answer) => answer.selectedOptionId)
        .map((answer) => ({
          questionId: answer.questionId,
          selectedOptionId: answer.selectedOptionId as string,
        })),
      timeSpentSeconds: finalizedBundle.attempt.timeSpentSeconds,
    });
    await upsertDailyQuickQuiz(remoteBundle);

    const cachedBundle = await getCachedDailyQuickQuizForQuizId(input.quizId, input.userId);

    if (!cachedBundle) {
      throw new Error('Quiz attempt synced but local cache could not be refreshed.');
    }

    return cachedBundle;
  } catch {
    return finalizedBundle;
  }
}

export async function syncPendingCompletedDailyQuickQuizAttempts(input: {
  userId: string;
  accessToken: string;
  quizId?: string;
}) {
  const db = await initializeLocalDatabase();
  const pendingAttempts = await db.getAllAsync<{ quiz_id: string }>(
    `SELECT DISTINCT quiz_id
     FROM local_quiz_attempts
     WHERE user_id = ?
       AND is_completed = 1
       AND sync_status = 'pending_push'
       ${input.quizId ? 'AND quiz_id = ?' : ''}
     ORDER BY updated_at ASC, created_at ASC`,
    input.quizId ? [input.userId, input.quizId] : [input.userId]
  );

  for (const attempt of pendingAttempts) {
    const cachedBundle = await getCachedDailyQuickQuizForQuizId(attempt.quiz_id, input.userId);

    if (!cachedBundle?.attempt?.isCompleted) {
      continue;
    }

    try {
      const remoteBundle = await submitDailyQuickQuizAttempt(input.accessToken, {
        quizId: attempt.quiz_id,
        answers: cachedBundle.attempt.answers
          .filter((answer) => answer.selectedOptionId)
          .map((answer) => ({
            questionId: answer.questionId,
            selectedOptionId: answer.selectedOptionId as string,
          })),
        timeSpentSeconds: cachedBundle.attempt.timeSpentSeconds,
      });
      await upsertDailyQuickQuiz(remoteBundle);
    } catch {
      // Keep the completed attempt pending and retry on the next app open.
    }
  }
}

async function getCachedDailyQuickQuizForQuizId(quizId: string, userId: string) {
  const db = await initializeLocalDatabase();
  const row = await db.getFirstAsync<{ available_on: string | null }>(
    `SELECT available_on FROM cached_quizzes WHERE id = ? LIMIT 1`,
    [quizId]
  );

  if (!row?.available_on) {
    return null;
  }

  return getCachedDailyQuickQuiz(row.available_on, userId);
}

async function getCachedDailyQuickQuizAttempt(
  db: Awaited<ReturnType<typeof initializeLocalDatabase>>,
  quizId: string,
  userId: string
) {
  const attemptRow = await db.getFirstAsync<{
    id: string;
    server_id: string | null;
    quiz_id: string;
    user_id: string;
    score: number | null;
    max_score: number | null;
    percentage_score: number | null;
    time_spent_seconds: number | null;
    is_completed: number;
    started_at: string | null;
    submitted_at: string | null;
    created_at: string | null;
    updated_at: string | null;
    sync_status: SyncStatus;
  }>(
    `SELECT
       id,
       server_id,
       quiz_id,
       user_id,
       score,
       max_score,
       percentage_score,
       time_spent_seconds,
       is_completed,
       started_at,
       submitted_at,
       created_at,
       updated_at,
       sync_status
     FROM local_quiz_attempts
     WHERE quiz_id = ?
       AND user_id = ?
     ORDER BY is_completed ASC, created_at DESC
     LIMIT 1`,
    [quizId, userId]
  );

  if (!attemptRow) {
    return null;
  }

  const answerRows = await db.getAllAsync<{
    id: string;
    server_id: string | null;
    question_id: string;
    selected_option_id: string | null;
    short_answer_text: string | null;
    is_correct: number | null;
    awarded_points: number | null;
    answered_at: string | null;
    created_at: string | null;
    updated_at: string | null;
    sync_status: SyncStatus;
  }>(
    `SELECT
       id,
       server_id,
       question_id,
       selected_option_id,
       short_answer_text,
       is_correct,
       awarded_points,
       answered_at,
       created_at,
       updated_at,
       sync_status
     FROM local_quiz_attempt_answers
     WHERE quiz_attempt_id = ?
     ORDER BY created_at ASC`,
    [attemptRow.id]
  );

  return {
    id: attemptRow.id,
    serverId: attemptRow.server_id,
    quizId: attemptRow.quiz_id,
    userId: attemptRow.user_id,
    score: attemptRow.score,
    maxScore: attemptRow.max_score,
    percentageScore: attemptRow.percentage_score,
    timeSpentSeconds: attemptRow.time_spent_seconds,
    isCompleted: attemptRow.is_completed === 1,
    startedAt: attemptRow.started_at,
    submittedAt: attemptRow.submitted_at,
    createdAt: attemptRow.created_at,
    updatedAt: attemptRow.updated_at,
    syncStatus: attemptRow.sync_status,
    answers: answerRows.map((answer) => ({
      id: answer.id,
      serverId: answer.server_id,
      questionId: answer.question_id,
      selectedOptionId: answer.selected_option_id,
      shortAnswerText: answer.short_answer_text,
      isCorrect: answer.is_correct == null ? null : answer.is_correct === 1,
      awardedPoints: answer.awarded_points,
      answeredAt: answer.answered_at,
      createdAt: answer.created_at,
      updatedAt: answer.updated_at,
      syncStatus: answer.sync_status,
    })),
  } satisfies LocalDailyQuickQuizAttemptRecord;
}

async function upsertAttemptIntoCache(
  db: Awaited<ReturnType<typeof initializeLocalDatabase>>,
  attempt: RemoteDailyQuickQuizAttemptRecord
) {
  const localAttemptId =
    (
      await db.getFirstAsync<{ id: string }>(
        `SELECT id
         FROM local_quiz_attempts
         WHERE server_id = ?
            OR (quiz_id = ? AND user_id = ?)
         ORDER BY created_at DESC
         LIMIT 1`,
        [attempt.id, attempt.quizId, attempt.userId]
      )
    )?.id ?? attempt.id;

  await db.runAsync(
    `INSERT INTO local_quiz_attempts (
       id,
       server_id,
       quiz_id,
       user_id,
       score,
       max_score,
       percentage_score,
       time_spent_seconds,
       is_completed,
       started_at,
       submitted_at,
       created_at,
       updated_at,
       sync_status,
       dirty_fields_json,
       last_synced_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET
       server_id = excluded.server_id,
       quiz_id = excluded.quiz_id,
       user_id = excluded.user_id,
       score = excluded.score,
       max_score = excluded.max_score,
       percentage_score = excluded.percentage_score,
       time_spent_seconds = excluded.time_spent_seconds,
       is_completed = excluded.is_completed,
       started_at = excluded.started_at,
       submitted_at = excluded.submitted_at,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at,
       sync_status = excluded.sync_status,
       dirty_fields_json = excluded.dirty_fields_json,
       last_synced_at = excluded.last_synced_at`,
    [
      localAttemptId,
      attempt.id,
      attempt.quizId,
      attempt.userId,
      attempt.score,
      attempt.maxScore,
      attempt.percentageScore,
      attempt.timeSpentSeconds,
      attempt.isCompleted ? 1 : 0,
      attempt.startedAt,
      attempt.submittedAt,
      attempt.createdAt,
      attempt.submittedAt ?? attempt.startedAt ?? attempt.createdAt,
      JSON.stringify([]),
    ]
  );

  for (const answer of attempt.answers) {
    const localAnswerId =
      (
        await db.getFirstAsync<{ id: string }>(
          `SELECT id
           FROM local_quiz_attempt_answers
           WHERE server_id = ?
              OR (quiz_attempt_id = ? AND question_id = ?)
           LIMIT 1`,
          [answer.id, localAttemptId, answer.questionId]
        )
      )?.id ?? answer.id;

    await db.runAsync(
      `INSERT INTO local_quiz_attempt_answers (
         id,
         server_id,
         quiz_attempt_id,
         question_id,
         selected_option_id,
         short_answer_text,
         is_correct,
         awarded_points,
         answered_at,
         created_at,
         updated_at,
         sync_status,
         dirty_fields_json,
         last_synced_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
         server_id = excluded.server_id,
         quiz_attempt_id = excluded.quiz_attempt_id,
         question_id = excluded.question_id,
         selected_option_id = excluded.selected_option_id,
         short_answer_text = excluded.short_answer_text,
         is_correct = excluded.is_correct,
         awarded_points = excluded.awarded_points,
         answered_at = excluded.answered_at,
         created_at = excluded.created_at,
         updated_at = excluded.updated_at,
         sync_status = excluded.sync_status,
         dirty_fields_json = excluded.dirty_fields_json,
         last_synced_at = excluded.last_synced_at`,
      [
        localAnswerId,
        answer.id,
        localAttemptId,
        answer.questionId,
        answer.selectedOptionId,
        answer.shortAnswerText,
        answer.isCorrect == null ? null : answer.isCorrect ? 1 : 0,
        answer.awardedPoints,
        answer.answeredAt,
        answer.createdAt,
        answer.updatedAt,
        JSON.stringify([]),
      ]
    );
  }
}

async function upsertOptimisticLocalAnswer(input: {
  userId: string;
  quizId: string;
  questionId: string;
  selectedOptionId: string;
  timeSpentSeconds?: number | null;
}) {
  return runSerializedLocalWrite(async (db) => {
    await ensureDailyQuickQuizCacheReady(db);
    const now = new Date().toISOString();
    const selectedOption = await db.getFirstAsync<{ is_correct: number }>(
      `SELECT is_correct
       FROM cached_quiz_options
       WHERE id = ?
       LIMIT 1`,
      [input.selectedOptionId]
    );

    if (!selectedOption) {
      throw new Error('Selected quiz option is not available in the local cache.');
    }

    const existingAttempt =
      await db.getFirstAsync<{ id: string }>(
        `SELECT id
         FROM local_quiz_attempts
         WHERE quiz_id = ?
           AND user_id = ?
           AND is_completed = 0
         ORDER BY created_at DESC
         LIMIT 1`,
        [input.quizId, input.userId]
      );

    const localAttemptId = existingAttempt?.id ?? createLocalId();

    await db.runAsync(
      `INSERT INTO local_quiz_attempts (
         id,
         server_id,
         quiz_id,
         user_id,
         score,
         max_score,
         percentage_score,
         time_spent_seconds,
         is_completed,
         started_at,
         submitted_at,
         created_at,
         updated_at,
         sync_status,
         dirty_fields_json,
         last_synced_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_push', ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
         time_spent_seconds = excluded.time_spent_seconds,
         is_completed = excluded.is_completed,
         updated_at = excluded.updated_at,
         sync_status = 'pending_push',
         dirty_fields_json = excluded.dirty_fields_json,
         last_synced_at = excluded.last_synced_at`,
      [
        localAttemptId,
        null,
        input.quizId,
        input.userId,
        null,
        null,
        null,
        normalizeOptionalInteger(input.timeSpentSeconds),
        0,
        now,
        null,
        now,
        now,
        JSON.stringify(['selected_option_id']),
      ]
    );

    const existingAnswer = await db.getFirstAsync<{ id: string }>(
      `SELECT id
       FROM local_quiz_attempt_answers
       WHERE quiz_attempt_id = ?
         AND question_id = ?
       LIMIT 1`,
      [localAttemptId, input.questionId]
    );
    const localAnswerId = existingAnswer?.id ?? createLocalId();

    await db.runAsync(
      `INSERT INTO local_quiz_attempt_answers (
         id,
         server_id,
         quiz_attempt_id,
         question_id,
         selected_option_id,
         short_answer_text,
         is_correct,
         awarded_points,
         answered_at,
         created_at,
         updated_at,
         sync_status,
         dirty_fields_json,
         last_synced_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_push', ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO NOTHING`,
      [
        localAnswerId,
        null,
        localAttemptId,
        input.questionId,
        input.selectedOptionId,
        null,
        selectedOption.is_correct === 1 ? 1 : 0,
        selectedOption.is_correct === 1 ? 1 : 0,
        now,
        now,
        now,
        JSON.stringify(['selected_option_id']),
      ]
    );

    return localAttemptId;
  });
}

async function finalizeLocalDailyQuickQuizAttempt(input: {
  userId: string;
  quizId: string;
  timeSpentSeconds?: number | null;
}) {
  await runSerializedLocalWrite(async (db) => {
    await ensureDailyQuickQuizCacheReady(db);
    const now = new Date().toISOString();
    const attempt = await db.getFirstAsync<{ id: string; created_at: string | null }>(
      `SELECT id, created_at
       FROM local_quiz_attempts
       WHERE quiz_id = ?
         AND user_id = ?
       ORDER BY is_completed ASC, created_at DESC
       LIMIT 1`,
      [input.quizId, input.userId]
    );

    if (!attempt) {
      throw new Error('Local quiz attempt not found.');
    }

    const answerStats = await db.getFirstAsync<{
      answered_count: number;
      score: number | null;
    }>(
      `SELECT
         COUNT(*) as answered_count,
         COALESCE(SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END), 0) as score
       FROM local_quiz_attempt_answers
       WHERE quiz_attempt_id = ?`,
      [attempt.id]
    );

    const questionCountRow = await db.getFirstAsync<{ question_count: number }>(
      `SELECT COUNT(*) as question_count
       FROM cached_quiz_questions
       WHERE quiz_id = ?`,
      [input.quizId]
    );

    const answeredCount = answerStats?.answered_count ?? 0;
    const maxScore = questionCountRow?.question_count ?? 0;

    if (maxScore === 0 || answeredCount < maxScore) {
      return;
    }

    const score = answerStats?.score ?? 0;
    const percentageScore = maxScore > 0 ? (score / maxScore) * 100 : null;

    await db.runAsync(
      `UPDATE local_quiz_attempts
       SET score = ?,
           max_score = ?,
           percentage_score = ?,
           time_spent_seconds = ?,
           is_completed = 1,
           submitted_at = ?,
           updated_at = ?,
           sync_status = 'pending_push',
           dirty_fields_json = ?
       WHERE id = ?`,
      [
        score,
        maxScore,
        percentageScore,
        normalizeOptionalInteger(input.timeSpentSeconds),
        now,
        now,
        JSON.stringify(['attempt_submission']),
        attempt.id,
      ]
    );

    await db.runAsync(
      `UPDATE local_quiz_attempt_answers
       SET updated_at = ?,
           sync_status = 'pending_push',
           dirty_fields_json = ?
       WHERE quiz_attempt_id = ?`,
      [now, JSON.stringify(['attempt_submission']), attempt.id]
    );
  });

  const cachedBundle = await getCachedDailyQuickQuizForQuizId(input.quizId, input.userId);

  if (!cachedBundle) {
    throw new Error('Quiz attempt was finalized locally but the cached quiz could not be reloaded.');
  }

  return cachedBundle;
}

function normalizeOptionalInteger(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

function createLocalId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `quiz-local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
