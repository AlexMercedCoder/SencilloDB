import { SencilloDB, quickTx } from "../index.js";

const db = new SencilloDB({ file: "./app3.json" });

const qtx = quickTx(db)

console.log(await qtx("createMany", {
    data: [
      { name: "Alex Merced", age: 24 },
      { name: "Alex Merced 1", age: 25 },
      { name: "Blex Merced 2", age: 26 },
      { name: "Clex Merced 3", age: 27 },
    ],
    collection: "people",
    index: (i) => i.age
  }))

await qtx("rewriteCollection", {
    collection: "people",
    sort: (x,y) => x.age - y.age,
    index: (obj) => obj.name.split("")[0]
  })