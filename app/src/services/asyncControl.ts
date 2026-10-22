export function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) { resolve(); return; }
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
    const timer = setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });
  });
}

export async function readWithDeadline<T>(
  read: () => Promise<T>, signal: AbortSignal, timeoutMs: number
): Promise<T> {
  if (signal.aborted) throw new Error('답변 생성을 중지했어요.');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    abort = () => { const error = new Error('답변 생성을 중지했어요.'); error.name = 'AbortError'; reject(error); };
    signal.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => { const error = new Error('응답이 잠시 끊겼어요. 다시 시도해 주세요.'); error.name = 'TimeoutError'; reject(error); }, timeoutMs);
  });
  try { return await Promise.race([read(), deadline]); }
  finally {
    clearTimeout(timer);
    if (abort) signal.removeEventListener('abort', abort);
  }
}
