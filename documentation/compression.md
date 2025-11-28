# Compression

SencilloDB supports Gzip compression for database files. This significantly reduces the disk space required to store your data, especially for text-heavy collections.

## How it Works

When compression is enabled, SencilloDB uses Node.js's built-in `zlib` module to compress data before writing it to disk and decompress it when reading.

- **Single File Mode**: The main database file is compressed (e.g., `sencillo.json` becomes a Gzip binary).
- **Folder Mode**: Each collection file is compressed individually and gets a `.gz` extension (e.g., `users.json.gz`).
- **Sharding Mode**: Each shard file is compressed individually (e.g., `shard_groupA.json.gz`).

## Configuration

To enable compression, set the `compression` option to `true` in the `SencilloConfig`.

```typescript
import { SencilloDB } from "sencillodb";

const db = new SencilloDB({
  file: "./my-db.json",
  compression: true // Enable Gzip compression
});
```

## Performance Considerations

- **Pros**: Drastically reduced disk usage (often 5-10x smaller).
- **Cons**: Slightly higher CPU usage during save/load operations due to compression/decompression overhead.

## Migration

**Important**: If you have an existing uncompressed database, enabling `compression: true` will cause it to fail to load. You must start with a fresh database or manually migrate your data (e.g., by writing a script to load uncompressed and save compressed).
