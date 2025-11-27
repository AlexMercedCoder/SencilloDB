# Getting Started with SencilloDB

## Installation

Install SencilloDB using npm:

```bash
npm install sencillodb
```

## Basic Usage

Import `SencilloDB` and create an instance. By default, it will save data to `sencillo.json` in the current directory.

```javascript
import { SencilloDB } from "sencillodb";

// Initialize the database
const db = new SencilloDB({ file: "./my-database.json" });

// Perform a transaction
const result = await db.transaction((tx) => {
  // Create a new document
  const newUser = tx.create({
    data: { name: "Alice", age: 30 },
    collection: "users",
  });
  
  return newUser;
});

console.log(result);
```

## Next Steps

- Learn about [Core Concepts](./core-concepts.md)
- Explore the [API Reference](./api-reference.md)
- Check out [Advanced Usage](./advanced-usage.md) for hooks and resource managers.
