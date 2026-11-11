export type Operation = Readonly<Record<string, number>>;

/** Orders overlapping writes, while allowing unrelated devices to run together. */
export class DeviceOperations {
  private versions = new Map<string, number>();
  private pending = new Map<string, number>();
  private tails = new Map<string, Promise<unknown>>();

  read(keys: string[]): Operation {
    return Object.fromEntries(keys.map((key) => [key, this.versions.get(key) ?? 0]));
  }

  issue(keys: string[]): Operation {
    for (const key of keys) {
      this.versions.set(key, (this.versions.get(key) ?? 0) + 1);
      this.pending.set(key, (this.pending.get(key) ?? 0) + 1);
    }
    return this.read(keys);
  }

  isCurrent(operation: Operation, key: string) {
    return operation[key] === (this.versions.get(key) ?? 0);
  }

  isPending(key: string) { return (this.pending.get(key) ?? 0) > 0; }

  canRead(operation: Operation, key: string) {
    return this.isCurrent(operation, key) && !this.isPending(key);
  }

  run<T>(operation: Operation, work: () => Promise<T>): Promise<T> {
    const keys = Object.keys(operation);
    const before = keys.map((key) => this.tails.get(key));
    const result = Promise.allSettled(before).then(work).finally(() => {
      for (const key of keys) {
        this.pending.set(key, Math.max(0, (this.pending.get(key) ?? 1) - 1));
        if (this.tails.get(key) === result) this.tails.delete(key);
      }
    });
    for (const key of keys) this.tails.set(key, result);
    return result;
  }

  async idle() { await Promise.allSettled([...this.tails.values()]); }
}
