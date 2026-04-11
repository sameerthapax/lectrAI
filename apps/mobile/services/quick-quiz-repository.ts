import type { RemoteDailyQuickQuizRecord } from './quick-quiz-api';
import {
  ensureDailyQuickQuizCacheReady,
  initializeLocalDatabase,
  runSerializedLocalWrite,
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

export async function getCachedDailyQuickQuiz(availableOn: string) {
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
    created_at: string | null;
  }>(
    `SELECT
       id,
       question_order,
       question_type,
       question_text,
       explanation,
       difficulty,
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

  return {
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
      createdAt: question.created_at,
      options: optionsByQuestionId.get(question.id) ?? [],
    })),
  };
}

export async function upsertDailyQuickQuiz(quiz: RemoteDailyQuickQuizRecord) {
  await runSerializedLocalWrite(async (db) => {
    await ensureDailyQuickQuizCacheReady(db);
    await db.withTransactionAsync(async () => {
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
          null,
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
             created_at,
             sync_status,
             dirty_fields_json,
             last_synced_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, CURRENT_TIMESTAMP)
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
    });
  });
}
