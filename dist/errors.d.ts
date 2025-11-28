export declare class SencilloDBError extends Error {
    constructor(message: string);
}
export declare class CollectionNotFoundError extends SencilloDBError {
    constructor(collection: string);
}
export declare class IndexNotFoundError extends SencilloDBError {
    constructor(index: string);
}
export declare class DocumentNotFoundError extends SencilloDBError {
    constructor(id: number);
}
export declare class ValidationError extends SencilloDBError {
    constructor(message: string);
}
export declare class DatabaseNotLoadedError extends SencilloDBError {
    constructor();
}
