import { SencilloDB } from "../index.js";

const db = new SencilloDB({ file: "./app.json" });

const people = await db.transaction((tx) => {
  tx.createMany({
    data: [
      { name: "Alex Merced", age: 24 },
      { name: "Alex Merced 1", age: 25 },
      { name: "Alex Merced 2", age: 26 },
      { name: "Alex Merced 3", age: 27 },
    ],
    collection: "people",
    index: (i) => i.age
  });

  tx.update({
    _id: 4,
    data: { name: "Alex Merced three", age: 37 },
  });

  tx.destroy({ _id: 3, collection: "people" , index: 26});

  const people = tx.findMany({
      callback: (i) => {
          console.log(i)
          return true
      },
      collection: "people"
  })

  return people;
});

console.log(people);