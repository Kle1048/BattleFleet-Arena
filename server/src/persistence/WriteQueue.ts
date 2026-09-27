import { StorageError, storageErrorCode } from "./storageErrors.js";

/** One FIFO per data set, shared by all rooms and HTTP handlers. Rejections do not poison it. */
export class WriteQueue {
  private tail: Promise<void> = Promise.resolve();
  private accepting = true;
  private pending = 0;
  private committed = 0;
  private failed = 0;
  private rejected = 0;
  private lastError: string | null = null;

  constructor(private readonly capacity = 128) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error("Invalid queue capacity");
  }

  run<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.accepting || this.pending >= this.capacity) {
      this.rejected++;
      return Promise.reject(new StorageError(this.accepting ? "capacity" : "closed", "Storage queue is not accepting work"));
    }
    this.pending++;
    const result = this.tail.then(operation);
    this.tail = result.then(() => { this.committed++; }, error => {
      this.failed++;
      this.lastError = storageErrorCode(error);
    }).finally(() => { this.pending--; });
    return result;
  }

  snapshot() {
    return { pending: this.pending, capacity: this.capacity, committed: this.committed,
      failed: this.failed, rejected: this.rejected, lastError: this.lastError, accepting: this.accepting };
  }

  /** Waits for the currently accepted prefix; timeout does not cancel an in-flight commit. */
  async flush(timeoutMs = 5000): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([this.tail, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new StorageError("timeout", "Storage flush deadline exceeded")), timeoutMs);
      })]);
    } finally { clearTimeout(timer); }
  }

  close(timeoutMs = 5000): Promise<void> {
    this.accepting = false;
    return this.flush(timeoutMs);
  }
}
