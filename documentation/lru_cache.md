# LRU Cache for Collections

SencilloDB implements a Least Recently Used (LRU) cache to manage memory usage when working with large datasets, especially when using **Folder Persistence** or **Sharding**.

## Overview

When `maxCacheSize` is configured, SencilloDB limits the number of collections (or shards) kept in memory. When the limit is reached, the least recently used item is evicted from memory.

- **Dirty Items**: If an item to be evicted has unsaved changes, it is automatically saved to disk before eviction.
- **Granularity**:
  - In **Folder Mode**, the unit of caching is a **Collection**.
  - In **Sharding Mode**, the unit of caching is a **Shard** (e.g., `users::groupA`). The collection metadata is also cached as a separate item.

## Configuration

Enable LRU cache by passing `maxCacheSize` to the constructor:

```typescript
const db = new SencilloDB({
  folder: "./data",
  maxCacheSize: 100 // Keep at most 100 collections/shards in memory
});
```

- `maxCacheSize`: The maximum number of items to keep in memory. Defaults to `0` (unlimited).

## How it Works

1.  **Access**: Every time you access a collection or shard (e.g., `find`, `create`, `update`), it is marked as "most recently used".
2.  **Eviction**: If loading a new item causes the cache size to exceed `maxCacheSize`, the least recently used item is removed from memory.
3.  **Persistence**: Evicted items are saved to disk if they have been modified.

## Example

```typescript
const db = new SencilloDB({ folder: "./db", maxCacheSize: 2 });

// Load/Create 3 collections
await db.create({ collection: "A", data: { val: 1 } });
await db.create({ collection: "B", data: { val: 2 } });
// Cache: [A, B]

await db.create({ collection: "C", data: { val: 3 } });
// Cache: [B, C]. Collection A is evicted (and saved).

// Accessing A again will reload it from disk
const docs = await db.find({ collection: "A", filter: {} });
// Cache: [C, A]. Collection B is evicted.
```

## Benefits

- **Memory Efficiency**: Allows working with datasets larger than available RAM.
- **Performance**: Keeps frequently accessed data in memory for fast operations.
