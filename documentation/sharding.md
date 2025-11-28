# Partitioning (Sharding)

Partitioning (also known as Sharding) allows SencilloDB to split a single collection into multiple files based on the internal `index` buckets. This is the most powerful scalability feature, enabling partial loading of massive collections.

## How it Works

In standard **Folder Mode**, a collection is stored as a single file (e.g., `users.json`). If the `users` collection grows to 1GB, you have to load the entire 1GB into memory to access even a single record.

With **Sharding**, the collection is stored as a **directory** containing multiple files:

```
/my-db-folder/
  /users/
    meta.json           # Stores stats, ID map, and secondary indexes
    shard_default.json  # Stores data for "default" index
    shard_groupA.json   # Stores data for "groupA" index
    shard_groupB.json   # Stores data for "groupB" index
```

When you query the database using a specific index (e.g., `index: "groupA"`), SencilloDB **only loads `shard_groupA.json`**. The other shards remain on disk.

## Configuration

Sharding requires **Folder Mode** to be enabled.

```typescript
import { SencilloDB } from "sencillodb";

const db = new SencilloDB({
  folder: "./data",
  sharding: true // Enable partitioning
});
```

## Usage

To take full advantage of sharding, you should organize your data into logical buckets using the `index` property when creating data.

### Creating Data in Shards

```typescript
await db.transaction(async (tx) => {
  // Store US users in "us" shard
  await tx.create({ 
    collection: "users", 
    index: "us", 
    data: { name: "Alice", country: "US" } 
  });

  // Store UK users in "uk" shard
  await tx.create({ 
    collection: "users", 
    index: "uk", 
    data: { name: "Bob", country: "UK" } 
  });
});
```

### Querying Specific Shards

This is where the performance gain happens. This query **only loads the "us" shard**:

```typescript
const usUsers = await db.transaction(async (tx) => {
  return await tx.findMany({ 
    collection: "users", 
    index: "us", // Explicitly target the shard
    filter: { name: "Alice" } 
  });
});
```

### Cross-Shard Queries

If you do not specify an `index`, SencilloDB will scan **all shards**. This is slower but ensures you find the data regardless of where it is stored.

```typescript
// Scans "shard_us.json", "shard_uk.json", etc.
const allAlices = await db.transaction(async (tx) => {
  return await tx.findMany({ 
    collection: "users", 
    filter: { name: "Alice" } 
  });
});
```

## Metadata

Each sharded collection has a `meta.json` file. This file is always loaded when the collection is accessed. It contains:
- **Statistics**: Total count, inserted count.
- **ID Map**: Maps `_id` to the specific shard index (allowing O(1) lookups by ID without scanning).
- **Secondary Indexes**: Global indexes that span all shards.

## Combination with Other Features

Sharding works seamlessly with:
- **Compression**: Shard files will be compressed (e.g., `shard_us.json.gz`).
- **Stream Processing**: Shards are loaded and saved using streams.
