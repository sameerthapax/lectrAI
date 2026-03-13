export const env = {
  host: process.env.HOST ?? 'localhost',
  port: process.env.PORT ? Number(process.env.PORT) : 3000,
  nodeEnv: process.env.NODE_ENV ?? 'development',
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
