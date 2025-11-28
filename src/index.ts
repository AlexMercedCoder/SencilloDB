import { existsSync, writeFileSync, mkdirSync, createReadStream, createWriteStream } from "fs";
import { readFile, rename, appendFile, unlink, mkdir, readdir } from "fs/promises";
import { join } from "path";
// @ts-ignore
import bfj from "bfj";
import zlib from "zlib";
import { Mutex } from "./utils.js";
import { match } from "./query.js";
import {
  SencilloDBError,
  CollectionNotFoundError,
  IndexNotFoundError,
  DocumentNotFoundError,
  ValidationError,
  DatabaseNotLoadedError,
} from "./errors.js";

export interface SencilloConfig {
  file?: string;
  folder?: string;
  loadHook?: () => Promise<string>;
  saveHook?: (json: string) => Promise<void>;
  aof?: boolean;
  compression?: boolean;
  sharding?: boolean;
  maxCacheSize?: number;
}

export interface Populate {
  field: string;
  collection: string;
  targetField?: string;
}

export interface Instructions {
  collection?: string;
  index?: string | ((data: any) => string) | { current: string; new: string | ((data: any) => string) };
  data?: any;
  _id?: number;
  callback?: (item: any) => boolean;
  filter?: any;
  sort?: (a: any, b: any) => number;
  populate?: Populate[];
}

export interface Transaction {
  create: (instructions: Instructions) => Promise<any>;
  update: (instructions: Instructions) => Promise<any>;
  destroy: (instructions: Instructions) => Promise<any>;
  find: (instructions: Instructions) => Promise<any>;
  findMany: (instructions: Instructions) => Promise<any[]>;
  createMany: (instructions: Instructions) => Promise<any[]>;
  dropCollection: (instructions: Instructions) => Promise<void>;
  dropIndex: (instructions: Instructions) => Promise<void>;
  rewriteCollection: (instructions: Instructions) => Promise<void>;
  ensureIndex: (instructions: { collection: string; field: string }) => Promise<void>;
}

export interface CollectionStats {
  inserted: number;
  total: number;
}

export interface Collection {
  [index: string]: any[] | CollectionStats | { [field: string]: { [value: string]: number[] } } | { [id: number]: string } | undefined;
  __stats: CollectionStats;
  __secondary_indexes?: { [field: string]: { [value: string]: number[] } };
  __id_map?: { [id: number]: string };
}

interface Database {
  [key: string]: Collection;
}

export class SencilloDB {
  #file: string | undefined;
  #folder: string | undefined;
  #aofFile: string;
  #db: Database | undefined;
  #loadHook: (() => Promise<string>) | undefined;
  #saveHook: ((json: string) => Promise<void>) | undefined;
  #mutex = new Mutex();
  #aof: boolean;
  #compression: boolean;
  #sharding: boolean;
  #maxCacheSize: number;
  #lru: Map<string, number> = new Map(); // Key -> Timestamp (or just insertion order)
  #pendingOperations: { op: string; instructions: any }[] = [];
  #dirtyCollections: Set<string> = new Set();

