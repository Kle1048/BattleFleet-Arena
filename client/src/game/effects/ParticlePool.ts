import { IndexHeap } from "./indexHeap";

export type ParticleLifetime = { textureKey: string; ageMs: number; active: boolean };

/** Lifetime/index ownership only. No Three.js, recipes, random draws or scene knowledge. */
export class ParticlePool<T extends ParticleLifetime> {
  private readonly slots: T[] = [];
  private readonly active: number[] = [];
  private readonly activePositions: number[] = [];
  private readonly free = new Map<string, IndexHeap>();
  private readonly oldest = new IndexHeap((a, b) => this.slots[a]!.ageMs > this.slots[b]!.ageMs ||
    (this.slots[a]!.ageMs === this.slots[b]!.ageMs && a < b));
  private disposed = false;

  constructor(private readonly limit: number, textureKeys: readonly string[],
    private readonly create: (key: string) => T, private readonly hide: (particle: T) => void,
    private readonly destroy: (particle: T) => void) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("Invalid particle limit");
    for (const key of textureKeys) this.free.set(key, new IndexHeap((a, b) => a < b));
  }
  acquire(key: string): T {
    if (this.disposed) throw new Error("Particle pool disposed");
    const available = this.free.get(key);
    if (!available) throw new Error("Unknown particle texture");
    if (this.active.length >= this.limit) this.release(this.oldest.peek()!);
    let index = available.pop();
    if (index === undefined) {
      // At most limit slots per texture can ever be needed; retain them until dispose
      // so allocation identity/sprite sorting stays identical to the old first-free scan.
      const particle = this.create(key);
      index = this.slots.length;
      this.slots.push(particle);
    }
    const particle = this.slots[index]!;
    particle.ageMs = 0; particle.active = true;
    this.activePositions[index] = this.active.length;
    this.active.push(index); this.oldest.push(index);
    return particle;
  }
  update(dtMs: number, advance: (particle: T) => boolean): void {
    if (this.disposed) return;
    let position = 0;
    while (position < this.active.length) {
      const index = this.active[position]!;
      const particle = this.slots[index]!;
      particle.ageMs += dtMs;
      if (!advance(particle)) this.release(index);
      else position++;
    }
    // One linear pass over active heap nodes, not scans per emitted particle.
    // Preserve exact age/index policy even for heterogeneous floating-point ages.
    this.oldest.rebuild();
  }
  stats() { return { activeParticles: this.active.length, pooledParticles: this.slots.length - this.active.length }; }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    while (this.active.length) this.release(this.active[this.active.length - 1]!);
    for (const particle of this.slots) this.destroy(particle);
    this.slots.length = 0; this.activePositions.length = 0; this.oldest.clear();
    for (const indices of this.free.values()) indices.clear();
  }
  private release(index: number): void {
    const particle = this.slots[index]!;
    if (!particle.active) return;
    particle.active = false;
    this.hide(particle);
    this.oldest.remove(index);
    const position = this.activePositions[index]!;
    const last = this.active.pop()!;
    if (position < this.active.length) { this.active[position] = last; this.activePositions[last] = position; }
    this.activePositions[index] = -1;
    this.free.get(particle.textureKey)!.push(index);
  }
}
