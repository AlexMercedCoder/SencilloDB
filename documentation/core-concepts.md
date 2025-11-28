# Core Concepts

## Architecture

SencilloDB is an in-memory object store that persists to a JSON file or a folder of JSON files.

1.  **In-Memory**: All data (or active collections in folder mode) is loaded into memory when accessed. Operations are performed on the in-memory object.
SencilloDB uses a unique indexing system where data is stored in buckets based on an index key. This allows for efficient retrieval if the index key is known.

### Secondary Indexes
You can also create secondary indexes on any field using `ensureIndex`. This allows for O(1) retrieval of documents based on that field, significantly speeding up queries that filter by that field.

2.  **Persistence**: Data is written back to disk only at the end of a successful transaction.
3.  **JSON Structure**: Data is stored in a hierarchical JSON format:
    ```json
    {
      "collectionName": {
        "__stats": { "inserted": 0, "total": 0 },
        "indexName": [
          { "_id": 1, "data": "..." }
        ]
      }
    }
    ```

### Persistence Modes
- **Standard (Single File)**: The entire database is written to a single JSON file after every transaction. Simple and robust, but slower for large datasets.
- **Append-Only File (AOF)**: Operations are appended to a log file (`.aof`). Faster writes. Requires periodic `compact()`.
- **Folder Mode (Lazy Loading)**: Each collection is stored in its own file within a folder. Collections are loaded on demand and only modified collections are saved. Ideal for larger datasets where the whole DB doesn't fit in memory or to speed up startup/writes.

## Transactions

All operations in SencilloDB are performed within a **transaction**.

```javascript
await db.transaction(async (tx) => {
  // Operations here are atomic.
  // The file save only happens if this callback completes without error.
  await tx.create({ ... });
  await tx.update({ ... });
});
```

- **`tx` Object**: The callback receives a `tx` object containing methods like `create`, `update`, `find`, etc.
- **Return Value**: The `transaction` method returns a Promise that resolves to whatever your callback returns.
- **Safety**: If an error occurs in the callback, changes are discarded and not saved.
- **Concurrency**: Transactions are serialized using a Mutex.

## Collections and Indexes

- **Collection**: A logical grouping of documents (e.g., "users", "products").
- **Index**: A way to partition data within a collection. The default index is `"default"`. You can use custom indexes to organize data (e.g., by category, by first letter).
- **_id**: Every document is assigned a unique, auto-incrementing `_id` within its collection.
