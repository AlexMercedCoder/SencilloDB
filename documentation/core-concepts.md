# Core Concepts

## Architecture

SencilloDB is an in-memory object store that persists to a JSON file. 

1.  **In-Memory**: All data is loaded into memory when the database is initialized or accessed. Operations are performed on the in-memory object.
SencilloDB uses a unique indexing system where data is stored in buckets based on an index key. This allows for efficient retrieval if the index key is known.

### Secondary Indexes
You can also create secondary indexes on any field using `ensureIndex`. This allows for O(1) retrieval of documents based on that field, significantly speeding up queries that filter by that field.

2.  **Persistence**: Data is written back to the file (or custom storage) only at the end of a successful transaction.
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
- **Standard (Default)**: The entire database is written to the JSON file after every transaction. This is simple and robust but can be slow for large databases with frequent writes.
- **Append-Only File (AOF)**: Operations are appended to a log file (`.aof`). This is much faster for writes. The log is replayed on startup. You should periodically call `compact()` to merge the log into the main file.

## Transactions

All operations in SencilloDB are performed within a **transaction**. 

```javascript
await db.transaction((tx) => {
  // Operations here are atomic in the sense that 
  // the file save only happens if this callback completes without error.
  tx.create({ ... });
  tx.update({ ... });
});
```

- **`tx` Object**: The callback receives a `tx` object containing methods like `create`, `update`, `find`, etc.
- **Return Value**: The `transaction` method returns whatever your callback returns.
- **Safety**: If an error occurs in the callback, the changes are not saved to the file, and the in-memory state is reloaded from the file to ensure consistency.
- **Concurrency**: Transactions are serialized using a Mutex. If multiple transactions are initiated concurrently, they will execute one after another.

## Collections and Indexes

- **Collection**: A logical grouping of documents (e.g., "users", "products").
- **Index**: A way to partition data within a collection. The default index is `"default"`. You can use custom indexes to organize data (e.g., by category, by first letter).
- **_id**: Every document is assigned a unique, auto-incrementing `_id` within its collection.
