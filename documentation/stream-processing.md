# Stream Processing for Persistence

SencilloDB uses stream processing to handle file I/O efficiently, especially for large datasets. This prevents the entire database from being loaded into memory at once during read/write operations and avoids blocking the Node.js event loop.

## How it Works

SencilloDB integrates the **`bfj` (Big Friendly JSON)** library to perform asynchronous, streaming JSON parsing and stringification.

- **Reading**: Instead of reading the entire file into a string and then parsing it with `JSON.parse`, SencilloDB streams the file content directly into the parser.
- **Writing**: SencilloDB streams the JavaScript objects directly to the file system, stringifying them on the fly.

## Benefits

1.  **Reduced Memory Footprint**: Only small chunks of the file are in memory at any given time during I/O.
2.  **Non-Blocking**: The main thread remains responsive, allowing your application to handle other requests while the database is loading or saving.
3.  **Scalability**: Enables SencilloDB to handle JSON files that are larger than the available RAM (within reason, as the loaded data still resides in memory).

## Usage

This feature is **enabled by default** and requires no configuration. It is transparently handled by the `SencilloDB` class.

```typescript
import { SencilloDB } from "sencillodb";

// Stream processing is automatically used for all file operations
const db = new SencilloDB({ file: "./large-db.json" });
```
