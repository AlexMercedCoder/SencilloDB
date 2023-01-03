import { SencilloDB, quickTx } from "../index.js";

const db = new SencilloDB({ file: "./app2.json" });

const qtx = quickTx(db)

console.log(await qtx("createMany", {
    data: [
      { name: "Alex Merced", age: 24 },
      { name: "Alex Merced 1", age: 25 },
      { name: "Alex Merced 2", age: 26 },
      { name: "Alex Merced 3", age: 27 },
    ],
    collection: "people",
    index: (i) => i.age
  }))