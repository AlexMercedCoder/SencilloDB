# Advanced Usage

## Quick Transactions (`quickTx`)

For simple, single-operation transactions, you can use `quickTx` to avoid writing a full callback.

```javascript
import { SencilloDB, quickTx } from "sencillodb";

const db = new SencilloDB();
const qtx = quickTx(db);

// Execute a single operation
await qtx("create", {
  data: { name: "Bob" },
  collection: "users"
});
```

## Resource Manager

`createResourceManager` allows you to enforce schemas and simplify interactions with a specific collection.

```javascript
import { SencilloDB, createResourceManager } from "sencillodb";

const db = new SencilloDB();

const User = createResourceManager({
  db,
  collection: "users",
  schema: [
    ["name", String],
    ["age", Number]
  ],
  index: (user) => user.age >= 18 ? "adult" : "minor"
});

// Validates data against schema before insertion
await User.execute("create", {
  data: { name: "Charlie", age: 25 }
});
```

## Custom Storage Hooks

You can override the default file system storage by providing `loadHook` and `saveHook` in the constructor. This is useful for saving data to S3, a remote database, or local storage in a browser.

```javascript
const db = new SencilloDB({
  loadHook: async () => {
    // Return JSON string from custom source
    return await fetchFromMyDatabase();
  },
  saveHook: async (jsonString) => {
    // Save JSON string to custom destination
    await saveToMyDatabase(jsonString);
  }
});
```
