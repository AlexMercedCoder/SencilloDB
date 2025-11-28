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
    index?: string | ((data: any) => string) | {
        current: string;
        new: string | ((data: any) => string);
    };
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
    ensureIndex: (instructions: {
        collection: string;
        field: string;
    }) => Promise<void>;
}
export interface CollectionStats {
    inserted: number;
    total: number;
}
export interface Collection {
    [index: string]: any[] | CollectionStats | {
        [field: string]: {
            [value: string]: number[];
        };
    } | {
        [id: number]: string;
    } | undefined;
    __stats: CollectionStats;
    __secondary_indexes?: {
        [field: string]: {
            [value: string]: number[];
        };
    };
    __id_map?: {
        [id: number]: string;
    };
}
export declare class SencilloDB {
    #private;
    constructor(config?: SencilloConfig);
    compact(): Promise<void>;
    transaction(callback: (tx: Transaction) => Promise<any>): Promise<any>;
    create(instructions: Instructions): Promise<any>;
    update(instructions: Instructions): Promise<any>;
    destroy(instructions: Instructions): Promise<any>;
    find(instructions: Instructions): Promise<any>;
    findMany(instructions: Instructions): Promise<any[]>;
    createMany(instructions: Instructions): Promise<any[]>;
    dropCollection(instructions: Instructions): Promise<void>;
    dropIndex(instructions: Instructions): Promise<void>;
    rewriteCollection(instructions: Instructions): Promise<void>;
    ensureIndex(instructions: {
        collection: string;
        field: string;
    }): Promise<void>;
}
export declare const quickTx: (db: SencilloDB) => (operation: keyof Transaction, instructions: Instructions) => Promise<any>;
export declare const createResourceManager: (config: {
    schema?: [string, any][];
    db?: SencilloDB;
    index?: (obj: any) => string;
    collection?: string;
}) => {
    validate: (obj: any) => boolean;
    execute(operation: keyof Transaction, instructions: Instructions): Promise<any>;
};
