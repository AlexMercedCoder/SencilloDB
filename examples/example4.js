import { SencilloDB, quickTx, createResourceManager } from "../index.js";

const db = new SencilloDB({ file: "./app3.json" });

const Friends = createResourceManager({
  schema: [
    ["age", Number],
    ["name", String],
    ["favorites", Array],
  ],
  db,
  collection: "friends",
  index: (obj) => obj.age,
});

Friends.execute("createMany", {
  data: [
    {name: "Alex", age: 37, favorites: ["cheese"]}
  ]
})
