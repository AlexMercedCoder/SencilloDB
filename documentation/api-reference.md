# API Reference

## Transaction Methods

These methods are available on the `tx` object passed to the `transaction` callback.

### `tx.create(instructions)`
Creates a single document.
- **instructions**:
  - `data` (Object): The data to insert.
  - `collection` (String): Collection name (default: "default").
  - `index` (String | Function): Index name or function to derive index from data (default: "default").
- **Returns**: The created document with `_id`.

### `tx.update(instructions)`
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

### `tx.rewriteCollection(instructions)`
Re-indexes and sorts a collection. Useful if you change your indexing strategy.
- **instructions**:
  - `collection` (String): Collection to rewrite.
  - `index` (String | Function): New index strategy.
  - `sort` (Function): Sort function for re-ordering.
