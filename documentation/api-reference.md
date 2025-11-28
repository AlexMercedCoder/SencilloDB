# API Reference

## Transaction Methods

These methods are available on the `tx` object passed to the `transaction` callback.

### `tx.create(instructions)`
Creates a single document.
- **instructions**:
  - `config` (Object): Configuration object.
  - `file` (String): Path to the JSON file (default: `./sencillo.json`).
  - `loadHook` (Function): Async function to load data string.
  - `saveHook` (Function): Async function to save data string.
  - `aof` (Boolean): Enable Append-Only File persistence (default: `false`).
  - `data` (Object): The data to insert.
  - `collection` (String): Collection name (default: "default").
  - `index` (String | Function): Index name or function to derive index from data (default: "default").
- **Returns**: The created document with `_id`.

### `db.transaction(callback)`
Executes a transaction.
- `callback` (Function): A function that receives a `Transaction` object.

### `db.compact()`
Compacts the AOF log into the main JSON file. Only relevant if `aof: true`.

### `Transaction` Methodstructions)`
Updates an existing document.
- **instructions**:
  - `_id` (Number): ID of the document to update.
  - `data` (Object): New data (replaces existing).
  - `collection` (String): Collection name.
  - `index` (String | Object): Current index. To move to a new index, pass `{ current: "oldIndex", new: "newIndex" }`.
- **Returns**: The updated document.

### `tx.destroy(instructions)`
Removes a document.
- **instructions**:
  - `_id` (Number): ID of the document to remove.
  - `collection` (String): Collection name.
  - `index` (String): Index name.
- **Returns**: The removed document.

### `tx.find(instructions)`
Finds the first document matching a condition.
- **instructions**:
  - `callback` (Function): `(item) => boolean`.
  - `collection` (String): Collection name.
  - `index` (String, optional): Specific index to search.
- **Returns**: The found document or `undefined`.

### `tx.findMany(instructions)`
Finds all documents matching a condition.
- **instructions**:
  - `callback` (Function): `(item) => boolean`.
  - `collection` (String): Collection name.
  - `index` (String, optional): Specific index to search.
  - `sort` (Function, optional): Sort function `(a, b) => number`.
- **Returns**: Array of found documents.

### `tx.createMany(instructions)`
Creates multiple documents.
- **instructions**:
  - `data` (Array): Array of objects to insert.
  - `collection` (String): Collection name.
  - `index` (String | Function): Index name or function.
- **Returns**: Array of created documents.

### `tx.dropCollection(instructions)`
Deletes an entire collection.
- **instructions**:
  - `collection` (String): Collection to drop.

### `tx.dropIndex(instructions)`
Deletes a specific index.
- **instructions**:
  - `collection` (String): Collection name.
  - `index` (String): Index to drop.

### `tx.ensureIndex(instructions)`
Creates a secondary index.
- **instructions**:
  - `collection` (String): Collection name.
  - `field` (String): Field to index.

### `tx.rewriteCollection(instructions)`
Re-indexes and sorts a collection. Useful if you change your indexing strategy.
- **instructions**:
  - `collection` (String): Collection to rewrite.
  - `index` (String | Function): New index strategy.
  - `sort` (Function): Sort function for re-ordering.

## Query Operators

You can use a `filter` object in `find` and `findMany` instead of a callback. Supported operators:

- **Comparison**: `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`
- **Array**: `$in`, `$nin`
- **Evaluation**: `$regex`

Example:
```javascript
tx.findMany({
  collection: "users",
  filter: { age: { $gt: 18 }, role: { $in: ["admin", "editor"] } }
})
```

## Relations & Population

You can populate related documents using the `populate` option in `find` and `findMany`.

```javascript
tx.findMany({
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
