# Flashcard DB Design

This design extends the existing flashcard tables so they can support both:

- lecture-scoped flashcard sets
- Loki-generated personal flashcard sets

Unlike quizzes, flashcards do not need attempt tables yet. The first version should stay read-only after generation, with progress and flipping state kept in UI state only.

## Why Change The Current Schema

The current schema already has `flashcard_sets` and `flashcards`, but it is too lecture-bound for the Loki flow:

- `flashcard_sets.lecture_id` is required
- there is no `scope` to distinguish lecture sets from Loki sets
- RLS only works through lecture course membership
- cards do not carry source metadata that is useful when a Loki set is generated from mixed context

## Supabase Design

### 1. Extend `public.flashcard_sets`

Keep the table, do not replace it.

Recommended columns:

```sql
alter table public.flashcard_sets
  alter column lecture_id drop not null;

alter table public.flashcard_sets
  add column if not exists scope varchar(20) not null default 'lecture',
  add column if not exists description text,
  add column if not exists source_count integer,
  add column if not exists generated_from_chat_message_id uuid references public.chat_messages(id) on delete set null,
  add column if not exists version_no integer not null default 1;

alter table public.flashcard_sets
  drop constraint if exists flashcard_sets_scope_check;

alter table public.flashcard_sets
  add constraint flashcard_sets_scope_check
  check (scope in ('lecture', 'loki'));

alter table public.flashcard_sets
  drop constraint if exists flashcard_sets_scope_context_check;

alter table public.flashcard_sets
  add constraint flashcard_sets_scope_context_check
  check (
    (
      scope = 'lecture'
      and lecture_id is not null
    )
    or (
      scope = 'loki'
      and lecture_id is null
      and generated_by_user_id is not null
    )
  );
```

Recommended meaning:

- `scope`
  Distinguishes a normal lecture flashcard set from a private Loki-generated one.
- `description`
  Optional subtitle shown in UI, for example "Generated from Week 4 transcript and 2 files".
- `source_count`
  Number of source items used during generation. Optional but useful for the UI.
- `generated_from_chat_message_id`
  Lets the Loki flow tie a set back to the originating assistant message if you want traceability later.
- `version_no`
  Keeps parity with quizzes and gives room for regeneration/versioning.

### 2. Extend `public.flashcards`

Keep the table, but add source metadata at card level.

```sql
alter table public.flashcards
  add column if not exists lecture_id uuid references public.lectures(id) on delete set null,
  add column if not exists source_type varchar(30),
  add column if not exists source_title varchar(255),
  add column if not exists source_excerpt text,
  add column if not exists explanation text;

alter table public.flashcards
  drop constraint if exists flashcards_source_type_check;

alter table public.flashcards
  add constraint flashcards_source_type_check
  check (
    source_type is null
    or source_type in ('lecture', 'course_file', 'course_metadata', 'chat')
  );
```

Recommended meaning:

- `lecture_id`
  Optional per-card lecture reference. Useful when a Loki set pulls from several lectures.
- `source_type`
  Mirrors the source categories already used in quiz generation.
- `source_title`
  Human-readable origin such as lecture title or file title.
- `source_excerpt`
  Small provenance snippet for future "show source" UI.
- `explanation`
  Optional extra teaching note, separate from `back_text`.

### 3. Indexes

```sql
create index if not exists idx_flashcard_sets_scope
  on public.flashcard_sets(scope);

create index if not exists idx_flashcard_sets_loki_generated_by_user_id
  on public.flashcard_sets(generated_by_user_id, created_at desc)
  where scope = 'loki';

create index if not exists idx_flashcards_lecture_id
  on public.flashcards(lecture_id);
```

Keep the existing indexes on `flashcard_sets(lecture_id)` and `flashcards(flashcard_set_id)`.

### 4. RLS Shape

Flashcards should follow the Loki quiz pattern:

- `lecture` sets/cards:
  visible to course members
- `loki` sets/cards:
  visible only to `generated_by_user_id = auth.uid()`
- insert/update/delete for `loki`:
  only the owner
- insert/update/delete for `lecture`:
  course managers/admin, same as current lecture-owned content

That means the existing flashcard RLS policies should be rewritten using `flashcard_sets.scope`, the same way quiz RLS was updated for `scope in ('daily_quick', 'loki')`.

## Local SQLite Design

Mirror the same shape in `cached_flashcard_sets` and `cached_flashcards`.

