import { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/http-error.js';

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (res.headersSent) {
    next(error);
    return;
  }

  const requestDetails = {
    method: req.method,
    path: req.originalUrl,
  };

  if (error instanceof HttpError) {
    console.error('[ api ] Request failed', {
      ...requestDetails,
      statusCode: error.statusCode,
      message: error.message,
      details: error.details ?? null,
    });
    res.status(error.statusCode).json({
      error: error.message,
      details: error.details ?? null,
    });
    return;
  }

  if (isBodyParserSyntaxError(error)) {
    console.error('[ api ] Invalid JSON body', {
      ...requestDetails,
      error,
    });

    res.status(400).json({
      error: 'Request body contains invalid JSON.',
    });
    return;
  }

  if (isPayloadTooLargeError(error)) {
    console.error('[ api ] Request body too large', {
      ...requestDetails,
      error,
    });

    res.status(413).json({
      error: 'Upload payload is too large. Try a smaller file or use chunked upload.',
    });
    return;
  }

  console.error('[ api ] Unhandled error', {
    ...requestDetails,
    error,
  });

  res.status(500).json({
    error: 'Internal server error',
  });
}

function isBodyParserSyntaxError(error: unknown): error is SyntaxError & { status?: number; type?: string } {
  return (
    error instanceof SyntaxError &&
    typeof (error as { status?: unknown }).status === 'number' &&
    (error as { type?: unknown }).type === 'entity.parse.failed'
  );
}

function isPayloadTooLargeError(
  error: unknown
): error is Error & { status?: number; type?: string; limit?: number; length?: number } {
  return (
    error instanceof Error &&
    ((typeof (error as { status?: unknown }).status === 'number' &&
      (error as { status?: number }).status === 413) ||
      (error as { type?: unknown }).type === 'entity.too.large')
  );
}
