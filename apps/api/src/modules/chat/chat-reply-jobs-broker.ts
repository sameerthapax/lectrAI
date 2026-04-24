type ChatReplyJobSignalListener = () => void;

const listenersByJobId = new Map<string, Set<ChatReplyJobSignalListener>>();

export function publishChatReplyJobSignal(jobId: string) {
  const listeners = listenersByJobId.get(jobId);

  if (!listeners || listeners.size === 0) {
    return;
  }

  for (const listener of Array.from(listeners)) {
    listener();
  }
}

export function subscribeToChatReplyJobSignals(jobId: string, listener: ChatReplyJobSignalListener) {
  const listeners = listenersByJobId.get(jobId) ?? new Set<ChatReplyJobSignalListener>();
  listeners.add(listener);
  listenersByJobId.set(jobId, listeners);

  return () => {
    const current = listenersByJobId.get(jobId);

    if (!current) {
      return;
    }

    current.delete(listener);

    if (current.size === 0) {
      listenersByJobId.delete(jobId);
    }
  };
}

export function waitForChatReplyJobSignal(jobId: string, input: { abortSignal?: AbortSignal; timeoutMs?: number } = {}) {
  const timeoutMs = input.timeoutMs ?? 15000;

  return new Promise<void>((resolve) => {
    let settled = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe: (() => void) | null = null;

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;

      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      if (unsubscribe) {
        unsubscribe();
      }

      if (input.abortSignal) {
        input.abortSignal.removeEventListener('abort', finish);
      }

      resolve();
    };

    unsubscribe = subscribeToChatReplyJobSignals(jobId, finish);
    timeoutHandle = setTimeout(finish, timeoutMs);

    if (input.abortSignal) {
      if (input.abortSignal.aborted) {
        finish();
        return;
      }

      input.abortSignal.addEventListener('abort', finish, { once: true });
    }
  });
}
