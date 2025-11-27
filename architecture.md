# SencilloDB Architecture

## Overview
SencilloDB is a lightweight, JSON-based object store designed for simplicity and flexibility. It operates primarily in-memory, persisting data to a JSON file (or custom storage via hooks) at the end of each transaction.

## Core Components

### 1. SencilloDB Class (`index.js`)
The main class that manages the database instance.
- **Constructor**: Initializes the DB with a file path or custom load/save hooks.
- **State**: Maintains the database state in memory (`#db`).
- **Persistence**: 
    - `#loadDB()`: Loads data from the file or `loadHook`.
    - `#saveDB()`: Saves data to the file or `saveHook`.
- **Transaction Management**: 
    - `transaction(callback)`: Handles atomic operations. It passes a transaction object (`tx`) to the callback and saves the DB only if the callback executes successfully.

### 2. Transaction Operations
The `tx` object exposed in `transaction` supports the following operations:
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

### 3. Quick Transactions (`quickTx`)
A helper function that wraps `transaction` to perform single operations without manually invoking the transaction method.

### 4. Resource Manager (`createResourceManager`)
A factory function that creates a wrapper around `SencilloDB` to enforce schemas.
- **Validation**: Checks if data matches the defined schema (property existence and type).
- **Execution**: Delegates operations to `quickTx` after validation.

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
- **Collection**: A logical grouping of data (e.g., "users").
- **Index**: A subdivision within a collection (e.g., grouped by first letter of name). Default is "default".
- **Documents**: Objects stored within an index array. Each document is assigned a unique auto-incrementing `_id`.

## Design Principles
- **In-Memory Operations**: All reads and writes happen in memory for speed.
- **Atomic Transactions**: Changes are persisted only after the transaction callback completes successfully.
- **Flexibility**: Custom hooks allow integration with other storage backends (e.g., S3, other DBs).
- **Simplicity**: No complex query language; uses JavaScript callbacks for filtering and sorting.
