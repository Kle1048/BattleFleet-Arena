/** Indexed binary heap: remove is O(log n), including expiry of a non-root item. */
export class IndexHeap {
  private readonly values: number[] = [];
  private readonly positions: number[] = [];
  constructor(private readonly precedes: (a: number, b: number) => boolean) {}
  get size(): number { return this.values.length; }
  peek(): number | undefined { return this.values[0]; }
  push(value: number): void {
    if ((this.positions[value] ?? -1) >= 0) throw new Error("Duplicate heap index");
    this.positions[value] = this.values.length;
    this.values.push(value);
    this.up(this.values.length - 1);
  }
  pop(): number | undefined {
    const value = this.peek();
    if (value !== undefined) this.remove(value);
    return value;
  }
  remove(value: number): void {
    const position = this.positions[value] ?? -1;
    if (position < 0) return;
    this.positions[value] = -1;
    const last = this.values.pop()!;
    if (position === this.values.length) return;
    this.values[position] = last;
    this.positions[last] = position;
    this.down(this.up(position));
  }
  /** Ages advance together, but floating-point tie collapse can change index tie-breaking. */
  rebuild(): void {
    for (let i = (this.values.length >> 1) - 1; i >= 0; i--) this.down(i);
  }
  clear(): void { this.values.length = 0; this.positions.length = 0; }
  private swap(a: number, b: number): void {
    const value = this.values[a]!;
    this.values[a] = this.values[b]!; this.values[b] = value;
    this.positions[value] = b; this.positions[this.values[a]!] = a;
  }
  private up(position: number): number {
    while (position > 0) {
      const parent = (position - 1) >> 1;
      if (!this.precedes(this.values[position]!, this.values[parent]!)) break;
      this.swap(position, parent); position = parent;
    }
    return position;
  }
  private down(position: number): void {
    for (;;) {
      const left = position * 2 + 1;
      if (left >= this.values.length) return;
      const right = left + 1;
      const best = right < this.values.length && this.precedes(this.values[right]!, this.values[left]!) ? right : left;
      if (!this.precedes(this.values[best]!, this.values[position]!)) return;
      this.swap(position, best); position = best;
    }
  }
}
