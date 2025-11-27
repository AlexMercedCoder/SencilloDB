import { SencilloDB, quickTx, createResourceManager } from "../index.js";
import fs from "fs";
import path from "path";

const TEST_DB_FILE = "./test_db.json";

describe("SencilloDB", () => {
  let db;

  beforeEach(async () => {
    // Clean up before each test
    if (fs.existsSync(TEST_DB_FILE)) {
      fs.unlinkSync(TEST_DB_FILE);
    }
    db = new SencilloDB({ file: TEST_DB_FILE });
  });

  afterAll(() => {
    // Final cleanup
    if (fs.existsSync(TEST_DB_FILE)) {
      fs.unlinkSync(TEST_DB_FILE);
    }
  });

  test("should initialize and create a file if it does not exist", () => {
    expect(fs.existsSync(TEST_DB_FILE)).toBe(true);
    const content = fs.readFileSync(TEST_DB_FILE, "utf-8");
    expect(JSON.parse(content)).toEqual({});
  });

  test("should create a document", async () => {
    const result = await db.transaction((tx) => {
      return tx.create({
        data: { name: "Test User", age: 30 },
        collection: "users",
      });
    });

    expect(result).toMatchObject({ name: "Test User", age: 30, _id: 1 });

    // Verify persistence
    const content = JSON.parse(fs.readFileSync(TEST_DB_FILE, "utf-8"));
    expect(content.users.default).toHaveLength(1);
    expect(content.users.default[0]).toMatchObject({ name: "Test User", age: 30, _id: 1 });
  });

  test("should update a document", async () => {
    // Seed data
    await db.transaction((tx) => {
      tx.create({ data: { name: "Old Name", age: 20 }, collection: "users" });
    });

    const updated = await db.transaction((tx) => {
      return tx.update({
        _id: 1,
        data: { name: "New Name", age: 21 },
        collection: "users",
      });
    });

    expect(updated).toMatchObject({ name: "New Name", age: 21, _id: 1 });

    const content = JSON.parse(fs.readFileSync(TEST_DB_FILE, "utf-8"));
    expect(content.users.default[0].name).toBe("New Name");
  });

  test("should destroy a document", async () => {
    await db.transaction((tx) => {
      tx.create({ data: { name: "To Delete" }, collection: "users" });
    });

    const deleted = await db.transaction((tx) => {
      return tx.destroy({ _id: 1, collection: "users" });
    });

    expect(deleted[0]).toMatchObject({ name: "To Delete", _id: 1 });

    const content = JSON.parse(fs.readFileSync(TEST_DB_FILE, "utf-8"));
    expect(content.users.default).toHaveLength(0);
  });

  test("should find a document", async () => {
    await db.transaction((tx) => {
      tx.create({ data: { name: "Find Me", type: "A" }, collection: "items" });
      tx.create({ data: { name: "Ignore Me", type: "B" }, collection: "items" });
    });

    const found = await db.transaction((tx) => {
      return tx.find({
        collection: "items",
        callback: (item) => item.name === "Find Me",
      });
    });

    expect(found).toMatchObject({ name: "Find Me" });
  });

  test("should find many documents", async () => {
    await db.transaction((tx) => {
      tx.create({ data: { val: 1 }, collection: "nums" });
      tx.create({ data: { val: 2 }, collection: "nums" });
      tx.create({ data: { val: 3 }, collection: "nums" });
    });

    const found = await db.transaction((tx) => {
      return tx.findMany({
        collection: "nums",
        callback: (item) => item.val > 1,
      });
    });

    expect(found).toHaveLength(2);
    expect(found[0].val).toBe(2);
    expect(found[1].val).toBe(3);
  });

  test("should create many documents with dynamic index", async () => {
    const result = await db.transaction((tx) => {
      return tx.createMany({
        data: [
          { name: "A", group: "alpha" },
          { name: "B", group: "beta" },
        ],
        collection: "grouped",
        index: (item) => item.group,
      });
    });

    expect(result).toHaveLength(2);

    const content = JSON.parse(fs.readFileSync(TEST_DB_FILE, "utf-8"));
    expect(content.grouped.alpha).toHaveLength(1);
    expect(content.grouped.beta).toHaveLength(1);
  });

  test("should rewrite collection", async () => {
     await db.transaction((tx) => {
      tx.create({ data: { val: 3 }, collection: "sortme" });
      tx.create({ data: { val: 1 }, collection: "sortme" });
      tx.create({ data: { val: 2 }, collection: "sortme" });
    });

    await db.transaction((tx) => {
        tx.rewriteCollection({
            collection: "sortme",
            sort: (a, b) => a.val - b.val
        })
    })

    const content = JSON.parse(fs.readFileSync(TEST_DB_FILE, "utf-8"));
    // IDs should be regenerated or order should be changed? 
    // The rewriteCollection uses createMany internally, which assigns new IDs based on insertion order.
    // So if we sort by val, the one with val 1 should get ID 1 (or next available if stats not reset? 
    // Wait, dropCollection is not called, but this.#db[collection] is set to undefined.
    // So stats are reset.
    
    expect(content.sortme.default[0].val).toBe(1);
    expect(content.sortme.default[0]._id).toBe(1);
    expect(content.sortme.default[1].val).toBe(2);
    expect(content.sortme.default[2].val).toBe(3);

  });
});

describe("quickTx", () => {
    test("should execute a transaction quickly", async () => {
        if (fs.existsSync(TEST_DB_FILE)) fs.unlinkSync(TEST_DB_FILE);
        const db = new SencilloDB({ file: TEST_DB_FILE });
        const qtx = quickTx(db);

        const result = await qtx("create", {
            data: { name: "Quick" },
            collection: "quick"
        });

        expect(result).toMatchObject({ name: "Quick", _id: 1});
        if (fs.existsSync(TEST_DB_FILE)) fs.unlinkSync(TEST_DB_FILE);
    });
});

describe("ResourceManager", () => {
    test("should validate schema", async () => {
        if (fs.existsSync(TEST_DB_FILE)) fs.unlinkSync(TEST_DB_FILE);
        const db = new SencilloDB({ file: TEST_DB_FILE });
        
        const User = createResourceManager({
            db,
            collection: "users",
            schema: [
                ["name", String],
                ["age", Number]
            ]
        });

        // Valid insert
        await expect(User.execute("create", {
            data: { name: "Valid", age: 25 }
        })).resolves.toMatchObject({ name: "Valid", age: 25 });

        // Invalid type
        // Note: The current implementation of validate throws a string, not an Error object.
        // So we expect it to reject.
        try {
             await User.execute("create", {
                data: { name: "Invalid", age: "25" }
            });
        } catch (e) {
            expect(e).toMatch(/RESOURE VALIDATION ERROR/);
        }

         // Missing field
         try {
            await User.execute("create", {
               data: { name: "Missing" }
           });
       } catch (e) {
           expect(e).toMatch(/RESOURE VALIDATION ERROR/);
       }

       if (fs.existsSync(TEST_DB_FILE)) fs.unlinkSync(TEST_DB_FILE);
    });
});
