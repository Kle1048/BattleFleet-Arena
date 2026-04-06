type MissileLike = { missileId: number; x: number; z: number; headingRad: number };
type TorpedoLike = { torpedoId: number; x: number; z: number; headingRad: number };
type PlayerPosLike = { id: string; x: number; z: number };

export function toMissilePoses<T extends MissileLike>(missiles: Iterable<T> | null): MissileLike[] {
  if (!missiles) return [];
  const poses: MissileLike[] = [];
  for (const mm of missiles) {
    poses.push({
      missileId: mm.missileId,
      x: mm.x,
      z: mm.z,
      headingRad: mm.headingRad,
    });
  }
  return poses;
}

export function toTorpedoPoses<T extends TorpedoLike>(torpedoes: Iterable<T> | null): TorpedoLike[] {
  if (!torpedoes) return [];
  const poses: TorpedoLike[] = [];
  for (const tt of torpedoes) {
    poses.push({
      torpedoId: tt.torpedoId,
      x: tt.x,
      z: tt.z,
      headingRad: tt.headingRad,
    });
  }
  return poses;
}

export function findPlayerPositionById<T extends PlayerPosLike>(
  players: Iterable<T>,
  playerId: string,
): { x: number; z: number } | null {
  for (const p of players) {
    if (p.id === playerId) return { x: p.x, z: p.z };
  }
  return null;
}
