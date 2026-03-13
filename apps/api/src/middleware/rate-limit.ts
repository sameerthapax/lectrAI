import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

function createRateLimitMessage(retryAfterSeconds?: number) {
  return {
    message: 'Too many requests. Please try again later.',
    retryAfterSeconds: retryAfterSeconds ?? null,
  };
}

export const apiRateLimit = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.rateLimitMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const retryAfterHeader = res.getHeader('Retry-After');
    const retryAfterSeconds =
      typeof retryAfterHeader === 'string' ? Number(retryAfterHeader) : undefined;

    res.status(429).json(createRateLimitMessage(retryAfterSeconds));
  },
});

export const authRateLimit = rateLimit({
  windowMs: env.authRateLimitWindowMs,
  max: env.authRateLimitMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  handler: (req, res) => {
    const retryAfterHeader = res.getHeader('Retry-After');
    const retryAfterSeconds =
      typeof retryAfterHeader === 'string' ? Number(retryAfterHeader) : undefined;

    res.status(429).json({
      message: 'Too many authentication attempts. Please try again later.',
      retryAfterSeconds: retryAfterSeconds ?? null,
    });
  },
});
