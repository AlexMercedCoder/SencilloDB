export type DataObj = {
  [key: any]: any;
};

export type JSONDB = {
  [key: any]: any;
};

export type DataCollection = Array<DataObj>;

export type Indexable = number | string | boolean;

export type IndexGenerator = (DataObj) => Indexable;

export interface IndexSwapInstructions {
  current: string;
  new: string | IndexGenerator;
}

export type loadHook = () => string;
export type saveHook = (jsonString: string) => void;

export interface SencilloConstructorArgs {
  file?: string;
  loadHook?: loadHook;
  saveHook?: saveHook;
}

export type FindCallback = (
  item: DataObj,
  index?: number,
  arr?: Array<DataObj>
) => boolean;

export type SortFunction = (x: DataObj, y: DataObj) => number;

export interface Instructions {
  data?: DataObj | Array<DataObj>;
  index?: Indexable | IndexGenerator | IndexSwapInstructions;
  collection?: string;
  _id?: number;
  callback?: FindCallback;
  sort?: SortFunction;
}

export type TxFunction = (
  instructions: Instructions
) => DataObj | DataCollection | void;
export interface Transactor {
  create: TxFunction;
  createMany: TxFunction;
  find: TxFunction;
  findMany: TxFunction;
  update: TxFunction;
  destroy: TxFunction;
  dropCollection: TxFunction;
  dropIndex: TxFunction;
  rewriteCollection: TxFunction;
}

export type TxCallback = (tx: Transactor) => any;

export declare class SencilloDB {
  constructor(config: SencilloConstructorArgs);
  #file: string;
  #db: JSONDB;
  #loadHook: loadHook;
  #saveHook: saveHook;
  #saveDB(): void;
  #loadDB(): void;
  transaction(tx: Transactor): any;
  create(instructions: Instructions): DataObj | DataCollection;
  createMany(instructions: Instructions): DataObj | DataCollection;
  find(instructions: Instructions): DataObj | DataCollection;
  findMany(instructions: Instructions): DataObj | DataCollection;
  update(instructions: Instructions): DataObj | DataCollection;
  destroy(instructions: Instructions): DataObj | DataCollection;
  dropCollection(instructions: Instructions): void;
  dropIndex(instructions: Instructions): void;
  rewriteCollection(instructions: Instructions): void;
}

export type QuickTxFunction = (
  operation: string,
  instructions: Instructions
) => DataObj | DataCollection | void;

export declare function quickTx(db: SencilloDB): QuickTxFunction;

export interface ResourceManager {
  validate: (DataObj) => boolean;
  execute: QuickTxFunction;
}

export type SchemaItem = [string, Function];

export type Schema = Array<SchemaItem>;

export interface ResourceManagerConfig {
  db: SencilloDB;
  index: IndexGenerator;
  schema: Schema;
  collection: string;
}

export declare function createResourceManager(
  config: ResourceManagerConfig
): ResourceManager;
