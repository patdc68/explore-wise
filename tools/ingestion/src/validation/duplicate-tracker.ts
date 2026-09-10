export class RunDuplicateTracker {
  readonly #seen = new Set<string>();

  checkAndAdd(identity: string): boolean {
    if (this.#seen.has(identity)) {
      return true;
    }

    this.#seen.add(identity);
    return false;
  }
}

