import type { RemoteStoredFlashcardSetBundle } from './flashcards-api';
import {
  ensureFlashcardCacheReady,
  initializeLocalDatabase,
  runSerializedLocalWrite,
} from './local-db';

export type LocalFlashcardRecord = {
  id: string;
  lectureId: string | null;
  frontText: string;
  backText: string;
  hintText: string | null;
  explanation: string | null;
  sourceType: string | null;
  sourceTitle: string | null;
  sourceExcerpt: string | null;
  cardOrder: number;
  sourceSegmentIndex: number | null;
  createdAt: string | null;
};

export type LocalFlashcardSetRecord = {
  id: string;
  lectureId: string | null;
  generatedByUserId: string | null;
  title: string | null;
  description: string | null;
  scope: string;
  cardCount: number | null;
  sourceCount: number | null;
  versionNo: number;
  createdAt: string | null;
  updatedAt: string | null;
  cards: LocalFlashcardRecord[];
};

export type LocalFlashcardSetBundle = {
  flashcardSet: LocalFlashcardSetRecord;
};

export async function getCachedFlashcardSet(flashcardSetId: string) {
  const db = await initializeLocalDatabase();
  await ensureFlashcardCacheReady(db);

  const setRow = await db.getFirstAsync<{
    id: string;
    lecture_id: string | null;
    generated_by_user_id: string | null;
    title: string | null;
    description: string | null;
    scope: string;
    card_count: number | null;
    source_count: number | null;
    version_no: number;
    created_at: string | null;
    updated_at: string | null;
  }>(
    `SELECT
       id,
       lecture_id,
       generated_by_user_id,
       title,
       description,
       scope,
       card_count,
       source_count,
       version_no,
       created_at,
       updated_at
     FROM cached_flashcard_sets
     WHERE id = ?
     LIMIT 1`,
    [flashcardSetId]
  );

  if (!setRow) {
    return null;
  }

  const cardRows = await db.getAllAsync<{
    id: string;
    lecture_id: string | null;
    front_text: string;
    back_text: string;
    hint_text: string | null;
    explanation: string | null;
    source_type: string | null;
    source_title: string | null;
    source_excerpt: string | null;
    card_order: number;
    source_segment_index: number | null;
    created_at: string | null;
  }>(
    `SELECT
       id,
       lecture_id,
       front_text,
       back_text,
       hint_text,
       explanation,
       source_type,
       source_title,
       source_excerpt,
       card_order,
       source_segment_index,
       created_at
     FROM cached_flashcards
     WHERE flashcard_set_id = ?
     ORDER BY card_order ASC, created_at ASC`,
    [flashcardSetId]
  );

  return {
    flashcardSet: {
      id: setRow.id,
      lectureId: setRow.lecture_id,
      generatedByUserId: setRow.generated_by_user_id,
      title: setRow.title,
      description: setRow.description,
      scope: setRow.scope,
      cardCount: setRow.card_count,
      sourceCount: setRow.source_count,
      versionNo: setRow.version_no,
      createdAt: setRow.created_at,
      updatedAt: setRow.updated_at,
      cards: cardRows.map((row) => ({
        id: row.id,
        lectureId: row.lecture_id,
        frontText: row.front_text,
        backText: row.back_text,
        hintText: row.hint_text,
        explanation: row.explanation,
        sourceType: row.source_type,
        sourceTitle: row.source_title,
        sourceExcerpt: row.source_excerpt,
        cardOrder: row.card_order,
        sourceSegmentIndex: row.source_segment_index,
        createdAt: row.created_at,
      })),
    },
  };
}

export async function upsertFlashcardSet(bundle: RemoteStoredFlashcardSetBundle) {
  await runSerializedLocalWrite(async (db) => {
    await ensureFlashcardCacheReady(db);
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT INTO cached_flashcard_sets (
           id,
           lecture_id,
           generated_by_user_id,
           processing_job_id,
           generated_from_chat_message_id,
           title,
           description,
           scope,
           is_ai_generated,
           card_count,
           source_count,
           version_no,
           created_at,
           updated_at,
           sync_status,
           dirty_fields_json,
           last_synced_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 'synced', ?, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
           lecture_id = excluded.lecture_id,
           generated_by_user_id = excluded.generated_by_user_id,
           processing_job_id = excluded.processing_job_id,
           generated_from_chat_message_id = excluded.generated_from_chat_message_id,
           title = excluded.title,
           description = excluded.description,
           scope = excluded.scope,
           is_ai_generated = excluded.is_ai_generated,
           card_count = excluded.card_count,
           source_count = excluded.source_count,
           version_no = excluded.version_no,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at,
           sync_status = excluded.sync_status,
           dirty_fields_json = excluded.dirty_fields_json,
           last_synced_at = excluded.last_synced_at`,
        [
          bundle.flashcardSet.id,
          bundle.flashcardSet.lectureId,
          bundle.flashcardSet.generatedByUserId,
          null,
          null,
          bundle.flashcardSet.title,
          bundle.flashcardSet.description,
          bundle.flashcardSet.scope,
          bundle.flashcardSet.cardCount,
          bundle.flashcardSet.sourceCount,
          bundle.flashcardSet.versionNo,
          bundle.flashcardSet.createdAt,
          bundle.flashcardSet.updatedAt,
          JSON.stringify([]),
        ]
      );

      await db.runAsync('DELETE FROM cached_flashcards WHERE flashcard_set_id = ?', [bundle.flashcardSet.id]);

      for (const card of bundle.flashcardSet.cards) {
        await db.runAsync(
          `INSERT INTO cached_flashcards (
             id,
             flashcard_set_id,
             lecture_id,
             front_text,
             back_text,
             hint_text,
             explanation,
             source_type,
             source_title,
             source_excerpt,
             card_order,
             source_segment_index,
             created_at,
             sync_status,
             dirty_fields_json,
             last_synced_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, CURRENT_TIMESTAMP)
           ON CONFLICT(id) DO UPDATE SET
             flashcard_set_id = excluded.flashcard_set_id,
             lecture_id = excluded.lecture_id,
             front_text = excluded.front_text,
             back_text = excluded.back_text,
             hint_text = excluded.hint_text,
             explanation = excluded.explanation,
             source_type = excluded.source_type,
             source_title = excluded.source_title,
             source_excerpt = excluded.source_excerpt,
             card_order = excluded.card_order,
             source_segment_index = excluded.source_segment_index,
             created_at = excluded.created_at,
             sync_status = excluded.sync_status,
             dirty_fields_json = excluded.dirty_fields_json,
             last_synced_at = excluded.last_synced_at`,
          [
            card.id,
            bundle.flashcardSet.id,
            card.lectureId,
            card.frontText,
            card.backText,
            card.hintText,
            card.explanation,
            card.sourceType,
            card.sourceTitle,
            card.sourceExcerpt,
            card.cardOrder,
            card.sourceSegmentIndex,
            card.createdAt,
            JSON.stringify([]),
          ]
        );
      }
    });
  });
}
