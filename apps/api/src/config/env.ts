export const env = {
  host: process.env.HOST ?? 'localhost',
  port: process.env.PORT ? Number(process.env.PORT) : 3000,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  supabaseAuthEmailRedirectTo: process.env.SUPABASE_AUTH_EMAIL_REDIRECT_TO ?? null,
};
