export const env = {
  host: process.env.HOST ?? 'localhost',
  port: process.env.PORT ? Number(process.env.PORT) : 3000,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  openAiTranscriptEmbeddingModel:
    process.env.OPENAI_TRANSCRIPT_EMBEDDING_MODEL ?? 'text-embedding-3-small',
  openAiTranscriptEmbeddingDimensions: process.env.OPENAI_TRANSCRIPT_EMBEDDING_DIMENSIONS
    ? Number(process.env.OPENAI_TRANSCRIPT_EMBEDDING_DIMENSIONS)
    : 1536,
  openAiTranscriptEmbeddingBatchSize: process.env.OPENAI_TRANSCRIPT_EMBEDDING_BATCH_SIZE
    ? Number(process.env.OPENAI_TRANSCRIPT_EMBEDDING_BATCH_SIZE)
    : 64,
  mem0OssVectorDbPath: process.env.MEM0_OSS_VECTOR_DB_PATH ?? '.data/mem0-loki.sqlite',
  mem0OssHistoryDbPath: process.env.MEM0_OSS_HISTORY_DB_PATH ?? '.data/mem0-history.db',
  openAiChatModel: process.env.OPENAI_CHAT_MODEL ?? 'gpt-4.1-mini',
  openAiWebSearchModel:
    process.env.OPENAI_WEB_SEARCH_MODEL ??
    process.env.OPENAI_CHAT_MODEL ??
    'gpt-5.4-nano-2026-03-17',
  elevenLabsTtsModel: process.env.ELEVENLABS_TTS_MODEL ?? 'eleven_flash_v2_5',
  elevenLabsTtsVoiceId: process.env.ELEVENLABS_TTS_VOICE_ID ?? 'JBFqnCBsd6RMkjVDRZzb',
  elevenLabsTtsOutputFormat: process.env.ELEVENLABS_TTS_OUTPUT_FORMAT ?? 'mp3_44100_128',
  supabaseAuthEmailRedirectTo: process.env.SUPABASE_AUTH_EMAIL_REDIRECT_TO ?? null,
  rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS
    ? Number(process.env.RATE_LIMIT_WINDOW_MS)
    : 15 * 60 * 1000,
  rateLimitMaxRequests: process.env.RATE_LIMIT_MAX_REQUESTS
    ? Number(process.env.RATE_LIMIT_MAX_REQUESTS)
    : 200,
  authRateLimitWindowMs: process.env.AUTH_RATE_LIMIT_WINDOW_MS
    ? Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS)
    : 15 * 60 * 1000,
  authRateLimitMaxRequests: process.env.AUTH_RATE_LIMIT_MAX_REQUESTS
    ? Number(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS)
    : 20,
};
