# Lecture Audio Chunk Pipeline

## Current System

### Current DB schema

The lecture audio pipeline currently relies on one primary audio object and one transcript per lecture.

- `lectures`
  - Stores lecture metadata such as `course_id`, `title`, `status`, `duration_seconds`, and `recorded_at`.
  - `status` assumes a single linear pipeline: `draft | uploading | processing | ready | failed | archived`.
- `audio_files`
  - Stores one uploaded audio object per lecture in practice.
  - Key columns: `lecture_id`, `bucket_name`, `object_path`, `original_filename`, `mime_type`, `file_size_bytes`, `duration_seconds`, `is_primary`, `upload_status`.
- `processing_jobs`
  - Tracks lecture-level work with one job row per stage.
  - Existing `job_type` values were designed around single-file processing.
- `transcripts`
  - Stores one raw transcript per lecture.
  - References a single `source_audio_file_id`.
- `transcript_segments`
  - Stores raw diarized segments for a lecture transcript.
  - Segment timing is lecture-relative, but current ingestion assumes the source came from one uploaded file.
- `processed_transcripts`
  - Stores the post-processed lecture transcript with canonical speaker labels and formatted paragraphs.
- `transcript_chunks`
  - Stores embedding-ready transcript chunks derived from `processed_transcripts`.

### Current upload flow

1. The mobile app records audio locally with `expo-audio`.
2. `apps/mobile/services/recordings-repository.ts` copies the recording into local app storage.
3. The same service reads the entire file into base64 and sends it to `POST /lectures/recordings`.
4. `apps/api/src/modules/lectures/lectures.service.ts` decodes the base64 payload and uploads the full file to Supabase Storage in the `lecture-audio` bucket.
5. The API upserts `lectures` and `audio_files` and creates a queued `processing_jobs` row with `job_type = 'transcription'`.

### Current transcription and processing flow

1. The mobile results page calls `POST /lectures/:lectureId/transcription`.
2. The API downloads the full stored audio object.
3. `audio-transcription.service.ts` sends the full file to OpenAI `audio/transcriptions` with `gpt-4o-transcribe-diarize`.
4. The API stores the raw transcript in `transcripts` and normalized diarized segments in `transcript_segments`.
5. `transcript-processing.service.ts` performs speaker normalization and paragraph formatting.
6. `transcript-embeddings.service.ts` embeds processed transcript paragraphs and stores them in `transcript_chunks`.

### Current limitations

- The mobile upload path assumes one full recording can be read into base64 and posted in one request.
- The API transcription path assumes one full audio object can be sent to OpenAI in one request.
- `audio-transcription.service.ts` enforces OpenAI's 25 MB request limit.
- Long recordings from 1 hour to 5 hours will eventually exceed the single-request size bound even if storage upload succeeds.
- The current pipeline cannot transcribe chunks independently, cannot process chunks in parallel, and cannot merge chunk-relative timestamps into one global lecture timeline.

## New Backend Design

### New ingestion model

The redesigned pipeline treats lecture audio chunks as the primary ingestion unit.

1. Mobile creates a lecture id and uploads chunks to `POST /lectures/:lectureId/chunks`.
2. The API stores each chunk in Supabase Storage at:
   - `userId/courseId/lectureId/chunks/{chunkIndex}-{filename}`
3. The API upserts lecture metadata, inserts the chunk row, and enqueues a `chunk_transcription` job.
4. Each chunk is transcribed independently.
5. Once all expected chunks are in `done` state, the API runs merge, processing, and embeddings stages in order.

### Schema additions

- `audio_chunks`
  - Per-chunk storage metadata and state.
- `chunk_transcriptions`
  - Stores raw diarized JSON for each transcribed chunk.
- `lectures.expected_chunk_count`
  - Lets orchestration know when all chunks have arrived.
- `transcript_chunks.lecture_id`
  - Allows direct lecture-level indexing and retrieval.
- `processing_jobs`
  - Expanded to support `chunk_transcription`, `merge`, `processing`, and `embeddings`.

### Stage breakdown

1. `chunk_transcription`
   - Download one chunk.
   - Send it to OpenAI diarized transcription.
   - Persist the raw diarized response into `chunk_transcriptions`.
2. `merge`
   - Load all chunk transcriptions ordered by `chunk_index`.
   - Normalize segments.
   - Apply cumulative duration offsets to produce one global lecture timeline.
   - Upsert `transcripts` and `transcript_segments`.
3. `processing`
   - Reuse existing speaker normalization logic against the merged transcript.
   - Upsert `processed_transcripts`.
4. `embeddings`
   - Reuse existing paragraph chunking and embeddings logic against the merged processed transcript.
   - Upsert `transcript_chunks`.

### Mobile changes required later

The backend supports chunk ingestion, but the mobile client still uses the legacy full-file upload path. The mobile implementation should change later as follows:

1. Split recorded audio into 5 to 10 minute chunks on-device, or use a backend-side fallback when local splitting is unavailable.
2. Upload chunk metadata and chunk bytes to `POST /lectures/:lectureId/chunks`.
3. Send `expectedChunkCount` with every chunk upload so the backend can determine when the lecture is complete.
4. Track per-chunk upload and transcription progress in local storage.
5. Remove the single base64 full-file upload path once chunk uploads are fully adopted.
