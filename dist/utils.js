export class Mutex {
    #queue = [];
    #locked = false;
    async runExclusive(callback) {
        if (this.#locked) {
            await new Promise((resolve) => this.#queue.push(resolve));
        }
        this.#locked = true;
        try {
            return await callback();
        }
        finally {
            const next = this.#queue.shift();
            if (next) {
                next();
            }
            else {
                this.#locked = false;
            }
        }
    }
}
