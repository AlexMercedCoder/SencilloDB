import { existsSync, writeFileSync, readFileSync } from "fs";
import { readFile, writeFile } from "fs/promises";

export class SencilloDB {
  #file;
  #db;

  constructor(config = { file: "./sencillo.json" }) {
    if (!config.file) {
      throw "No file property defined";
    }

    if (!existsSync(config.file)) {
      writeFileSync(config.file, "{}");
    }

    this.#file = config.file;
  }

  async #loadDB() {
    const jsonString = await readFile(this.#file);
    this.#db = JSON.parse(jsonString);
  }

  async #saveDB() {
    const jsonString = JSON.stringify(this.#db);
    await writeFile(this.#file, jsonString);
  }

  async transaction(callback) {
    const self = this;

    if (!this.#db) {
      await this.#loadDB();
    }

    const tx = {
      create: this.create.bind(self),
      update: this.update.bind(self),
      destroy: this.destroy.bind(self),
      find: this.find.bind(self),
      findMany: this.findMany.bind(self),
      createMany: this.createMany.bind(self),
    };

    const payload = callback(tx);

    await this.#saveDB();

    return payload;
  }

  create(instructions) {
    let {
      collection = "default",
      index = "default",
      data = false,
    } = instructions;
    if (!data) {
      throw "no data given";
    }

    if (!this.#db[collection]) {
      this.#db[collection] = { __stats: { inserted: 0, total: 0 } };
    }

    if (index instanceof Function) {
      index = index(data);
    }

    if (!this.#db[collection][index]) {
      this.#db[collection][index] = [];
    }

    if (typeof data != "object") {
      throw "data is not an object";
    }

    const _id = ++this.#db[collection].__stats.inserted;

    this.#db[collection].__stats.total += 1;

    const newItem = { ...data, _id };

    this.#db[collection][index].push(newItem);

    return newItem;
  }

  update(instructions) {
    const {
      _id = undefined,
      collection = "default",
      index = "default",
      data = false,
    } = instructions;

    if (!_id) {
      throw "no _id to update";
    }

    if (!data) {
      throw "no data given";
    }

    if (!this.#db[collection]) {
      throw "collection doesn't exist";
    }

    if (!this.#db[collection][index]) {
      throw "index doesn't exist";
    }

    if (typeof data != "object") {
      throw "data is not an object";
    }

    const itemIndex = this.#db[collection][index].findIndex(
      (item) => item._id === _id
    );

    const newItem = {
      ...data,
      _id: this.#db[collection][index][itemIndex]._id,
    };

    this.#db[collection][index][itemIndex] = newItem;

    return newItem;
  }

  destroy(instructions) {
    const {
      _id = undefined,
      collection = "default",
      index = "default",
    } = instructions;

    if (!_id) {
      throw "no _id to update";
    }

    if (!this.#db[collection]) {
      throw "collection doesn't exist";
    }

    if (!this.#db[collection][index]) {
      throw "index doesn't exist";
    }

    const itemIndex = this.#db[collection][index].findIndex(
      (item) => item._id === _id
    );

    const destroyedItem = this.#db[collection][index].splice(itemIndex, 1);
    this.#db[collection].__stats.total -= 1;
    return destroyedItem;
  }

  find(instructions) {
    const {
      callback = undefined,
      collection = "default",
      index = undefined,
    } = instructions;

    if (!callback) {
      throw "no callback property of (item) => boolean";
    }

    if (!this.#db[collection]) {
      throw "collection doesn't exist";
    }

    if (index) {
      if (!this.#db[collection][index]) {
        throw "index doesn't exist";
      }

      return this.#db[collection][index].find(callback);
    }

    const keys = Object.keys(this.#db[collection]);
    const coll = this.#db[collection];

    let found = false;
    let item;

    for (let key of keys) {
      if (!found && coll[key] instanceof Array) {
        const findResult = coll[key].find(callback);
        if (findResult) {
          item = findResult;
          found = true;
        }
      }
    }

    return item;
  }

  findMany(instructions) {
    const {
      callback = undefined,
      collection = "default",
      index = undefined,
      sort = (x, y) => x._id - y._id,
    } = instructions;

    if (!callback) {
      throw "no callback property of (item) => boolean";
    }

    if (!this.#db[collection]) {
      throw "collection doesn't exist";
    }

    if (index) {
      if (!this.#db[collection][index]) {
        throw "index doesn't exist";
      }

      return this.#db[collection][index].filter(callback);
    }

    const keys = Object.keys(this.#db[collection]);
    const coll = this.#db[collection];

    let items = [];

    for (let key of keys) {
      if (coll[key] instanceof Array) {
        const findResult = coll[key].filter(callback);
        if (findResult.length > 0) {
          items = [...items, ...findResult];
        }
      }
    }

    if (sort) {
      items.sort(sort);
    }

    return items;
  }

  createMany(instructions) {
    const { data, index = "default", collection = "default" } = instructions;

    if (data instanceof Array === false) {
      throw "data must be an array of objects";
    }

    if (!data.every((item) => typeof data === "object")) {
      throw "all items in array must be objects";
    }

    const items = [];

    for (let item of data) {
      if (index instanceof Function) {
        const newItem = this.create({
          data: item,
          index: index(item),
          collection,
        });
        items.push(newItem);
      } else {
        const newItem = this.create({
          data: item,
          index,
          collection,
        });
        items.push(newItem);
      }
    }

    return items;
  }
}

export const quickTx = (db) => {
  return async (operation, instructions) => {
    return db.transaction((tx) => {
      return tx[operation](instructions);
    });
  };
};