  constructor(config: SencilloConfig = { file: "./sencillo.json" }) {
    if (!config.file && !config.folder && !config.loadHook && !config.saveHook) {
      // Allow if hooks are provided, otherwise file or folder is required
    }
    
    if (config.folder) {
        this.#folder = config.folder;
        if (!existsSync(this.#folder)) {
            mkdirSync(this.#folder, { recursive: true });
        }
        this.#file = undefined;
        this.#aofFile = join(this.#folder, "log.aof");
    } else {
        const filePath = config.file || "./sencillo.json";
        if (!config.loadHook && !existsSync(filePath)) {
            if (config.compression) {
                writeFileSync(filePath, zlib.gzipSync("{}"));
            } else {
                writeFileSync(filePath, "{}");
            }
        }
        this.#file = filePath;
        this.#aofFile = `${filePath}.aof`;
    }

    this.#loadHook = config.loadHook;
    this.#saveHook = config.saveHook;
    this.#aof = config.aof || false;
    this.#compression = config.compression || false;
    this.#sharding = config.sharding || false;
    this.#maxCacheSize = config.maxCacheSize || 0; // 0 means no limit
    
    if (this.#sharding && !this.#folder) {
        throw new Error("Sharding requires folder mode to be enabled.");
    }
  }

  async #loadDB() {
    // Only used for single-file mode
    if (this.#folder) return; 

    let data;
    if (this.#loadHook) {
        data = JSON.parse(await this.#loadHook());
    } else {
        if (this.#compression) {
            const stream = createReadStream(this.#file!).pipe(zlib.createGunzip());
            data = await bfj.parse(stream);
        } else {
            data = await bfj.read(this.#file!);
        }
    }

    try {
      this.#db = data as Database;
      
      // Replay AOF if enabled and exists
      if (this.#aof && existsSync(this.#aofFile)) {
          const aofContent = await readFile(this.#aofFile, "utf-8");
          const lines = aofContent.split("\n").filter(line => line.trim() !== "");
          for (const line of lines) {
              try {
                  const { op, instructions } = JSON.parse(line);
                  // @ts-ignore
                  await this[op](instructions);
              } catch (e) {
                  console.error("Failed to replay AOF line:", line, e);
              }
          }
          this.#pendingOperations = []; // Clear operations generated by replay
      }
    } catch (error) {
      throw "****file exists and doesn't contain valid json, fix the json or delete the file to create a new one****";
    }
  }

  async #getCollection(name: string) {
      if (!this.#db) this.#db = {};
      
      // LRU Touch
      await this.#touch(name);

      if (this.#db[name]) return this.#db[name];

      if (this.#folder) {
          if (this.#sharding) {
              const colDir = join(this.#folder, name);
              if (existsSync(colDir)) {
                  const metaFile = join(colDir, "meta.json");
                  if (existsSync(metaFile)) {
                       this.#db[name] = (await bfj.read(metaFile)) as Collection;
                  }
              }
          } else {
              const fileName = this.#compression ? `${name}.json.gz` : `${name}.json`;
              const file = join(this.#folder, fileName);
              if (existsSync(file)) {
                  if (this.#compression) {
                      const stream = createReadStream(file).pipe(zlib.createGunzip());
                      this.#db[name] = (await bfj.parse(stream)) as Collection;
                  } else {
                      this.#db[name] = (await bfj.read(file)) as Collection;
                  }
              }
          }
      }
      
      return this.#db[name];
  }

  async #getShard(collection: string, index: string) {
      if (!this.#sharding || !this.#folder) return;
      if (!this.#db || !this.#db[collection]) return;
      
      // If already loaded, return
      if (this.#db[collection][index]) {
          await this.#touch(`${collection}::${index}`);
          return;
      }

      const colDir = join(this.#folder, collection);
      const shardFile = this.#compression 
        ? join(colDir, `shard_${index}.json.gz`)
        : join(colDir, `shard_${index}.json`);

      if (existsSync(shardFile)) {
           if (this.#compression) {
               const stream = createReadStream(shardFile).pipe(zlib.createGunzip());
               this.#db[collection][index] = await bfj.parse(stream);
           } else {
               this.#db[collection][index] = await bfj.read(shardFile);
           }
           await this.#touch(`${collection}::${index}`);
      }
  }

  async #touch(key: string) {
      if (this.#maxCacheSize <= 0) return;

      // Remove and re-add to mark as most recently used
      if (this.#lru.has(key)) {
          this.#lru.delete(key);
      }
      this.#lru.set(key, Date.now());

      // Evict if too big
      if (this.#lru.size > this.#maxCacheSize) {
          await this.#evict();
      }
  }

  async #evict() {
      if (this.#lru.size === 0) return;

      // Get least recently used (first item in Map)
      const key = this.#lru.keys().next().value;
      if (!key) return;

      this.#lru.delete(key);

      // Check if it's a shard or collection
      if (key.includes("::")) {
          const [collection, index] = key.split("::");
          // Check if dirty
          // We don't have per-shard dirty tracking easily, but we can check if the collection is dirty.
          // Ideally we should save just this shard if it's dirty.
          // For now, if the collection is marked dirty, we save the whole collection (or just the shard if we can).
          
          // Optimization: We can just save this specific shard if we implement a specific saveShard method.
          // But #saveCollection handles saving all dirty shards.
          // Let's implement a targeted save for eviction.
          
          if (this.#dirtyCollections.has(collection)) {
              // We have to assume it might be dirty. 
              // To be safe, we should save it.
              await this.#saveShard(collection, index);
          }
          
          // Unload
          if (this.#db && this.#db[collection] && this.#db[collection][index]) {
              delete this.#db[collection][index];
          }

      } else {
          const collection = key;
          if (this.#dirtyCollections.has(collection)) {
              await this.#saveCollection(collection);
          }
          // Unload
          if (this.#db && this.#db[collection]) {
              delete this.#db[collection];
          }
      }
  }

  async #saveShard(collection: string, index: string) {
      if (!this.#folder || !this.#sharding) return;
      if (!this.#db || !this.#db[collection] || !this.#db[collection][index]) return;

      const colDir = join(this.#folder, collection);
      if (!existsSync(colDir)) mkdirSync(colDir, { recursive: true });

      const shardData = this.#db[collection][index];
      const shardFile = this.#compression
        ? join(colDir, `shard_${index}.json.gz`)
        : join(colDir, `shard_${index}.json`);
      const tempFile = `${shardFile}.tmp`;

      if (this.#compression) {
          const stream = bfj.streamify(shardData);
          const writeStream = createWriteStream(tempFile);
          const gzip = zlib.createGzip();
          stream.pipe(gzip).pipe(writeStream);
          await new Promise<void>((resolve, reject) => {
              writeStream.on("finish", () => resolve());
              writeStream.on("error", reject);
          });
      } else {
          await bfj.write(tempFile, shardData);
      }
      await rename(tempFile, shardFile);
  }

  async #saveCollection(name: string) {
      if (this.#folder && this.#db && this.#db[name]) {
          if (this.#sharding) {
              const colDir = join(this.#folder, name);
              if (!existsSync(colDir)) mkdirSync(colDir, { recursive: true });

              // Save Meta
              // Create a meta object with only stats, id_map, secondary_indexes
              const meta: any = {
                  __stats: this.#db[name].__stats,
                  __id_map: this.#db[name].__id_map,
                  __secondary_indexes: this.#db[name].__secondary_indexes
              };
              
              const metaFile = join(colDir, "meta.json");
              await bfj.write(metaFile, meta);

              // Save Shards
              // Iterate keys that are NOT meta keys
              for (const key in this.#db[name]) {
                  if (key === "__stats" || key === "__id_map" || key === "__secondary_indexes") continue;
                  
                  // It's a shard (index bucket)
                  const shardData = this.#db[name][key];
                  const shardFile = this.#compression
                    ? join(colDir, `shard_${key}.json.gz`)
                    : join(colDir, `shard_${key}.json`);
                  const tempFile = `${shardFile}.tmp`;

                  if (this.#compression) {
                      const stream = bfj.streamify(shardData);
                      const writeStream = createWriteStream(tempFile);
                      const gzip = zlib.createGzip();
                      stream.pipe(gzip).pipe(writeStream);
                      await new Promise<void>((resolve, reject) => {
                          writeStream.on("finish", () => resolve());
                          writeStream.on("error", reject);
                      });
                  } else {
                      await bfj.write(tempFile, shardData);
                  }
                  await rename(tempFile, shardFile);
              }

          } else {
              const fileName = this.#compression ? `${name}.json.gz` : `${name}.json`;
              const file = join(this.#folder, fileName);
              const tempFile = `${file}.tmp`;
              
              if (this.#compression) {
                  const stream = bfj.streamify(this.#db[name]);
                  const writeStream = createWriteStream(tempFile);
                  const gzip = zlib.createGzip();
                  stream.pipe(gzip).pipe(writeStream);
                  await new Promise<void>((resolve, reject) => {
                      writeStream.on("finish", () => resolve());
                      writeStream.on("error", reject);
                  });
              } else {
                  await bfj.write(tempFile, this.#db[name]);
              }
              await rename(tempFile, file);
          }
      }
  }

  async #saveDB() {
    if (!this.#db) return;

    if (this.#folder) {
        for (const collection of this.#dirtyCollections) {
            await this.#saveCollection(collection);
        }
        this.#dirtyCollections.clear();
    } else {
        if (this.#saveHook) {
            await this.#saveHook(JSON.stringify(this.#db));
        } else {
            const tempFile = `${this.#file!}.tmp`;
            if (this.#compression) {
                const stream = bfj.streamify(this.#db);
                const writeStream = createWriteStream(tempFile);
                const gzip = zlib.createGzip();
                stream.pipe(gzip).pipe(writeStream);
                await new Promise<void>((resolve, reject) => {
                    writeStream.on("finish", () => resolve());
                    writeStream.on("error", reject);
                });
            } else {
                await bfj.write(tempFile, this.#db);
            }
            await rename(tempFile, this.#file!);
        }
    }
  }

  async #appendAOF(ops: { op: string; instructions: any }[]) {
      if (ops.length === 0) return;
      const lines = ops.map(o => JSON.stringify(o)).join("\n") + "\n";
      await appendFile(this.#aofFile, lines);
  }

  async compact() {
      return this.#mutex.runExclusive(async () => {
          if (!this.#db) {
              if (this.#folder) {
                  this.#db = {};
                  // Load all collections in folder? Or just rely on lazy load?
                  // For compact, we probably want to ensure everything is saved.
                  // But if we haven't loaded it, it hasn't changed.
                  // So we only need to save loaded dirty collections.
              } else {
                  await this.#loadDB();
              }
          }
          await this.#saveDB();
          if (this.#aof && existsSync(this.#aofFile)) {
              await unlink(this.#aofFile);
          }
      });
  }

  async transaction(callback: (tx: Transaction) => Promise<any>) {
    return this.#mutex.runExclusive(async () => {
        const self = this;

        if (!this.#db) {
            if (!this.#folder) await this.#loadDB();
            else this.#db = {};
        }
        
        this.#pendingOperations = []; // Reset pending ops

        const wrap = (method: string, fn: Function) => {
            return async (instructions: any) => {
                if (this.#aof) {
                    this.#pendingOperations.push({ op: method, instructions });
                }
                return await fn(instructions);
            };
        };

        const tx: Transaction = {
        create: wrap("create", this.create.bind(self)),
        update: wrap("update", this.update.bind(self)),
        destroy: wrap("destroy", this.destroy.bind(self)),
        find: this.find.bind(self),
        findMany: this.findMany.bind(self),
        createMany: wrap("createMany", this.createMany.bind(self)),
        dropCollection: wrap("dropCollection", this.dropCollection.bind(self)),
        dropIndex: wrap("dropIndex", this.dropIndex.bind(self)),
        rewriteCollection: wrap("rewriteCollection", this.rewriteCollection.bind(self)),
        ensureIndex: wrap("ensureIndex", this.ensureIndex.bind(self)),
        };
        try {
        const payload = await callback(tx);

        if (this.#aof) {
            await this.#appendAOF(this.#pendingOperations);
        } else {
            await this.#saveDB();
        }
        
        this.#pendingOperations = []; // Clear after write

        return payload;
        } catch (error) {
        console.log(error);
        if (!this.#folder) await this.#loadDB(); // Reload to revert state (only for single file)
        
        if (this.#folder && this.#db) {
            for (const col of this.#dirtyCollections) {
                delete this.#db[col];
            }
            this.#dirtyCollections.clear();
        }
        throw error; // Re-throw so caller knows it failed
        }
    });
  }

  async #populate(item: any, rules: Populate[]) {
    if (!item) return item;
    const populatedItem = { ...item };
    
    for (const rule of rules) {
        const { field, collection, targetField = "_id" } = rule;
        const value = populatedItem[field];
        
        if (value) {
             await this.#getCollection(collection);
             if (this.#db && this.#db[collection]) {
                 // Find the related document
                 let relatedDoc = null;
                 
                 // Optimization: If targetField is _id and value is number, use ID Map
                 if (targetField === "_id" && typeof value === "number") {
                     if (this.#db[collection].__id_map && this.#db[collection].__id_map[value]) {
                         const idx = this.#db[collection].__id_map[value];
                         if (this.#sharding) await this.#getShard(collection, idx);
                         
                         if (this.#db[collection][idx]) {
                            relatedDoc = (this.#db[collection][idx] as any[]).find((d: any) => d._id === value);
                         }
                     }
                 } else {
                     // Scan
                     // In sharding mode, we might need to load ALL shards if we can't use ID map?
                     // For now, let's assume populate works best with _id or secondary indexes.
                     // If we have to scan, we should load all shards.
                     if (this.#sharding) {
                         const colDir = join(this.#folder!, collection);
                         if (existsSync(colDir)) {
                             const files = await readdir(colDir);
                             for (const f of files) {
                                 if (f.startsWith("shard_")) {
                                     // shard_INDEX.json(.gz)
                                     let idx = f.replace("shard_", "").replace(".json", "");
                                     if (this.#compression) idx = idx.replace(".gz", "");
                                     await this.#getShard(collection, idx);
                                 }
                             }
                         }
                     }

                     const coll = this.#db[collection];
                     const keys = Object.keys(coll);
                     for (const key of keys) {
                         if (key === "__stats" || key === "__secondary_indexes" || key === "__id_map") continue;
                         if (Array.isArray(coll[key])) {
                             const found = (coll[key] as any[]).find(i => i[targetField] === value);
                             if (found) {
                                 relatedDoc = found;
                                 break;
                             }
                         }
                     }
                 }

                 if (relatedDoc) {
                     populatedItem[field] = relatedDoc;
                 }
            }
        }
    }
    return populatedItem;
  }

  async create(instructions: Instructions) {
    let {
      collection = "default",
      index = "default",
      data = false,
    } = instructions;
    
    if (!data) {
      throw new ValidationError("CREATE ERROR: no data given");
    }

    if (!this.#db) throw new DatabaseNotLoadedError();
    
    await this.#getCollection(collection);
    if (this.#folder) this.#dirtyCollections.add(collection);

    if (!this.#db[collection]) {
      this.#db[collection] = { __stats: { inserted: 0, total: 0 }, __id_map: {} };
    }

    // Resolve index to string
    let idx = "default";
    if (typeof index === "function") {
        idx = index(data);
    } else if (typeof index === "string") {
        idx = index;
    }
    // If index is object, we default to "default" for create, or could throw error. 
    // Assuming "default" fallback is safe or user error.
    const _id = this.#db[collection].__stats.inserted + 1;
    this.#db[collection].__stats.inserted++;
    this.#db[collection].__stats.total++;

    if (this.#sharding) {
        await this.#getShard(collection, idx);
    }
    if (!this.#db[collection][idx]) {
        this.#db[collection][idx] = [];
        if (this.#sharding) await this.#touch(`${collection}::${idx}`);
    }

    const newItem = { ...data, _id };
    (this.#db[collection][idx] as any[]).push(newItem);
    
    // Maintain secondary indexes
    if (this.#db[collection].__secondary_indexes) {
        for (const field in this.#db[collection].__secondary_indexes) {
            const value = newItem[field];
            if (value !== undefined) {
                const strValue = String(value);
                if (!this.#db[collection].__secondary_indexes[field][strValue]) {
                    this.#db[collection].__secondary_indexes[field][strValue] = [];
                }
                this.#db[collection].__secondary_indexes[field][strValue].push(_id);
            }
        }
    }

    // Maintain ID Map
    if (!this.#db[collection].__id_map) this.#db[collection].__id_map = {};
    this.#db[collection].__id_map[_id] = idx;

    return newItem;
  }

  async update(instructions: Instructions) {
    const { collection = "default", data, _id, index } = instructions;
    if (!this.#db) throw new DatabaseNotLoadedError();
    
    if (_id === undefined) throw new ValidationError("UPDATE ERROR: no _id given");

    await this.#getCollection(collection);
    if (this.#folder) this.#dirtyCollections.add(collection);

    if (!this.#db[collection]) throw new CollectionNotFoundError(collection);

    let idx = "default";
    
    // Use ID Map for O(1) lookup
    if (this.#db[collection].__id_map && this.#db[collection].__id_map[_id]) {
        idx = this.#db[collection].__id_map[_id];
    } else {
        // Fallback to search
        const indexes = Object.keys(this.#db[collection]).filter(
            (i) => i !== "__stats" && i !== "__secondary_indexes" && i !== "__id_map"
        );
        let found = false;
        for (const i of indexes) {
            if ((this.#db[collection][i] as any[]).find((item: any) => item._id === _id)) {
                idx = i;
                found = true;
                break;
            }
        }
        if (!found) throw new DocumentNotFoundError(_id);
    }

    const itemIndex = (this.#db[collection][idx] as any[]).findIndex(
      (item: any) => item._id === _id
    );

    if (itemIndex === -1) throw new DocumentNotFoundError(_id);

    const oldItem = (this.#db[collection][idx] as any[])[itemIndex];
    const newItem = { ...data, _id };

    // Handle Index Change
    if (index) {
        let newIdx = idx;
        if (typeof index === "object" && index.new) {
             newIdx = typeof index.new === "function" ? index.new(newItem) : index.new;
        } else if (typeof index === "string") {
             newIdx = index;
        } else if (typeof index === "function") {
             newIdx = index(newItem);
        }
        
        if (newIdx !== idx) {
            // Remove from old
            (this.#db[collection][idx] as any[]).splice(itemIndex, 1);
            // Add to new
            if (this.#sharding) await this.#getShard(collection, newIdx);
            if (!this.#db[collection][newIdx]) {
                this.#db[collection][newIdx] = [];
                if (this.#sharding) await this.#touch(`${collection}::${newIdx}`);
            }
            (this.#db[collection][newIdx] as any[]).push(newItem);
            // Update ID Map
            if (this.#db[collection].__id_map) this.#db[collection].__id_map[_id] = newIdx;
            idx = newIdx; // Update reference for secondary index update
        } else {
             (this.#db[collection][idx] as any[])[itemIndex] = newItem;
        }
    } else {
        (this.#db[collection][idx] as any[])[itemIndex] = newItem;
    }

    // Update Secondary Indexes
    if (this.#db[collection].__secondary_indexes) {
        for (const field in this.#db[collection].__secondary_indexes) {
            const oldValue = oldItem[field];
            const newValue = newItem[field];
            
            if (oldValue !== newValue) {
                // Remove old
                if (oldValue !== undefined) {
                    const strOld = String(oldValue);
                    const arr = this.#db[collection].__secondary_indexes[field][strOld];
                    if (arr) {
                        const i = arr.indexOf(_id);
                        if (i !== -1) arr.splice(i, 1);
                    }
                }
                // Add new
                if (newValue !== undefined) {
                    const strNew = String(newValue);
                    if (!this.#db[collection].__secondary_indexes[field][strNew]) {
                         this.#db[collection].__secondary_indexes[field][strNew] = [];
                    }
                    this.#db[collection].__secondary_indexes[field][strNew].push(_id);
                }
            }
        }
    }

    return newItem;
  }

  async destroy(instructions: Instructions) {
    const { collection = "default", _id } = instructions;
    if (!this.#db) throw new DatabaseNotLoadedError();
    
    if (_id === undefined) throw new ValidationError("DESTROY ERROR: no _id given");

    await this.#getCollection(collection);
    if (this.#folder) this.#dirtyCollections.add(collection);

    if (!this.#db[collection]) throw new CollectionNotFoundError(collection);

    let idx = "default";
    
    // Use ID Map for O(1) lookup
    if (this.#db[collection].__id_map && this.#db[collection].__id_map[_id]) {
        idx = this.#db[collection].__id_map[_id];
    } else {
        // Fallback to search
        const indexes = Object.keys(this.#db[collection]).filter(
            (i) => i !== "__stats" && i !== "__secondary_indexes" && i !== "__id_map"
        );
        let found = false;
        for (const i of indexes) {
            if ((this.#db[collection][i] as any[]).find((item: any) => item._id === _id)) {
                idx = i;
                found = true;
                break;
            }
        }
        if (!found) throw new DocumentNotFoundError(_id);
    }

    const itemIndex = (this.#db[collection][idx] as any[]).findIndex(
      (item: any) => item._id === _id
    );

    if (itemIndex === -1) throw new DocumentNotFoundError(_id);

    const deletedItem = (this.#db[collection][idx] as any[]).splice(itemIndex, 1)[0];
    this.#db[collection].__stats.total--;
    
    // Remove from ID Map
    if (this.#db[collection].__id_map) {
        delete this.#db[collection].__id_map[_id];
    }

    // Remove from Secondary Indexes
    if (this.#db[collection].__secondary_indexes) {
        for (const field in this.#db[collection].__secondary_indexes) {
            const value = deletedItem[field];
            if (value !== undefined) {
                const strValue = String(value);
                const arr = this.#db[collection].__secondary_indexes[field][strValue];
                if (arr) {
                    const i = arr.indexOf(_id);
                    if (i !== -1) arr.splice(i, 1);
                }
            }
        }
    }

    return deletedItem;
  }

  async find(instructions: Instructions) {
    const { collection = "default", callback, index, filter, populate } = instructions;
    if (!this.#db) throw new DatabaseNotLoadedError();
    
    await this.#getCollection(collection);

    if (!this.#db[collection]) throw new CollectionNotFoundError(collection);

    // Optimized Secondary Index Lookup
    if (filter && this.#db[collection].__secondary_indexes) {
        for (const field in filter) {
            const value = filter[field];
            // Check if filter is a direct value or $eq
            const isDirect = typeof value !== "object" || value === null;
            const isEq = value && typeof value === "object" && "$eq" in value;
            
            if (isDirect || isEq) {
                const targetValue = isDirect ? value : value.$eq;
                const strValue = String(targetValue);
                
                if (this.#db[collection].__secondary_indexes[field] && 
                    this.#db[collection].__secondary_indexes[field][strValue]) {
                    
                    const ids: number[] = this.#db[collection].__secondary_indexes[field][strValue];
                    if (ids.length > 0) {
                        const id = ids[0];
                        // Use ID Map to find it fast
                        if (this.#db[collection].__id_map && this.#db[collection].__id_map[id]) {
                            const idx = this.#db[collection].__id_map[id];
                            if (this.#sharding) await this.#getShard(collection, idx);

                            if (this.#db[collection][idx]) {
                                const doc = (this.#db[collection][idx] as any[]).find((d: any) => d._id === id);
                                if (doc) {
                                    // Matcher check to be sure (in case of collision or other filters)
                                    const matcher = match(filter || {}, callback);
                                    if (matcher(doc, 0)) {
                                         if (populate) return await this.#populate(doc, populate);
                                         return doc;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    const matcher = match(filter || {}, callback);

    if (index && typeof index === "string") {
      if (this.#sharding) await this.#getShard(collection, index);
      if (!this.#db[collection][index]) throw new IndexNotFoundError(index);
      const found = (this.#db[collection][index] as any[]).find(matcher);
      if (found && populate) return await this.#populate(found, populate);
      return found;
    }

    // Scan all
    if (this.#sharding) {
         const colDir = join(this.#folder!, collection);
         if (existsSync(colDir)) {
             const files = await readdir(colDir);
             for (const f of files) {
                 if (f.startsWith("shard_")) {
                     let i = f.replace("shard_", "").replace(".json", "");
                     if (this.#compression) i = i.replace(".gz", "");
                     await this.#getShard(collection, i);
                 }
             }
         }
    }

    const indexes = Object.keys(this.#db[collection]).filter(
      (i) => i !== "__stats" && i !== "__secondary_indexes" && i !== "__id_map"
    );

    for (const i of indexes) {
      const found = (this.#db[collection][i] as any[]).find(matcher);
      if (found) {
          if (populate) return await this.#populate(found, populate);
          return found;
      }
    }
  }

  async findMany(instructions: Instructions) {
    const { collection = "default", callback, index, sort, filter, populate } = instructions;
    if (!this.#db) throw new DatabaseNotLoadedError();
    
    await this.#getCollection(collection);

    if (!this.#db[collection]) throw new CollectionNotFoundError(collection);

    const matcher = match(filter || {}, callback);
    let results: any[] = [];

    // Optimized Secondary Index Lookup
    let usedIndex = false;
    if (filter && this.#db[collection].__secondary_indexes) {
         for (const field in filter) {
            const value = filter[field];
            const isDirect = typeof value !== "object" || value === null;
            const isEq = value && typeof value === "object" && "$eq" in value;
            
            if (isDirect || isEq) {
                const targetValue = isDirect ? value : value.$eq;
                const strValue = String(targetValue);
                if (this.#db[collection].__secondary_indexes[field] && 
                    this.#db[collection].__secondary_indexes[field][strValue]) {
                    
                    const ids: number[] = this.#db[collection].__secondary_indexes[field][strValue];
                    // Retrieve all docs
                    for (const id of ids) {
                        if (this.#db[collection].__id_map && this.#db[collection].__id_map[id]) {
                            const idx = this.#db[collection].__id_map[id];
                            if (this.#sharding) await this.#getShard(collection, idx);

                            if (this.#db[collection][idx]) {
                                const doc = (this.#db[collection][idx] as any[]).find((d: any) => d._id === id);
                                if (doc && matcher(doc, 0)) {
                                    results.push(doc);
                                }
                            }
                        }
                    }
                    usedIndex = true;
                    break; // Only use one index
                }
            }
         }
    }

    if (!usedIndex) {
        if (index && typeof index === "string") {
        if (this.#sharding) await this.#getShard(collection, index);
        if (!this.#db[collection][index]) throw new IndexNotFoundError(index);
        results = (this.#db[collection][index] as any[]).filter(matcher);
        } else {
        
        if (this.#sharding) {
             const colDir = join(this.#folder!, collection);
             if (existsSync(colDir)) {
                 const files = await readdir(colDir);
                 for (const f of files) {
                     if (f.startsWith("shard_")) {
                         let i = f.replace("shard_", "").replace(".json", "");
                         if (this.#compression) i = i.replace(".gz", "");
                         await this.#getShard(collection, i);
                     }
                 }
             }
        }
        const indexes = Object.keys(this.#db[collection]).filter(
            (i) => i !== "__stats" && i !== "__secondary_indexes" && i !== "__id_map"
        );

        for (const i of indexes) {
            results = [...results, ...(this.#db[collection][i] as any[]).filter(matcher)];
        }
        }
    }

    if (sort) {
      results.sort(sort);
    } else {
      results.sort((a, b) => a._id - b._id);
    }

    if (populate) {
        // Use Promise.all for parallel population or loop for sequential
        // Sequential is safer for now
        const populatedResults = [];
        for (const doc of results) {
            populatedResults.push(await this.#populate(doc, populate));
        }
        return populatedResults;
    }

    return results;
  }

  async createMany(instructions: Instructions) {
    const { collection = "default", data, index } = instructions;
    if (!this.#db) throw new DatabaseNotLoadedError();
    
    await this.#getCollection(collection);
    if (this.#folder) this.#dirtyCollections.add(collection);

    const results = [];
    for (const item of data) {
      results.push(await this.create({ collection, data: item, index }));
    }
    return results;
  }

  async dropCollection(instructions: Instructions) {
    const { collection = "default" } = instructions;
    if (!this.#db) throw new DatabaseNotLoadedError();
    
    await this.#getCollection(collection);
    
    if (!this.#db[collection]) throw new CollectionNotFoundError(collection);
    delete this.#db[collection];
    
    if (this.#folder) {
        this.#dirtyCollections.delete(collection); 
        if (this.#sharding) {
             const colDir = join(this.#folder, collection);
             if (existsSync(colDir)) {
                 await import("fs/promises").then(fs => fs.rm(colDir, { recursive: true, force: true }));
             }
        } else {
            const fileName = this.#compression ? `${collection}.json.gz` : `${collection}.json`;
            const file = join(this.#folder, fileName);
            if (existsSync(file)) {
                await unlink(file);
            }
        }
    }
  }

  async dropIndex(instructions: Instructions) {
    const { collection = "default", index } = instructions;
    if (!this.#db) throw new DatabaseNotLoadedError();
    
    await this.#getCollection(collection);
    if (this.#folder) this.#dirtyCollections.add(collection);

    if (!this.#db[collection]) throw new CollectionNotFoundError(collection);
    
    if (this.#sharding) await this.#getShard(collection, index as string);

    if (!this.#db[collection][index as string])
      throw new IndexNotFoundError(index as string);
    
    const items = this.#db[collection][index as string] as any[];
    delete this.#db[collection][index as string];
    this.#db[collection].__stats.total -= items.length;

    // Clean up ID Map
    if (this.#db[collection].__id_map) {
        for (const item of items) {
            delete this.#db[collection].__id_map[item._id];
        }
    }
    
    // Clean up Secondary Indexes
    if (this.#db[collection].__secondary_indexes) {
        for (const item of items) {
            for (const field in this.#db[collection].__secondary_indexes) {
                const value = item[field];
                if (value !== undefined) {
                    const strValue = String(value);
                    const arr = this.#db[collection].__secondary_indexes[field][strValue];
                    if (arr) {
                        const i = arr.indexOf(item._id);
                        if (i !== -1) arr.splice(i, 1);
                    }
                }
            }
        }
    }
  }

  async rewriteCollection(instructions: Instructions) {
    const { collection = "default", index, sort } = instructions;
    if (!this.#db) throw new DatabaseNotLoadedError();
    
    await this.#getCollection(collection);
    if (this.#folder) this.#dirtyCollections.add(collection);

    if (!this.#db[collection]) throw new CollectionNotFoundError(collection);

    const items = await this.findMany({
      collection,
      callback: () => true,
      sort,
    });

    // clear collection
    this.#db[collection] = { __stats: { inserted: 0, total: 0 }, __id_map: {} };

    // rewrite all data
    await this.createMany({
      data: items,
      index,
      collection,
    });
  }

  async ensureIndex(instructions: { collection: string; field: string }) {
    const { collection, field } = instructions;
    if (!this.#db) throw new DatabaseNotLoadedError();
    
    await this.#getCollection(collection);
    if (this.#folder) this.#dirtyCollections.add(collection);

    if (!this.#db[collection]) {
        this.#db[collection] = { __stats: { inserted: 0, total: 0 }, __id_map: {} };
    }

    if (!this.#db[collection].__secondary_indexes) {
        this.#db[collection].__secondary_indexes = {};
    }

    if (!this.#db[collection].__secondary_indexes[field]) {
        this.#db[collection].__secondary_indexes[field] = {};
        // Populate existing data
        const items = await this.findMany({ collection, callback: () => true });
        for (const item of items) {
            const value = item[field];
            if (value !== undefined) {
                const strValue = String(value);
                if (!this.#db[collection].__secondary_indexes[field][strValue]) {
                    this.#db[collection].__secondary_indexes[field][strValue] = [];
                }
                this.#db[collection].__secondary_indexes[field][strValue].push(item._id);
            }
        }
    }
  }
}

export const quickTx = (db: SencilloDB) => {
  return async (operation: keyof Transaction, instructions: Instructions) => {
    return db.transaction((tx) => {
      // @ts-ignore
      return tx[operation](instructions);
    });
  };
};

export const createResourceManager = (config: {
    schema?: [string, any][],
    db?: SencilloDB,
    index?: (obj: any) => string,
    collection?: string
}) => {
  let {
    schema = [],
    db = undefined,
    index = () => "default",
    collection = "default",
  } = config;

  if (!db) throw new DatabaseNotLoadedError();

  const qtx = quickTx(db);

  return {
    validate: (obj: any) => {
      const keys = Object.keys(obj);

      for (let property of schema) {
        if (!keys.includes(property[0])) {
          throw new ValidationError(`RESOURE VALIDATION ERROR: ${property[0]} missing in some of the data presented`);
        }

        // console.log(obj[property[0]].constructor === property[1]);
        if (obj[property[0]].constructor !== property[1]) {
          throw new ValidationError(`RESOURE VALIDATION ERROR: ${property[0]} is not of type ${property[1]}`);
        }
      }

      return true;
    },
    execute(operation: keyof Transaction, instructions: Instructions) {
      if (["create", "createMany", "update"].includes(operation)) {
        if (Array.isArray(instructions.data)) {
          for (let i of instructions.data) {
            this.validate(i);
          }
        } else {
          if (typeof instructions.data !== "object") {
            throw new ValidationError("EXECUTE ERROR: data is not object or array");
          }
          this.validate(instructions.data);
        }
      }

      let indexToUse: string | ((data: any) => string) | undefined = index;

      if (["delete", "update", "find", "findMany", "dropIndex"].includes(operation)) {
        if (!instructions.index) {
          indexToUse = undefined;
        }
      }

      return qtx(operation, { index: indexToUse, collection, ...instructions });
    },
  };
};
