type PlayerPosLike = { id: string; x: number; z: number };

export function findPlayerPositionById<T extends PlayerPosLike>(
  players: Iterable<T>,
  playerId: string,
): { x: number; z: number } | null {
  for (const p of players) {
    if (p.id === playerId) return { x: p.x, z: p.z };
  }
  return null;
}
