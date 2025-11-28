export class Mutex {
  #queue: (() => void)[] = [];
  #locked = false;

  async runExclusive<T>(callback: () => Promise<T> | T): Promise<T> {
    if (this.#locked) {
      await new Promise<void>((resolve) => this.#queue.push(resolve));
    }

    this.#locked = true;

    try {
      return await callback();
    } finally {
      const next = this.#queue.shift();
      if (next) {
        next();
      } else {
        this.#locked = false;
      }
    }
  }
}
