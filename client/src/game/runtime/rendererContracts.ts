export interface GameRenderer<TSync> {
  sync(data: readonly TSync[]): void;
  update(nowMs: number, dtMs: number): void;
  dispose(): void;
}
