/** User-facing status formatting belongs to presentation, not the transport adapter. */
export function connectionErrorMessage(code: number, message?: string): string {
  const line = `[${code}] ${message ?? ""}`.trim();
  return line.length > 0 ? line : `Error code ${code}`;
}

export function connectionClosedMessage(code: number, reason?: string): string {
  if (code === 4001) return "This round has finished. The result screen closed after 30 seconds to free a place for other players. You can join a new round.";
  const WS_CLOSE_WITH_ERROR = 4002;
  if (code === WS_CLOSE_WITH_ERROR && reason?.includes("left_operational_area")) {
    return "Destroyed: left the Area of Operations. Return to the lobby to play again.";
  }
  if (code === WS_CLOSE_WITH_ERROR && reason?.includes("destroyed_in_combat")) {
    return "Destroyed in combat. Return to the lobby to play again.";
  }
  return `Connection lost (${code}). You can return to the lobby and join again. Your previous ship cannot be resumed.`;
}
