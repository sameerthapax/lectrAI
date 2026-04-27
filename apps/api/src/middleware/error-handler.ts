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