### `cached_flashcard_sets`

```sql
CREATE TABLE IF NOT EXISTS cached_flashcard_sets (
  id TEXT PRIMARY KEY NOT NULL,
  lecture_id TEXT REFERENCES cached_lectures(id) ON DELETE CASCADE,
  generated_by_user_id TEXT REFERENCES cached_users(id) ON DELETE SET NULL,
  processing_job_id TEXT REFERENCES cached_processing_jobs(id) ON DELETE SET NULL,
  generated_from_chat_message_id TEXT REFERENCES cached_chat_messages(id) ON DELETE SET NULL,
  title TEXT,
  description TEXT,
  scope TEXT NOT NULL DEFAULT 'lecture',
  is_ai_generated INTEGER NOT NULL DEFAULT 1 CHECK (is_ai_generated IN (0, 1)),
  card_count INTEGER,
  source_count INTEGER,
  version_no INTEGER NOT NULL DEFAULT 1,
  created_at TEXT,
  updated_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending_pull', 'pending_push', 'conflict')),
  dirty_fields_json TEXT,
  last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### `cached_flashcards`

```sql
CREATE TABLE IF NOT EXISTS cached_flashcards (
  id TEXT PRIMARY KEY NOT NULL,
  flashcard_set_id TEXT NOT NULL REFERENCES cached_flashcard_sets(id) ON DELETE CASCADE,
  lecture_id TEXT REFERENCES cached_lectures(id) ON DELETE SET NULL,
  front_text TEXT NOT NULL,
  back_text TEXT NOT NULL,
  hint_text TEXT,
  explanation TEXT,
  source_type TEXT,
  source_title TEXT,
  source_excerpt TEXT,
  card_order INTEGER NOT NULL,
  source_segment_index INTEGER,
  created_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending_pull', 'pending_push', 'conflict')),
  dirty_fields_json TEXT,
  last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (flashcard_set_id, card_order)
);
```

### Local Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_cached_flashcard_sets_scope
  ON cached_flashcard_sets(scope);

CREATE INDEX IF NOT EXISTS idx_cached_flashcard_sets_generated_by_user_id
  ON cached_flashcard_sets(generated_by_user_id);

CREATE INDEX IF NOT EXISTS idx_cached_flashcards_lecture_id
  ON cached_flashcards(lecture_id);
```

## Recommended API Shape

This is the record shape the DB is designed to support:

```ts
type FlashcardSetScope = 'lecture' | 'loki';

type FlashcardSetRecord = {
  id: string;
  lectureId: string | null;
  generatedByUserId: string | null;
  generatedFromChatMessageId: string | null;
  title: string | null;
  description: string | null;
  scope: FlashcardSetScope;
  isAiGenerated: boolean;
  cardCount: number | null;
  sourceCount: number | null;
  versionNo: number;
  createdAt: string;
  updatedAt: string;
  cards: FlashcardRecord[];
};

type FlashcardRecord = {
  id: string;
  flashcardSetId: string;
  lectureId: string | null;
  frontText: string;
  backText: string;
  hintText: string | null;
  explanation: string | null;
  sourceType: 'lecture' | 'course_file' | 'course_metadata' | 'chat' | null;
  sourceTitle: string | null;
  sourceExcerpt: string | null;
  cardOrder: number;
  sourceSegmentIndex: number | null;
  createdAt: string | null;
};
```

## What Not To Build Yet

Do not add these in the first pass:

- flashcard attempt tables
- per-card mastery / spaced repetition tables
- local outbox writes for flashcard review state
- deck sharing/public visibility

Those are separate features. For the first generation flow, the DB only needs to persist generated sets and cards.

## Migration Notes

- Add a new Supabase migration. Do not modify the existing init migration.
- Bump the local cache schema version and write a local migration that:
  - rebuilds `cached_flashcard_sets`
  - rebuilds `cached_flashcards`
  - preserves existing cached rows if you care about current dev data
- If you want the fastest path and do not care about existing local dev data, the local migration can recreate the two flashcard cache tables.

## Minimal Version If You Want Less Surface Area

If you want the leanest possible first pass, the true minimum change is:

- `flashcard_sets.lecture_id` nullable
- `flashcard_sets.scope` with `lecture | loki`
- Loki-aware RLS on `flashcard_sets` and `flashcards`
- local cache mirror of those same two changes

Everything else in this document is useful, but those four changes are the core requirement.
