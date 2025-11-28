export class SencilloDBError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SencilloDBError";
  }
}

export class CollectionNotFoundError extends SencilloDBError {
  constructor(collection: string) {
    super(`Collection '${collection}' not found`);
    this.name = "CollectionNotFoundError";
  }
}

export class IndexNotFoundError extends SencilloDBError {
  constructor(index: string) {
    super(`Index '${index}' not found`);
    this.name = "IndexNotFoundError";
  }
}

export class DocumentNotFoundError extends SencilloDBError {
  constructor(id: number) {
    super(`Document with _id '${id}' not found`);
    this.name = "DocumentNotFoundError";
  }
}

export class ValidationError extends SencilloDBError {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class DatabaseNotLoadedError extends SencilloDBError {
  constructor() {
    super("Database not loaded");
    this.name = "DatabaseNotLoadedError";
  }
}
