import { useEffect, useState } from 'react';

export type MobileErrorContext = {
  source: string;
  fatal?: boolean;
  extra?: unknown;
};

export type MobileErrorReport = {
  error: Error;
  source: string;
  fatal: boolean;
  extra?: unknown;
  happenedAt: string;
};

type ErrorListener = (report: MobileErrorReport | null) => void;

const listeners = new Set<ErrorListener>();
let latestFatalError: MobileErrorReport | null = null;
let handlersInstalled = false;

export function logMobileError(error: unknown, context: MobileErrorContext) {
  const normalizedError = normalizeError(error);
  const report: MobileErrorReport = {
    error: normalizedError,
    source: context.source,
    fatal: Boolean(context.fatal),
    extra: context.extra,
    happenedAt: new Date().toISOString(),
  };

  console.error(`[ mobile ] ${report.source}`, {
    fatal: report.fatal,
    message: report.error.message,
    stack: report.error.stack,
    extra: report.extra,
    happenedAt: report.happenedAt,
  });

  if (report.fatal) {
    latestFatalError = report;
    emit();
  }

  return report;
}

export function installGlobalMobileErrorHandlers() {
  if (handlersInstalled) {
    return;
  }

  handlersInstalled = true;

  const errorUtils = (globalThis as typeof globalThis & {
    ErrorUtils?: {
      getGlobalHandler?: () => ((error: unknown, isFatal?: boolean) => void) | undefined;
      setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
    };
  }).ErrorUtils;

  const previousHandler = errorUtils?.getGlobalHandler?.();

  errorUtils?.setGlobalHandler?.((error, isFatal) => {
    logMobileError(error, {
      source: 'global-js-exception',
      fatal: Boolean(isFatal),
    });

    if (!isFatal) {
      previousHandler?.(error, isFatal);
    }
  });

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('error', (event) => {
      logMobileError(event.error ?? event.message, {
        source: 'window-error',
        fatal: true,
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      logMobileError(event.reason, {
        source: 'unhandled-promise-rejection',
        fatal: true,
      });
    });
  }
}

export function clearLatestFatalMobileError() {
  latestFatalError = null;
  emit();
}

export function useLatestFatalMobileError() {
  const [report, setReport] = useState(latestFatalError);

  useEffect(() => {
    const listener: ErrorListener = (nextReport) => {
      setReport(nextReport);
    };

    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }, []);

  return report;
}

export function getErrorMessage(error: unknown, fallback = 'Something went wrong.') {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }

  return fallback;
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === 'string') {
    return new Error(error);
  }

  return new Error('Unknown error');
}

function emit() {
  for (const listener of listeners) {
    listener(latestFatalError);
  }
}
