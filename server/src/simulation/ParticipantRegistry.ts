/**
 * Sole owner of participant membership and its two lookup indexes.
 * Values are borrowed mutable domain objects; only membership is read-only to consumers.
 * Generic player shape permits the temporary schema view to become a plain model later.
 */
export class ParticipantRegistry<P extends { id: string }, S> {
  private readonly playerIndex = new Map<string, P>();
  private readonly simulationIndex = new Map<string, S>();
  private readonly orderedPlayers: P[] = [];

  // Stable read views avoid accessor calls in every movement/projectile lookup.
  readonly players: ReadonlyMap<string, P> = this.playerIndex;
  readonly simulations: ReadonlyMap<string, S> = this.simulationIndex;
  readonly ordered: readonly P[] = this.orderedPlayers;
  get size(): number { return this.playerIndex.size; }

  add(player: P, simulation: S): void {
    if (this.playerIndex.has(player.id)) throw new Error("Participant already joined");
    // Publish both indexes in the same synchronous operation, after complete construction.
    this.playerIndex.set(player.id, player);
    this.simulationIndex.set(player.id, simulation);
    this.orderedPlayers.push(player);
  }

  remove(id: string): void {
    const player = this.playerIndex.get(id);
    if (player) this.orderedPlayers.splice(this.orderedPlayers.indexOf(player), 1);
    this.playerIndex.delete(id);
    this.simulationIndex.delete(id);
  }

  clear(): void {
    this.orderedPlayers.length = 0;
    this.playerIndex.clear();
    this.simulationIndex.clear();
  }
}
