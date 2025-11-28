import { SencilloDB, quickTx, createResourceManager, Transaction } from "../src/index.js";
import { ValidationError } from "../src/errors.js";
import fs from "fs";
import path from "path";

const TEST_DB_FILE = "./test_db.json";

describe("SencilloDB", () => {
  let db: SencilloDB;

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
    const result = await db.transaction((tx: Transaction) => {
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
    await db.transaction((tx: Transaction) => {
      tx.create({ data: { name: "Old Name", age: 20 }, collection: "users" });
    });

    const updated = await db.transaction((tx: Transaction) => {
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
    await db.transaction((tx: Transaction) => {
      tx.create({ data: { name: "To Delete" }, collection: "users" });
    });

    const deleted = await db.transaction((tx: Transaction) => {
      return tx.destroy({ _id: 1, collection: "users" });
    });

    expect(deleted).toMatchObject({ name: "To Delete", _id: 1 });

    const content = JSON.parse(fs.readFileSync(TEST_DB_FILE, "utf-8"));
    expect(content.users.default).toHaveLength(0);
  });

  test("should find a document", async () => {
    await db.transaction((tx: Transaction) => {
      tx.create({ data: { name: "Find Me", type: "A" }, collection: "items" });
      tx.create({ data: { name: "Ignore Me", type: "B" }, collection: "items" });
    });

    const found = await db.transaction((tx: Transaction) => {
      return tx.find({
        collection: "items",
        callback: (item: any) => item.name === "Find Me",
      });
    });

    expect(found).toMatchObject({ name: "Find Me" });
  });

  test("should find many documents", async () => {
    await db.transaction((tx: Transaction) => {
      tx.create({ data: { val: 1 }, collection: "nums" });
      tx.create({ data: { val: 2 }, collection: "nums" });
      tx.create({ data: { val: 3 }, collection: "nums" });
    });

    const found = await db.transaction((tx: Transaction) => {
      return tx.findMany({
        collection: "nums",
        callback: (item: any) => item.val > 1,
      });
    });

    expect(found).toHaveLength(2);
    expect(found[0].val).toBe(2);
    expect(found[1].val).toBe(3);
  });

  test("should create many documents with dynamic index", async () => {
    const result = await db.transaction((tx: Transaction) => {
      return tx.createMany({
        data: [
          { name: "A", group: "alpha" },
          { name: "B", group: "beta" },
        ],
        collection: "grouped",
        index: (item: any) => item.group,
      });
    });

    expect(result).toHaveLength(2);

    const content = JSON.parse(fs.readFileSync(TEST_DB_FILE, "utf-8"));
    expect(content.grouped.alpha).toHaveLength(1);
    expect(content.grouped.beta).toHaveLength(1);
  });

  test("should rewrite collection", async () => {
     await db.transaction((tx: Transaction) => {
      tx.create({ data: { val: 3 }, collection: "sortme" });
      tx.create({ data: { val: 1 }, collection: "sortme" });
      tx.create({ data: { val: 2 }, collection: "sortme" });
    });

    await db.transaction((tx: Transaction) => {
        tx.rewriteCollection({
            collection: "sortme",
            sort: (a: any, b: any) => a.val - b.val
        })
    })

    const content = JSON.parse(fs.readFileSync(TEST_DB_FILE, "utf-8"));
    
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
        try {
             await User.execute("create", {
                data: { name: "Invalid", age: "25" }
            });
        } catch (e) {
            expect(e).toBeInstanceOf(ValidationError);
        }

         // Missing field
         try {
            await User.execute("create", {
               data: { name: "Missing" }
           });
       } catch (e) {
           expect(e).toBeInstanceOf(ValidationError);
       }

       if (fs.existsSync(TEST_DB_FILE)) fs.unlinkSync(TEST_DB_FILE);
    });
});

describe("Concurrency", () => {
    test("should handle concurrent transactions safely", async () => {
        if (fs.existsSync(TEST_DB_FILE)) fs.unlinkSync(TEST_DB_FILE);
        const db = new SencilloDB({ file: TEST_DB_FILE });

        // Run 5 concurrent transactions
        const promises = Array.from({ length: 5 }).map((_, i) => {
            return db.transaction((tx: Transaction) => {
                // Simulate some work
                return new Promise((resolve) => {
                    setTimeout(() => {
                        tx.create({
                            data: { val: i },
                            collection: "concurrent"
                        });
                        resolve(true);
                    }, Math.random() * 10);
                });
            });
        });

        await Promise.all(promises);

        const content = JSON.parse(fs.readFileSync(TEST_DB_FILE, "utf-8"));
        expect(content.concurrent.default).toHaveLength(5);
        
        // IDs should be 1 to 5
        const ids = content.concurrent.default.map((item: any) => item._id).sort((a: number, b: number) => a - b);
        expect(ids).toEqual([1, 2, 3, 4, 5]);

        if (fs.existsSync(TEST_DB_FILE)) fs.unlinkSync(TEST_DB_FILE);
    });
});

describe("Advanced Query Operators", () => {
    test("should filter using operators", async () => {
        if (fs.existsSync(TEST_DB_FILE)) fs.unlinkSync(TEST_DB_FILE);
        const db = new SencilloDB({ file: TEST_DB_FILE });

        await db.transaction((tx: Transaction) => {
            tx.createMany({
                collection: "products",
                data: [
                    { name: "Apple", price: 10, category: "fruit" },
                    { name: "Banana", price: 5, category: "fruit" },
                    { name: "Carrot", price: 3, category: "vegetable" },
                    { name: "Steak", price: 20, category: "meat" }
                ]
            });
        });

        // $gt
        const expensive = await db.transaction((tx: Transaction) => {
            return tx.findMany({
                collection: "products",
                filter: { price: { $gt: 8 } }
            });
        });
        expect(expensive).toHaveLength(2); // Apple, Steak

        // $in
        const fruits = await db.transaction((tx: Transaction) => {
            return tx.findMany({
                collection: "products",
                filter: { category: { $in: ["fruit"] } }
            });
        });
        expect(fruits).toHaveLength(2);

        // $regex
        const startsWithC = await db.transaction((tx: Transaction) => {
            return tx.findMany({
                collection: "products",
                filter: { name: { $regex: "^C" } }
            });
        });
        expect(startsWithC).toHaveLength(1); // Carrot
        expect(startsWithC[0].name).toBe("Carrot");

        if (fs.existsSync(TEST_DB_FILE)) fs.unlinkSync(TEST_DB_FILE);
    });
});

describe("Population", () => {
    test("should populate related documents", async () => {
        if (fs.existsSync(TEST_DB_FILE)) fs.unlinkSync(TEST_DB_FILE);
        const db = new SencilloDB({ file: TEST_DB_FILE });

        await db.transaction((tx: Transaction) => {
            // Create users
            const user1 = tx.create({ collection: "users", data: { name: "Alice" } });
            const user2 = tx.create({ collection: "users", data: { name: "Bob" } });

            // Create posts
            tx.create({ collection: "posts", data: { title: "Post 1", authorId: user1._id } });
            tx.create({ collection: "posts", data: { title: "Post 2", authorId: user2._id } });
        });

        const posts = await db.transaction((tx: Transaction) => {
            return tx.findMany({
                collection: "posts",
                callback: () => true,
                populate: [{ field: "authorId", collection: "users" }]
            });
        });

        expect(posts).toHaveLength(2);
        expect(posts[0].authorId).toMatchObject({ name: "Alice" });
        expect(posts[1].authorId).toMatchObject({ name: "Bob" });

        if (fs.existsSync(TEST_DB_FILE)) fs.unlinkSync(TEST_DB_FILE);
    });
});

describe("Secondary Indexing", () => {
    test("should maintain and use secondary indexes", async () => {
        if (fs.existsSync(TEST_DB_FILE)) fs.unlinkSync(TEST_DB_FILE);
        const db = new SencilloDB({ file: TEST_DB_FILE });

        await db.transaction((tx: Transaction) => {
            tx.ensureIndex({ collection: "users", field: "email" });
            
            tx.createMany({
                collection: "users",
                data: [
                    { name: "Alice", email: "alice@example.com", age: 30 },
                    { name: "Bob", email: "bob@example.com", age: 25 },
                    { name: "Charlie", email: "charlie@example.com", age: 35 }
                ]
            });
        });

        // Find using index (optimization should kick in)
        const alice = await db.transaction((tx: Transaction) => {
            return tx.find({
                collection: "users",
                filter: { email: "alice@example.com" }
            });
        });
        expect(alice).toMatchObject({ name: "Alice" });

        // Update email (should update index)
        await db.transaction((tx: Transaction) => {
            tx.update({
                collection: "users",
                _id: alice._id,
                data: { ...alice, email: "alice_new@example.com" }
            });
        });

        // Find with old email (should fail)
        const oldAlice = await db.transaction((tx: Transaction) => {
            return tx.find({
                collection: "users",
                filter: { email: "alice@example.com" }
            });
        });
        expect(oldAlice).toBeUndefined();

        // Find with new email (should succeed)
        const newAlice = await db.transaction((tx: Transaction) => {
            return tx.find({
                collection: "users",
                filter: { email: "alice_new@example.com" }
            });
        });
        expect(newAlice).toMatchObject({ name: "Alice", email: "alice_new@example.com" });

        // Destroy (should remove from index)
        await db.transaction((tx: Transaction) => {
            tx.destroy({
                collection: "users",
                _id: newAlice._id
            });
        });

        const deletedAlice = await db.transaction((tx: Transaction) => {
            return tx.find({
                collection: "users",
                filter: { email: "alice_new@example.com" }
            });
        });
        expect(deletedAlice).toBeUndefined();

        if (fs.existsSync(TEST_DB_FILE)) fs.unlinkSync(TEST_DB_FILE);
    });
});

describe("AOF Persistence", () => {
    const AOF_FILE = TEST_DB_FILE + ".aof";

    beforeEach(() => {
        if (fs.existsSync(TEST_DB_FILE)) fs.unlinkSync(TEST_DB_FILE);
        if (fs.existsSync(AOF_FILE)) fs.unlinkSync(AOF_FILE);
    });

    afterEach(() => {
        if (fs.existsSync(TEST_DB_FILE)) fs.unlinkSync(TEST_DB_FILE);
        if (fs.existsSync(AOF_FILE)) fs.unlinkSync(AOF_FILE);
    });

    test("should append operations to AOF file", async () => {
        const db = new SencilloDB({ file: TEST_DB_FILE, aof: true });

        await db.transaction((tx: Transaction) => {
            tx.create({ collection: "users", data: { name: "Alice" } });
        });

        expect(fs.existsSync(AOF_FILE)).toBe(true);
        const aofContent = fs.readFileSync(AOF_FILE, "utf-8");
        expect(aofContent).toContain("create");
        expect(aofContent).toContain("Alice");

        // JSON file should be empty (default {}) because we didn't saveDB
        const jsonContent = fs.readFileSync(TEST_DB_FILE, "utf-8");
        expect(jsonContent).toBe("{}");
    });

    test("should replay operations from AOF file", async () => {
        // 1. Create and write to AOF
        let db = new SencilloDB({ file: TEST_DB_FILE, aof: true });
        await db.transaction((tx: Transaction) => {
            tx.create({ collection: "users", data: { name: "Bob" } });
        });

        // 2. Re-open DB
        db = new SencilloDB({ file: TEST_DB_FILE, aof: true });
        
        // We need to trigger a load. Transaction does it.
        const user = await db.transaction((tx: Transaction) => {
            return tx.find({ collection: "users", filter: { name: "Bob" } });
        });

        expect(user).toMatchObject({ name: "Bob" });
    });

    test("should compact AOF file", async () => {
        const db = new SencilloDB({ file: TEST_DB_FILE, aof: true });
        await db.transaction((tx: Transaction) => {
            tx.create({ collection: "users", data: { name: "Charlie" } });
        });

        expect(fs.existsSync(AOF_FILE)).toBe(true);

        await db.compact();

        expect(fs.existsSync(AOF_FILE)).toBe(false);
        const jsonContent = JSON.parse(fs.readFileSync(TEST_DB_FILE, "utf-8"));
        expect(jsonContent.users.default).toHaveLength(1);
        expect(jsonContent.users.default[0].name).toBe("Charlie");
    });
});
