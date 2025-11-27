# Core Concepts

## Architecture

SencilloDB is an in-memory object store that persists to a JSON file. 

1.  **In-Memory**: All data is loaded into memory when the database is initialized or accessed. Operations are performed on the in-memory object.
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

## Collections and Indexes

- **Collection**: A logical grouping of documents (e.g., "users", "products").
- **Index**: A way to partition data within a collection. The default index is `"default"`. You can use custom indexes to organize data (e.g., by category, by first letter).
- **_id**: Every document is assigned a unique, auto-incrementing `_id` within its collection.
