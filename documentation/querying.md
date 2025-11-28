# Querying Data

SencilloDB provides powerful querying capabilities, including MongoDB-like operators and relational population.

## Basic Finding

You can find documents using a callback function:

```javascript
const user = await db.transaction(tx => {
  return tx.find({
    collection: "users",
    callback: (user) => user.name === "Alex"
  });
});
```

## Query Operators

Instead of a callback, you can use a `filter` object with operators.

### Comparison Operators

- `$eq`: Equal to (implicit if no operator specified)
- `$ne`: Not equal to
- `$gt`: Greater than
- `$gte`: Greater than or equal to
- `$lt`: Less than
- `$lte`: Less than or equal to

```javascript
// Find users older than 18
tx.findMany({
  collection: "users",
  filter: { age: { $gt: 18 } }
});

// Find users not named "Bob"
tx.findMany({
  collection: "users",
  filter: { name: { $ne: "Bob" } }
});
```

### Array Operators

- `$in`: Value is in the specified array
- `$nin`: Value is NOT in the specified array

```javascript
// Find users with role "admin" or "editor"
tx.findMany({
  collection: "users",
  filter: { role: { $in: ["admin", "editor"] } }
});
```

### Evaluation Operators

- `$regex`: Match string against a regular expression pattern

```javascript
// Find users whose name starts with "A"
tx.findMany({
  collection: "users",
  filter: { name: { $regex: "^A" } }
});
```

## Relations & Population

SencilloDB allows you to reference documents in other collections and automatically "populate" them during a query.

### Setup

Suppose you have `users` and `posts`.

```javascript
// Create user
const user = tx.create({ collection: "users", data: { name: "Alice" } });

// Create post referencing user
tx.create({ 
  collection: "posts", 
  data: { title: "Hello World", authorId: user._id } 
});
```

### Populating

Use the `populate` option to replace the ID with the actual document.

```javascript
const posts = tx.findMany({
  collection: "posts",
  callback: () => true, // Return all posts
  populate: [
    { 
      field: "authorId",      // Field in 'posts' containing the ID
      collection: "users"     // Collection to search in
    }
  ]
});

console.log(posts[0].authorId); 
// Output: { _id: 1, name: "Alice" }
```

You can populate multiple fields by adding more objects to the `populate` array.
