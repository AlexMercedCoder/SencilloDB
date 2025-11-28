# API Reference

## SencilloDB Class

### `new SencilloDB(config)`
Creates a new database instance.
- **config** (Object):
  - `file` (String, optional): Path to the single JSON file (default: `./sencillo.json`).
  - `folder` (String, optional): Path to the folder for storing collections as separate files.
  - `loadHook` (Function, optional): Async function to load data string.
  - `saveHook` (Function, optional): Async function to save data string.
  - `aof` (Boolean, optional): Enable Append-Only File persistence (default: `false`).

## Transaction Methods

All transaction methods are asynchronous and return a `Promise`. These methods are available on the `tx` object passed to the `transaction` callback.

### `async tx.create(instructions)`
Creates a single document.
- **instructions**:
  - `data` (Object): The data to insert.
  - `collection` (String): Collection name (default: "default").
  - `index` (String | Function): Index name or function to derive index from data (default: "default").
- **Returns**: Promise resolving to the created document with `_id`.

### `async db.transaction(callback)`
Executes a transaction.
- `callback` (Function): An async function that receives a `Transaction` object.
- **Returns**: Promise resolving to the return value of the callback.

### `async db.compact()`
Compacts the AOF log into the main JSON file. Only relevant if `aof: true`.

### `async tx.update(instructions)`
Updates an existing document.
- **instructions**:
  - `_id` (Number): ID of the document to update.
  - `data` (Object): New data (replaces existing).
  - `collection` (String): Collection name.
  - `index` (String | Object): Current index. To move to a new index, pass `{ current: "oldIndex", new: "newIndex" }`.
- **Returns**: Promise resolving to the updated document.

### `async tx.destroy(instructions)`
Removes a document.
- **instructions**:
  - `_id` (Number): ID of the document to remove.
  - `collection` (String): Collection name.
  - `index` (String): Index name.
- **Returns**: Promise resolving to the removed document.

### `async tx.find(instructions)`
Finds the first document matching a condition.
- **instructions**:
  - `callback` (Function, optional): `(item) => boolean`.
  - `filter` (Object, optional): Query object with operators.
  - `collection` (String): Collection name.
  - `index` (String, optional): Specific index to search.
  - `populate` (Array, optional): Array of population rules.
- **Returns**: Promise resolving to the found document or `undefined`.

### `async tx.findMany(instructions)`
Finds all documents matching a condition.
- **instructions**:
  - `callback` (Function, optional): `(item) => boolean`.
  - `filter` (Object, optional): Query object with operators.
  - `collection` (String): Collection name.
  - `index` (String, optional): Specific index to search.
  - `sort` (Function, optional): Sort function `(a, b) => number`.
  - `populate` (Array, optional): Array of population rules.
- **Returns**: Promise resolving to an array of found documents.

### `async tx.createMany(instructions)`
Creates multiple documents.
- **instructions**:
  - `data` (Array): Array of objects to insert.
  - `collection` (String): Collection name.
  - `index` (String | Function): Index name or function.
- **Returns**: Promise resolving to an array of created documents.

### `async tx.dropCollection(instructions)`
Deletes an entire collection.
- **instructions**:
  - `collection` (String): Collection to drop.
- **Returns**: Promise<void>.

### `async tx.dropIndex(instructions)`
Deletes a specific index.
- **instructions**:
  - `collection` (String): Collection name.
  - `index` (String): Index to drop.
- **Returns**: Promise<void>.

### `async tx.ensureIndex(instructions)`
Creates a secondary index.
- **instructions**:
  - `collection` (String): Collection name.
  - `field` (String): Field to index.
- **Returns**: Promise<void>.

### `async tx.rewriteCollection(instructions)`
Re-indexes and sorts a collection. Useful if you change your indexing strategy.
- **instructions**:
  - `collection` (String): Collection to rewrite.
  - `index` (String | Function): New index strategy.
  - `sort` (Function): Sort function for re-ordering.
- **Returns**: Promise<void>.

## Query Operators

You can use a `filter` object in `find` and `findMany` instead of a callback. Supported operators:

- **Comparison**: `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`
- **Array**: `$in`, `$nin`
- **Evaluation**: `$regex`

Example:
```javascript
await tx.findMany({
  collection: "users",
  filter: { age: { $gt: 18 }, role: { $in: ["admin", "editor"] } }
})
```

## Relations & Population

You can populate related documents using the `populate` option in `find` and `findMany`.

```javascript
await tx.findMany({
  collection: "posts",
  callback: () => true,
  populate: [
    { field: "authorId", collection: "users" }
  ]
})
```
- `field`: The property in the current document containing the reference ID.
- `collection`: The target collection to search in.
- `targetField` (Optional): The field in the target collection to match against (defaults to `_id`).

## Error Handling

SencilloDB throws the following errors:

- `CollectionNotFoundError`: When a collection does not exist.
- `IndexNotFoundError`: When an index does not exist.
- `DocumentNotFoundError`: When a document ID is not found.
- `ValidationError`: When input data is invalid.
- `DatabaseNotLoadedError`: When the database is not loaded.
