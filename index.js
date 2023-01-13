import { existsSync, writeFileSync, readFileSync } from "fs";
import { readFile, writeFile } from "fs/promises";

export class SencilloDB {
  #file;
  #db;
  #loadHook;
  #saveHook;

  constructor(config = { file: "./sencillo.json" }) {
    if (!config.file) {
      throw "No file property defined";
    }

    if (!existsSync(config.file)) {
      writeFileSync(config.file, "{}");
    }

    this.#file = config.file;
    this.#loadHook = config.loadHook ? config.loadHook : undefined;
    this.#saveHook = config.saveHook ? config.saveHook : undefined;
  }

  async #loadDB() {
    const jsonString = this.#loadHook
      ? await this.#loadHook()
      : await readFile(this.#file);

    try {
      this.#db = JSON.parse(jsonString);
    } catch (error) {
      throw "****file exists and doesn't contain valid json, fix the json or delete the file to create a new one****";
    }
  }

  async #saveDB() {
    const jsonString = JSON.stringify(this.#db);
    this.#saveHook
      ? await this.#saveHook(jsonString)
      : await writeFile(this.#file, jsonString);
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
      dropCollection: this.dropCollection.bind(self),
      dropIndex: this.dropIndex.bind(self),
      rewriteCollection: this.rewriteCollection.bind(self),
    };
    try {
      const payload = callback(tx);

      await this.#saveDB();

      return payload;
    } catch (error) {
      console.log(error);
      this.#loadDB();
      return undefined;
    }
  }

  create(instructions) {
    let {
      collection = "default",
      index = "default",
      data = false,
    } = instructions;
    if (!data) {
      throw "CREATE ERROR:no data given";
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
      throw "CREATE ERROR:data is not an object";
    }

    const _id = ++this.#db[collection].__stats.inserted;

    this.#db[collection].__stats.total += 1;

    const newItem = { ...data, _id };

    this.#db[collection][index].push(newItem);

    return newItem;
  }

  update(instructions) {
    let {
      _id = undefined,
      collection = "default",
      index = "default",
      data = false,
    } = instructions;

    let new_index = undefined;
    if (!_id) {
      throw "UPDATE ERROR:no _id to update";
    }

    if (!data) {
      throw "UPDATE ERROR:no data given";
    }

    if (!this.#db[collection]) {
      throw "UPDATE ERROR:collection doesn't exist";
    }

    if (typeof data != "object") {
      throw "UPDATE ERROR:data is not an object";
    }

    if (index?.current && index?.new) {
      new_index = index.new;
      index = index.current;
    }

    if (!this.#db[collection][index]) {
      throw "UPDATE ERROR:index doesn't exist";
    }

    const itemIndex = this.#db[collection][index].findIndex(
      (item) => item._id === _id
    );

    if (itemIndex == -1) {
      throw `UPDATE ERROR: Specified _id ${_id} doesn't exist in specified index ${index} to update`;
    }

    const newItem = {
      ...data,
      _id: this.#db[collection][index][itemIndex]._id,
    };

    this.#db[collection][index].splice(itemIndex, 1);

    if (new_index) {
      index = new_index;

      if (new_index instanceof Function) {
        index = new_index(newItem);
      }

      if (!this.#db[collection][index]) {
        this.#db[collection][index] = [];
      }
    }

    this.#db[collection][index].push(newItem);

    return newItem;
  }

  destroy(instructions) {
    const {
      _id = undefined,
      collection = "default",
      index = "default",
    } = instructions;

    if (!_id) {
      throw "DESTROY ERROR: no _id to update";
    }

    if (!this.#db[collection]) {
      throw "DESTROY ERROR: collection doesn't exist";
    }

    if (!this.#db[collection][index]) {
      throw "DESTROY ERROR: index doesn't exist";
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
      throw "FIND ERROR: no callback property of (item) => boolean";
    }

    if (!this.#db[collection]) {
      throw "FIND ERROR: collection doesn't exist";
    }

    if (index) {
      if (!this.#db[collection][index]) {
        throw "FIND ERROR: index doesn't exist";
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
      throw "FINDMANY ERROR: no callback property of (item) => boolean";
    }

    if (!this.#db[collection]) {
      throw "FINDMANY ERROR: collection doesn't exist";
    }

    if (index) {
      if (!this.#db[collection][index]) {
        throw "FINDMANY ERROR: index doesn't exist";
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
      throw "CREATEMANY ERROR: data must be an array of objects";
    }

    if (!data.every((item) => typeof data === "object")) {
      throw "CREATEMANY ERROR: all items in array must be objects";
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

  dropCollection(instructions) {
    const { collection } = instructions;

    this.#db[collection] = undefined;
  }

  dropIndex(instructions) {
    const { collection, index } = instructions;

    if (this.#db[collection] && this.#db[collection][index]) {
      this.#db[collection][index] = undefined;
    }
  }

  rewriteCollection(instructions) {
    const {
      collection = undefined,
      index = "default",
      sort = (x, y) => x._id - y._id,
    } = instructions;

    if (!collection) {
      throw "rewriteCollection Error: No Collection Specified";
    }

    if (!this.#db[collection]) {
      throw "rewriteCollection Error: collection doesn't exist";
    }

    const keys = Object.keys(this.#db[collection]);
    const coll = this.#db[collection];

    const data = [];

    // get all data in one array
    for (let key of keys) {
      if (coll[key] instanceof Array) {
        data.push(...coll[key]);
      }
    }

    //sort the data
    data.sort(sort);

    // drop collection
    this.#db[collection] = undefined;

    // rewrite all data
    this.createMany({
      data,
      index,
      collection,
    });
  }
}

export const quickTx = (db) => {
  return async (operation, instructions) => {
    return db.transaction((tx) => {
      return tx[operation](instructions);
    });
  };
};

export const createResourceManager = (config) => {
  let {
    schema = [],
    db = undefined,
    index = () => "default",
    collection = "default",
  } = config;

  const qtx = quickTx(db);

  return {
    validate: (obj) => {
      const keys = Object.keys(obj);

      for (let property of schema) {
        if (!keys.includes(property[0])) {
          throw `RESOURE VALIDATION ERROR: ${property[0]} missing in some of the data presented`;
        }

        console.log(obj[property[0]].constructor === property[1]);
        if (!obj[property[0]].constructor === property[1]) {
          throw `RESOURE VALIDATION ERROR: ${property[0]} is not of type ${property[1]}`;
        }
      }

      return true;
    },
    execute(operation, instructions) {
      if (["create", "createMany", "update"].includes(operation)) {
        if (instructions.data instanceof Array) {
          for (let i of instructions.data) {
            this.validate(i);
          }
        } else {
          if (typeof instructions.data !== "object") {
            throw "EXECUTE ERROR: data is not object or array";
          }
          this.validate(i);
        }
      }

      let indexToUse = index;

      if (["delete", "update", "find", "findMany", "dropIndex"]) {
        if (!instructions.index) {
          index = undefined;
        }
      }

      return qtx(operation, { index: indexToUse, collection, ...instructions });
    },
  };
};
