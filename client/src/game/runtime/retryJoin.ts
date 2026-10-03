/** Retry only on explicit user action; keep the lobby choice and app resources. */
export async function retryJoin<T>(acquire: () => Promise<T>, confirm: (error: unknown, attempt: number) => Promise<void>,
  signal: AbortSignal): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    signal.throwIfAborted();
    try { return await acquire(); }
    catch (error) {
      signal.throwIfAborted();
      await confirm(error, attempt);
    }
  }
}

export function joinFailureMessage(error: unknown): string {
  const code = Number((error as { code?: unknown } | null)?.code);
  if (code === 429) return "Too many connection attempts. Please wait a moment and try again.";
  if (code === 503) return "The server is currently full or temporarily unavailable. Please try again shortly.";
  if (code === 409) return "That round has just ended. Try again to join a new round.";
  return "Could not connect to the game server. Check your connection and try again. The server may be temporarily unavailable.";
}
