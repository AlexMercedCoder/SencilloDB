## SencilloDB

#### created by Alex Merced of AlexMercedCoder.dev

_Sencillo is spanish for Simple_

SencilloDB is a small passion project to create a small compact but flexible object store using JSON files.

For example this code:

```js
import { SencilloDB } from "sencillodb";

const db = new SencilloDB();

const people = await db.transaction((tx) => {
  const people = tx.createMany({
    data: [
      { name: "Alex Merced", age: 24 },
      { name: "Alex Merced 1", age: 25 },
      { name: "Alex Merced 2", age: 26 },
      { name: "Alex Merced 3", age: 27 },
    ],
    collection: "people",
  });

  tx.update({
    _id: 4,
    data: { name: "Alex Merced three", age: 37 },
    collection: "people",
  });

  tx.destroy({ _id: 3, collection: "people" });

  return people;
});

console.log(people);
```

This code logs the following since we returned only the results of the initial create:

```js
[
  { name: "Alex Merced", age: 24, _id: 1 },
  { name: "Alex Merced 1", age: 25, _id: 2 },
  { name: "Alex Merced 2", age: 26, _id: 3 },
  { name: "Alex Merced 3", age: 27, _id: 4 },
];
```

create the following JSON in a json file (this has been prettified) which represents the state of the data at the end of the most recent transaction.

```json
{
  "people": {
    "__stats": { "inserted": 4, "total": 3 },
    "default": [
      { "name": "Alex Merced", "age": 24, "_id": 1 },
      { "name": "Alex Merced 1", "age": 25, "_id": 2 },
      { "name": "Alex Merced three", "age": 37, "_id": 4 }
    ]
  }
}
```

Architecture:

The JSON structure will have one object for each "collection" which can have several "indexes" to split the data for faster searches for large data set.

For example, you may have a collection of "people" but you index then based on the first letter of their name like "a", "b", etc. Every document gets an id based on the order it was inserted, so the 30th item to be inserted in the collection regardless of index will have an id of 30.

All operations are against the data in memory and only committed to the file at the end of a transaction.

We pass the DB transaction method a callback that takes a `tx` object which has different methods for different operations.

Whatever this callback returns is what the transaction returns, so you can only return the data relevant to you in the format relevant to you.

## SencilloDB Constructor

By defaults it saves the data in a file called sencillo.json but if you want to save it elsewhere just pass it a file location.

```js
const db = new SencilloDB({ file: "./app.json" });
```

## Transaction Methods

Here are the tx methods, each one takes an object as an argument referred to as instructions which we will detail later.

- tx.create(instructions): create one document in the specified collection and index and returns it.

- tx.update(instructions): replaces the document with the specified id with the object in the data. Returns the updated item.

- tx.destroy(instructions): removes an item with the specified id and returns it.

- tx.find(instructions): using a callback of `(item) => boolean` will return the first item against which the callback returns true across all indexes unless one is specified.

- tx.findMany(instructions): using a callback of `(item) => boolean` will return the all items against which the callback returns true across all indexes unless one is specified.

- tx.createMany(instructions): takes an array of objects to insert. An index can specified explicitly or a functions to dynamically determine the index for each item can be provided. Returns array of all created items.

- tx.dropCollection(instructions): removes the specified collection, all data in that collection is now gone.

- tx.dropIndex(instructions): removes the specified index in the specified collection. All data in that index is now gone.

## Instructions Argument

These are possible properties of the instructions argument

- \_id: \_id of the document in the collection you want to operate on using in ["update", "delete"]

- collect: collection to do operations in, defaults to "default". This is available in all operations.

- index: index of collection to apply operations to, applies to all transactions, and for create and createMany can pass a function `(item) => indexValue` as an index so each items index can be determined programmatically.

- callback: a callback similar to what you'd use for the find and filter array methods `(item, index) => boolean` used for the find and findMany operations to determine what to find.

- data: An object representing the data to create or update. When updating, the data is swapped so you want to include all existing properties along with changed ones.

- sort: Only for findMany, it's a function similar to those used for `Array.sort`, it will be used to sort your results once they've been gathered. By default it will sort based on id. `(x, y) => x._id - y.id`

## Quick Transactions

While using the transaction method gives you many benefits:

- batching multiple changes to your data
- return only the data you need from the transaction

There are times you just need to run one transaction and use it's return value without all the fuss. For that we have the `quickTx` function which will wrap a function around your database to more quickly execute one operation transactions.

```js
import { SencilloDB, quickTx } from "sencillodb";

const db = new SencilloDB({ file: "./app2.json" });

const qtx = quickTx(db);

console.log(
  await qtx("createMany", {
    data: [
      { name: "Alex Merced", age: 24 },
      { name: "Alex Merced 1", age: 25 },
      { name: "Alex Merced 2", age: 26 },
      { name: "Alex Merced 3", age: 27 },
    ],
    collection: "people",
    index: (i) => i.age,
  })
);
```
