# SencilloDB Architecture

## Overview
SencilloDB is a lightweight, JSON-based object store designed for simplicity and flexibility. It operates primarily in-memory, persisting data to a JSON file (or custom storage via hooks) at the end of each transaction. It now supports **Collection-Level Persistence (Lazy Loading)** for handling larger datasets by splitting data across multiple files.

## Core Components

### 1. SencilloDB Class (`src/index.ts`)
The main class that manages the database instance.
- **Constructor**: Initializes the DB with a file path, a folder path (for lazy loading), or custom load/save hooks.
- **State**: Maintains the database state in memory (`#db`). In folder mode, collections are loaded into memory only when accessed.
- **Persistence**: 
    - `#loadDB()`: Loads data from the file or `loadHook` (Single File Mode).
    - `#getCollection(name)`: Lazily loads a specific collection from disk (Folder Mode).
    - `#saveDB()`: Saves data to the file or `saveHook`. In Folder Mode, it saves only modified ("dirty") collections.
- **Transaction Management**: 
    - `transaction(callback)`: Handles atomic operations. It passes a transaction object (`tx`) to the callback and saves the DB only if the callback executes successfully. All operations are asynchronous.

### 2. Transaction Operations
The `tx` object exposed in `transaction` supports the following operations (all return Promises):
- **CRUD**:
    - `create(instructions)`: Adds a document.
    - `update(instructions)`: Updates a document by `_id`.
    - `destroy(instructions)`: Removes a document by `_id`.
    - `find(instructions)`: Finds a single document matching a callback.
    - `findMany(instructions)`: Finds multiple documents matching a callback.
    - `createMany(instructions)`: Batch creation of documents.
- **Schema/Index Management**:
    - `dropCollection(instructions)`: Deletes an entire collection.
    - `dropIndex(instructions)`: Deletes a specific index within a collection.
    - `rewriteCollection(instructions)`: Re-indexes and sorts a collection.
    - `ensureIndex(instructions)`: Creates a secondary index.

### 3. Quick Transactions (`quickTx`)
A helper function that wraps `transaction` to perform single operations without manually invoking the transaction method.

### 4. Resource Manager (`createResourceManager`)
A factory function that creates a wrapper around `SencilloDB` to enforce schemas.
- **Validation**: Checks if data matches the defined schema (property existence and type).
- **Execution**: Delegates operations to `quickTx` after validation.

### 5. Error Handling
SencilloDB uses custom error classes for better debugging:
- `SencilloDBError`: Base class for all errors.
- `CollectionNotFoundError`: Thrown when accessing a non-existent collection.
- `IndexNotFoundError`: Thrown when accessing a non-existent index.
- `DocumentNotFoundError`: Thrown when an operation targets a non-existent document ID.
- `ValidationError`: Thrown when input data fails validation (e.g., missing required fields, wrong type).
- `DatabaseNotLoadedError`: Thrown if operations are attempted before the DB is loaded.

### 6. Concurrency Control
SencilloDB ensures data integrity in concurrent environments:
- **Mutex**: A mutex lock serializes all transactions, ensuring that only one transaction modifies the in-memory state and writes to the file at a time.
- **Atomic Writes**: Data is written to a temporary file first and then renamed to the target file. This prevents data corruption if the process crashes during a write operation.

### 7. Query Engine
SencilloDB supports structured queries with MongoDB-like operators:
- **Comparison**: `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`
- **Array**: `$in`, `$nin`
- **Evaluation**: `$regex`

### 8. Relations & Population
SencilloDB supports basic relational data retrieval:
- **Population**: `find` and `findMany` operations can automatically replace reference IDs with the actual related documents from other collections using the `populate` option.

### 9. Secondary Indexing
SencilloDB supports true secondary indexing for O(1) lookups:
- **`ensureIndex`**: Creates a secondary index on a specific field.
- **Optimization**: `find` and `findMany` queries automatically use secondary indexes if the filter contains an equality check on an indexed field.
- **Maintenance**: Indexes are automatically updated on `create`, `update`, and `destroy` operations.

### 10. Append-Only File (AOF) Persistence
SencilloDB supports AOF persistence for high-throughput write scenarios:
- **Log-Based**: Writes are appended to an `.aof` file instead of rewriting the entire database.
- **Replay**: On startup, the AOF log is replayed to restore the database state.
- **Compaction**: The `compact()` method merges the AOF log into the main JSON file and clears the log.

### 11. Collection-Level Persistence (Lazy Loading)
For larger datasets, SencilloDB can be configured to use a folder instead of a single file:
- **Folder Mode**: Each collection is stored in its own JSON file (e.g., `users.json`, `posts.json`).
- **Lazy Loading**: Collections are loaded into memory only when they are accessed by a transaction.
- **Efficient Writes**: Only collections that have been modified during a transaction are written back to disk.
- **Memory Management**: This allows SencilloDB to handle datasets larger than what would comfortably fit in a single JSON file, provided that the working set (active collections) fits in memory.

### 12. Stream Processing
To efficiently handle large files without blocking the event loop or consuming excessive memory:
- **Streaming I/O**: Uses `bfj` (Big Friendly JSON) to stream JSON parsing and stringification.
- **Asynchronous Processing**: Reads and writes are performed in chunks, allowing the application to remain responsive even when loading or saving large datasets.

### 13. Compression
SencilloDB supports Gzip compression to reduce disk usage:
- **Integration**: Uses Node.js `zlib` streams piped to/from `bfj` streams.
- **Transparent**: Compression is handled automatically during load and save operations if `compression: true` is enabled.
- **Compatibility**: Works with Single File, Folder, and Sharding modes.

### 14. Partitioning (Sharding)
For very large collections, SencilloDB can split a single collection into multiple files:
- **Sharding Strategy**: Data is partitioned based on the index value (e.g., `users/shard_A.json`, `users/shard_B.json`).
- **Partial Loading**: Only the required shards are loaded into memory during a transaction.
- **Metadata**: A `meta.json` file tracks collection-level statistics.
- **Scalability**: Enables handling collections that are too large to fit in memory entirely, as long as individual shards fit.

### 15. LRU Cache
To manage memory usage when using Folder Persistence or Sharding:
- **Eviction Policy**: Least Recently Used (LRU) items (collections or shards) are evicted from memory when `maxCacheSize` is reached.
- **Dirty Check**: Modified items are automatically saved to disk before eviction.
- **Granularity**: Caches entire collections in Folder Mode, or individual shards in Sharding Mode.

## Data Structure
The data is stored as a JSON object with the following hierarchy:
```json
{
  "collectionName": {
    "__stats": { "inserted": <count>, "total": <count> },
    "indexName": [
      { "_id": 1, ...data },
      { "_id": 2, ...data }
    ]
  }
}
```
- **Single File Mode**: All collections are in one root JSON object.
- **Folder Mode**: Each file contains the JSON object for a single collection.
- **Collection**: A logical grouping of data (e.g., "users").
- **Index**: A subdivision within a collection (e.g., grouped by first letter of name). Default is "default".
- **Documents**: Objects stored within an index array. Each document is assigned a unique auto-incrementing `_id`.
- **Shards**: In Sharding Mode, indexes are stored in separate files (e.g., `collectionName/shard_indexName.json`).

## Design Principles
- **In-Memory Operations**: All reads and writes happen in memory for speed.
- **Atomic Transactions**: Changes are persisted only after the transaction callback completes successfully.
- **Flexibility**: Custom hooks allow integration with other storage backends (e.g., S3, other DBs).
- **Simplicity**: No complex query language; uses JavaScript callbacks for filtering and sorting.
