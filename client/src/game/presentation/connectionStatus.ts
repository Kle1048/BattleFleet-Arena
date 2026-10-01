/** User-facing status formatting belongs to presentation, not the transport adapter. */
export function connectionErrorMessage(code: number, message?: string): string {
  const line = `[${code}] ${message ?? ""}`.trim();
  return line.length > 0 ? line : `Error code ${code}`;
}

export function connectionClosedMessage(code: number, reason?: string): string {
  const WS_CLOSE_WITH_ERROR = 4002;
  if (code === WS_CLOSE_WITH_ERROR && reason?.includes("left_operational_area")) {
    return "Destroyed: left the Area of Operations. Reload the page to play again.";
  }
  if (code === WS_CLOSE_WITH_ERROR && reason?.includes("destroyed_in_combat")) {
    return "Destroyed in combat. Reload the page to play again.";
  }
  return `Connection closed (${code}). Reload the page.`;
}
