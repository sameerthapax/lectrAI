# Local Cache DB

This SQLite database is the phone-side cache and sync boundary for the mobile app. It is intentionally based on the Supabase schema, but it is not a full mirror of the backend.

## Goals

- Keep the app usable offline for the main learning flows.
- Make repeated reads fast without hitting the network on every screen.
- Queue local mutations and replay them to the main database when connectivity returns.
- Preserve a schema that is close enough to Supabase that mapping logic is predictable.

## What We Cache

The local cache mirrors the mobile-facing parts of the main database:

- identity: `cached_users`, `cached_user_settings`
- courses: `cached_courses`, `cached_course_members`
- lecture graph: `cached_lectures`, `cached_lecture_tags`
- lecture content: `cached_audio_files`, `cached_processing_jobs`, `cached_transcripts`, `cached_transcript_segments`, `cached_lecture_summaries`, `cached_key_concepts`, `cached_timeline_events`, `cached_study_materials`
- study flows: `cached_quizzes`, `cached_quiz_questions`, `cached_quiz_options`, `local_quiz_attempts`, `local_quiz_attempt_answers`, `cached_flashcard_sets`, `cached_flashcards`
- chat: `cached_chat_sessions`, `cached_chat_messages`, `cached_chat_citations`

## What We Do Not Mirror

These stay server-side for now:

- `embedding_documents`
  Reason: too large for the device cache and not useful without server-side retrieval/search orchestration.
- raw analytics such as `activity_logs`
  Reason: append-only telemetry belongs in the backend pipeline, not the offline cache.

## Local-Only System Tables

- `cache_meta`
  Stores app-level metadata such as schema version and current user markers.
- `sync_state`
  Tracks full and delta sync cursors per entity and per scope.
- `sync_outbox`
  Queues writes created on device while offline or while waiting for background sync.
- `downloaded_assets`
  Maps remote files to local paths for durable offline playback and attachments.
- `local_upload_queue`
  Tracks audio or file uploads that still need to be sent upstream.

## Sync Model

1. Bootstrap sync
   Pull the current user, settings, courses, and lecture graph first.
2. Scoped content sync
   Sync heavy lecture content by scope, usually per course or per lecture, not globally.
3. Delta sync
   Use `updated_at` or server cursors per entity and store progress in `sync_state`.
4. Outbox replay
   Queue local writes in `sync_outbox`, mark affected rows as `pending_push`, then reconcile when the server confirms them.
5. Conflict handling
   Default to server-wins for read-mostly content.
   Preserve device-created work such as quiz attempts, chat drafts, and pending uploads until the server acknowledges them.

## Table Design Rules

- IDs are stored as `TEXT` to match UUIDs cleanly.
- Timestamps are stored as ISO-8601 `TEXT`.
- JSON columns from Supabase become `TEXT` containing JSON.
- Boolean values are stored as `INTEGER` with `0/1` checks.
- Most cached entities include:
  - `sync_status`
  - `dirty_fields_json`
  - `last_synced_at`

This keeps the local store ready for selective sync and conflict resolution without requiring a separate shadow table for every entity.

## First Local Backend Tasks

- Build repository functions around each domain slice instead of querying SQLite directly from screens.
- Add mappers from Supabase payloads into these cached tables.
- Add outbox writers for:
  - quiz attempts
  - chat sessions and messages
  - file uploads
- Add read APIs optimized for the app:
  - course list with membership summary
  - lecture detail with transcript and summaries
  - quiz detail with questions and options
  - chat session timeline

## Current Implementation

The schema is defined in [`apps/mobile/services/local-db.ts`](/Users/sams/WebstormProjects/lectrai/apps/mobile/services/local-db.ts). Initialization is handled by `initializeLocalDatabase()`, and logout/reset flows can use `clearLocalCache()`.
