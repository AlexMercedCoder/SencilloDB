import { SencilloDB, quickTx, createResourceManager, Transaction } from "../src/index.js";
import { ValidationError } from "../src/errors.js";
import fs from "fs";
import path from "path";

const TEST_DB_FILE = "./test_db.json";
const TEST_DB_FOLDER = "./test_db_folder";

describe("SencilloDB", () => {
  let db: SencilloDB;

  beforeEach(async () => {
    // Clean up before each test
    if (fs.existsSync(TEST_DB_FILE)) {
      fs.unlinkSync(TEST_DB_FILE);
    }
    if (fs.existsSync(TEST_DB_FOLDER)) {
        fs.rmSync(TEST_DB_FOLDER, { recursive: true, force: true });
    }
    db = new SencilloDB({ file: TEST_DB_FILE });
  });

  afterAll(() => {
    // Final cleanup
    if (fs.existsSync(TEST_DB_FILE)) {
      fs.unlinkSync(TEST_DB_FILE);
    }
    if (fs.existsSync(TEST_DB_FOLDER)) {
        fs.rmSync(TEST_DB_FOLDER, { recursive: true, force: true });
    }
  });

  test("should initialize and create a file if it does not exist", () => {
    expect(fs.existsSync(TEST_DB_FILE)).toBe(true);
    const content = fs.readFileSync(TEST_DB_FILE, "utf-8");
    expect(JSON.parse(content)).toEqual({});
  });

  test("should create a document", async () => {
    const result = await db.transaction(async (tx: Transaction) => {
      return await tx.create({
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
    await db.transaction(async (tx: Transaction) => {
      await tx.create({ data: { name: "Old Name", age: 20 }, collection: "users" });
    });

    const updated = await db.transaction(async (tx: Transaction) => {
      return await tx.update({
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
    await db.transaction(async (tx: Transaction) => {
      await tx.create({ data: { name: "To Delete" }, collection: "users" });
    });

    const deleted = await db.transaction(async (tx: Transaction) => {
      return await tx.destroy({ _id: 1, collection: "users" });
    });

    expect(deleted).toMatchObject({ name: "To Delete", _id: 1 });

    const content = JSON.parse(fs.readFileSync(TEST_DB_FILE, "utf-8"));
    expect(content.users.default).toHaveLength(0);
  });

  test("should find a document", async () => {
    await db.transaction(async (tx: Transaction) => {
      await tx.create({ data: { name: "Find Me", type: "A" }, collection: "items" });
      await tx.create({ data: { name: "Ignore Me", type: "B" }, collection: "items" });
    });

    const found = await db.transaction(async (tx: Transaction) => {
      return await tx.find({
        collection: "items",
        callback: (item: any) => item.name === "Find Me",
      });
    });

    expect(found).toMatchObject({ name: "Find Me" });
  });

  test("should find many documents", async () => {
    await db.transaction(async (tx: Transaction) => {
      await tx.create({ data: { val: 1 }, collection: "nums" });
      await tx.create({ data: { val: 2 }, collection: "nums" });
      await tx.create({ data: { val: 3 }, collection: "nums" });
    });

    const found = await db.transaction(async (tx: Transaction) => {
      return await tx.findMany({
        collection: "nums",
        callback: (item: any) => item.val > 1,
      });
    });

    expect(found).toHaveLength(2);
    expect(found[0].val).toBe(2);
    expect(found[1].val).toBe(3);
  });

  test("should create many documents with dynamic index", async () => {
    const result = await db.transaction(async (tx: Transaction) => {
      return await tx.createMany({
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
     await db.transaction(async (tx: Transaction) => {
      await tx.create({ data: { val: 3 }, collection: "sortme" });
      await tx.create({ data: { val: 1 }, collection: "sortme" });
      await tx.create({ data: { val: 2 }, collection: "sortme" });
    });

    await db.transaction(async (tx: Transaction) => {
        await tx.rewriteCollection({
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
            return db.transaction(async (tx: Transaction) => {
                // Simulate some work
                return new Promise((resolve) => {
                    setTimeout(async () => {
                        await tx.create({
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

        await db.transaction(async (tx: Transaction) => {
            await tx.createMany({
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
        const expensive = await db.transaction(async (tx: Transaction) => {
            return await tx.findMany({
                collection: "products",
                filter: { price: { $gt: 8 } }
            });
        });
        expect(expensive).toHaveLength(2); // Apple, Steak

        // $in
        const fruits = await db.transaction(async (tx: Transaction) => {
            return await tx.findMany({
                collection: "products",
                filter: { category: { $in: ["fruit"] } }
            });
        });
        expect(fruits).toHaveLength(2);

        // $regex
        const startsWithC = await db.transaction(async (tx: Transaction) => {
            return await tx.findMany({
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

        await db.transaction(async (tx: Transaction) => {
            // Create users
            const user1 = await tx.create({ collection: "users", data: { name: "Alice" } });
            const user2 = await tx.create({ collection: "users", data: { name: "Bob" } });

            // Create posts
            await tx.create({ collection: "posts", data: { title: "Post 1", authorId: user1._id } });
            await tx.create({ collection: "posts", data: { title: "Post 2", authorId: user2._id } });
        });

        const posts = await db.transaction(async (tx: Transaction) => {
            return await tx.findMany({
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

        await db.transaction(async (tx: Transaction) => {
            await tx.ensureIndex({ collection: "users", field: "email" });
            
            await tx.createMany({
                collection: "users",
                data: [
                    { name: "Alice", email: "alice@example.com", age: 30 },
                    { name: "Bob", email: "bob@example.com", age: 25 },
                    { name: "Charlie", email: "charlie@example.com", age: 35 }
                ]
            });
        });

        // Find using index (optimization should kick in)
        const alice = await db.transaction(async (tx: Transaction) => {
            return await tx.find({
                collection: "users",
                filter: { email: "alice@example.com" }
            });
        });
        expect(alice).toMatchObject({ name: "Alice" });

        // Update email (should update index)
        await db.transaction(async (tx: Transaction) => {
            await tx.update({
                collection: "users",
                _id: alice._id,
                data: { ...alice, email: "alice_new@example.com" }
            });
        });

        // Find with old email (should fail)
        const oldAlice = await db.transaction(async (tx: Transaction) => {
            return await tx.find({
                collection: "users",
                filter: { email: "alice@example.com" }
            });
        });
        expect(oldAlice).toBeUndefined();

        // Find with new email (should succeed)
        const newAlice = await db.transaction(async (tx: Transaction) => {
            return await tx.find({
                collection: "users",
                filter: { email: "alice_new@example.com" }
            });
        });
        expect(newAlice).toMatchObject({ name: "Alice", email: "alice_new@example.com" });

        // Destroy (should remove from index)
        await db.transaction(async (tx: Transaction) => {
            await tx.destroy({
                collection: "users",
                _id: newAlice._id
            });
        });

        const deletedAlice = await db.transaction(async (tx: Transaction) => {
            return await tx.find({
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

        await db.transaction(async (tx: Transaction) => {
            await tx.create({ collection: "users", data: { name: "Alice" } });
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
        await db.transaction(async (tx: Transaction) => {
            await tx.create({ collection: "users", data: { name: "Bob" } });
        });

        // 2. Re-open DB
        db = new SencilloDB({ file: TEST_DB_FILE, aof: true });
        
        // We need to trigger a load. Transaction does it.
        const user = await db.transaction(async (tx: Transaction) => {
            return await tx.find({ collection: "users", filter: { name: "Bob" } });
        });

        expect(user).toMatchObject({ name: "Bob" });
    });

    test("should compact AOF file", async () => {
        const db = new SencilloDB({ file: TEST_DB_FILE, aof: true });
        await db.transaction(async (tx: Transaction) => {
            await tx.create({ collection: "users", data: { name: "Charlie" } });
        });

        expect(fs.existsSync(AOF_FILE)).toBe(true);

        await db.compact();

        expect(fs.existsSync(AOF_FILE)).toBe(false);
        const jsonContent = JSON.parse(fs.readFileSync(TEST_DB_FILE, "utf-8"));
        expect(jsonContent.users.default).toHaveLength(1);
        expect(jsonContent.users.default[0].name).toBe("Charlie");
    });
});

describe("Folder Persistence (Lazy Loading)", () => {
    beforeEach(() => {
        if (fs.existsSync(TEST_DB_FOLDER)) {
            fs.rmSync(TEST_DB_FOLDER, { recursive: true, force: true });
        }
    });

    afterEach(() => {
        if (fs.existsSync(TEST_DB_FOLDER)) {
            fs.rmSync(TEST_DB_FOLDER, { recursive: true, force: true });
        }
    });

    test("should create folder and collection files", async () => {
        const db = new SencilloDB({ folder: TEST_DB_FOLDER });
        
        await db.transaction(async (tx: Transaction) => {
            await tx.create({ collection: "users", data: { name: "Dave" } });
            await tx.create({ collection: "posts", data: { title: "Hello" } });
        });

        expect(fs.existsSync(TEST_DB_FOLDER)).toBe(true);
        expect(fs.existsSync(path.join(TEST_DB_FOLDER, "users.json"))).toBe(true);
        expect(fs.existsSync(path.join(TEST_DB_FOLDER, "posts.json"))).toBe(true);

        const usersContent = JSON.parse(fs.readFileSync(path.join(TEST_DB_FOLDER, "users.json"), "utf-8"));
        expect(usersContent.default[0].name).toBe("Dave");
    });

    test("should lazy load collections", async () => {
        // 1. Setup data
        const db1 = new SencilloDB({ folder: TEST_DB_FOLDER });
        await db1.transaction(async (tx: Transaction) => {
            await tx.create({ collection: "users", data: { name: "Eve" } });
        });

        // 2. New instance
        const db2 = new SencilloDB({ folder: TEST_DB_FOLDER });
        
        // Should find user (triggers load)
        const user = await db2.transaction(async (tx: Transaction) => {
            return await tx.find({ collection: "users", filter: { name: "Eve" } });
        });
        
        expect(user).toMatchObject({ name: "Eve" });
    });

    test("should only save dirty collections", async () => {
        const db = new SencilloDB({ folder: TEST_DB_FOLDER });
        
        // Create two collections
        await db.transaction(async (tx: Transaction) => {
            await tx.create({ collection: "col1", data: { val: 1 } });
            await tx.create({ collection: "col2", data: { val: 2 } });
        });

        // Get stats of files
        const stat1 = fs.statSync(path.join(TEST_DB_FOLDER, "col1.json"));
        const stat2 = fs.statSync(path.join(TEST_DB_FOLDER, "col2.json"));

        // Wait a bit to ensure mtime changes if written
        await new Promise(r => setTimeout(r, 100));

        // Modify only col1
        await db.transaction(async (tx: Transaction) => {
            await tx.create({ collection: "col1", data: { val: 11 } });
        });

        const newStat1 = fs.statSync(path.join(TEST_DB_FOLDER, "col1.json"));
        const newStat2 = fs.statSync(path.join(TEST_DB_FOLDER, "col2.json"));

        expect(newStat1.mtimeMs).toBeGreaterThan(stat1.mtimeMs);
        expect(newStat2.mtimeMs).toBe(stat2.mtimeMs); // Should not have changed
    });

    test("should drop collection file", async () => {
        const db = new SencilloDB({ folder: TEST_DB_FOLDER });
        await db.transaction(async (tx: Transaction) => {
            await tx.create({ collection: "temp", data: { val: 1 } });
        });

        expect(fs.existsSync(path.join(TEST_DB_FOLDER, "temp.json"))).toBe(true);

        await db.transaction(async (tx: Transaction) => {
            await tx.dropCollection({ collection: "temp" });
        });

        expect(fs.existsSync(path.join(TEST_DB_FOLDER, "temp.json"))).toBe(false);
    });
});

describe("Compression", () => {
    beforeEach(() => {
        if (fs.existsSync(TEST_DB_FILE)) fs.unlinkSync(TEST_DB_FILE);
        if (fs.existsSync(TEST_DB_FOLDER)) fs.rmSync(TEST_DB_FOLDER, { recursive: true, force: true });
    });

    afterEach(() => {
        if (fs.existsSync(TEST_DB_FILE)) fs.unlinkSync(TEST_DB_FILE);
        if (fs.existsSync(TEST_DB_FOLDER)) fs.rmSync(TEST_DB_FOLDER, { recursive: true, force: true });
    });

    test("should compress single file", async () => {
        const db = new SencilloDB({ file: TEST_DB_FILE, compression: true });
        await db.transaction(async (tx: Transaction) => {
            await tx.create({ collection: "users", data: { name: "Alice" } });
        });

        // File should exist and be binary (gzip header check)
        expect(fs.existsSync(TEST_DB_FILE)).toBe(true);
        const buffer = fs.readFileSync(TEST_DB_FILE);
        // Gzip magic number: 1f 8b
        expect(buffer[0]).toBe(0x1f);
        expect(buffer[1]).toBe(0x8b);

        // Reload
        const db2 = new SencilloDB({ file: TEST_DB_FILE, compression: true });
        const user = await db2.transaction(async (tx: Transaction) => {
            return await tx.find({ collection: "users", filter: { name: "Alice" } });
        });
        expect(user).toMatchObject({ name: "Alice" });
    });

    test("should compress folder files", async () => {
        const db = new SencilloDB({ folder: TEST_DB_FOLDER, compression: true });
        await db.transaction(async (tx: Transaction) => {
            await tx.create({ collection: "users", data: { name: "Bob" } });
        });

        const file = path.join(TEST_DB_FOLDER, "users.json.gz");
        expect(fs.existsSync(file)).toBe(true);
        
        const buffer = fs.readFileSync(file);
        expect(buffer[0]).toBe(0x1f);
        expect(buffer[1]).toBe(0x8b);

        // Reload
        const db2 = new SencilloDB({ folder: TEST_DB_FOLDER, compression: true });
        const user = await db2.transaction(async (tx: Transaction) => {
            return await tx.find({ collection: "users", filter: { name: "Bob" } });
        });
        expect(user).toMatchObject({ name: "Bob" });
    });
});

describe("Partitioning (Sharding)", () => {
    beforeEach(() => {
        if (fs.existsSync(TEST_DB_FOLDER)) fs.rmSync(TEST_DB_FOLDER, { recursive: true, force: true });
    });

    afterEach(() => {
        if (fs.existsSync(TEST_DB_FOLDER)) fs.rmSync(TEST_DB_FOLDER, { recursive: true, force: true });
    });

    test("should create shards based on index", async () => {
        const db = new SencilloDB({ folder: TEST_DB_FOLDER, sharding: true });
        await db.transaction(async (tx: Transaction) => {
            await tx.create({ collection: "users", index: "groupA", data: { name: "Alice" } });
            await tx.create({ collection: "users", index: "groupB", data: { name: "Bob" } });
        });

        // Check directory structure
        const colDir = path.join(TEST_DB_FOLDER, "users");
        expect(fs.existsSync(colDir)).toBe(true);
        expect(fs.existsSync(path.join(colDir, "meta.json"))).toBe(true);
        expect(fs.existsSync(path.join(colDir, "shard_groupA.json"))).toBe(true);
        expect(fs.existsSync(path.join(colDir, "shard_groupB.json"))).toBe(true);
    });

    test("should lazy load specific shards", async () => {
        const db = new SencilloDB({ folder: TEST_DB_FOLDER, sharding: true });
        await db.transaction(async (tx: Transaction) => {
            await tx.create({ collection: "users", index: "groupA", data: { name: "Alice" } });
            await tx.create({ collection: "users", index: "groupB", data: { name: "Bob" } });
        });

        const db2 = new SencilloDB({ folder: TEST_DB_FOLDER, sharding: true });
        await db2.transaction(async (tx: Transaction) => {
            // Should only load groupA
            const alice = await tx.find({ collection: "users", index: "groupA", filter: { name: "Alice" } });
            expect(alice).toMatchObject({ name: "Alice" });
            
            // Access internal state to verify lazy load (using any cast to bypass private check for testing)
            // Note: We can't easily check private state in TS without @ts-ignore or public accessor. 
            // We'll rely on functional correctness: if we can find Alice, it loaded.
        });
    });

    test("should scan all shards if no index provided", async () => {
        const db = new SencilloDB({ folder: TEST_DB_FOLDER, sharding: true });
        await db.transaction(async (tx: Transaction) => {
            await tx.create({ collection: "users", index: "groupA", data: { name: "Alice" } });
            await tx.create({ collection: "users", index: "groupB", data: { name: "Bob" } });
        });

        const db2 = new SencilloDB({ folder: TEST_DB_FOLDER, sharding: true });
        const results = await db2.transaction(async (tx: Transaction) => {
            return await tx.findMany({ collection: "users", filter: {} }); // No index, should scan all
        });

        expect(results).toHaveLength(2);
        expect(results.find((u: any) => u.name === "Alice")).toBeDefined();
        expect(results.find((u: any) => u.name === "Bob")).toBeDefined();
    });
    
    test("should work with compression", async () => {
        const db = new SencilloDB({ folder: TEST_DB_FOLDER, sharding: true, compression: true });
        await db.transaction(async (tx: Transaction) => {
            await tx.create({ collection: "users", index: "groupA", data: { name: "Alice" } });
        });

        const colDir = path.join(TEST_DB_FOLDER, "users");
        expect(fs.existsSync(path.join(colDir, "shard_groupA.json.gz"))).toBe(true);
        
        const db2 = new SencilloDB({ folder: TEST_DB_FOLDER, sharding: true, compression: true });
        const alice = await db2.transaction(async (tx: Transaction) => {
            return await tx.find({ collection: "users", index: "groupA", filter: { name: "Alice" } });
        });
        expect(alice).toMatchObject({ name: "Alice" });
    });
});

describe("LRU Cache", () => {
    beforeEach(() => {
        if (fs.existsSync(TEST_DB_FOLDER)) fs.rmSync(TEST_DB_FOLDER, { recursive: true, force: true });
    });

    afterEach(() => {
        if (fs.existsSync(TEST_DB_FOLDER)) fs.rmSync(TEST_DB_FOLDER, { recursive: true, force: true });
    });

    test("should evict least recently used collections", async () => {
        const db = new SencilloDB({ folder: TEST_DB_FOLDER, maxCacheSize: 2 });
        await db.transaction(async (tx: Transaction) => {
            await tx.create({ collection: "col1", data: { name: "1" } });
            await tx.create({ collection: "col2", data: { name: "2" } });
            await tx.create({ collection: "col3", data: { name: "3" } });
        });

        // col1 should be evicted. To verify:
        // 1. Modify col1.json on disk manually.
        // 2. Access col1 via DB.
        // 3. If it reloads the modified version, it was evicted.
        
        const col1File = path.join(TEST_DB_FOLDER, "col1.json");
        expect(fs.existsSync(col1File)).toBe(true);
        
        const data = JSON.parse(fs.readFileSync(col1File, "utf-8"));
        data.default[0].name = "MODIFIED";
        fs.writeFileSync(col1File, JSON.stringify(data));

        await db.transaction(async (tx: Transaction) => {
             const doc = await tx.find({ collection: "col1", filter: {} });
             expect(doc.name).toBe("MODIFIED");
        });
    });

    test("should save dirty collection before eviction", async () => {
        const db = new SencilloDB({ folder: TEST_DB_FOLDER, maxCacheSize: 1 });
        await db.transaction(async (tx: Transaction) => {
            await tx.create({ collection: "col1", data: { name: "1" } });
        });
        
        // col1 is dirty and in memory.
        // Now create col2. This should evict col1.
        await db.transaction(async (tx: Transaction) => {
            await tx.create({ collection: "col2", data: { name: "2" } });
        });

        // Verify col1 was saved to disk
        const col1File = path.join(TEST_DB_FOLDER, "col1.json");
        expect(fs.existsSync(col1File)).toBe(true);
        const col1Data = JSON.parse(fs.readFileSync(col1File, "utf-8"));
        expect(col1Data.default[0].name).toBe("1");
    });

    test("should work with sharding", async () => {
        const db = new SencilloDB({ folder: TEST_DB_FOLDER, sharding: true, maxCacheSize: 2 });
        await db.transaction(async (tx: Transaction) => {
            await tx.create({ collection: "users", index: "A", data: { name: "A" } });
            await tx.create({ collection: "users", index: "B", data: { name: "B" } });
            await tx.create({ collection: "users", index: "C", data: { name: "C" } });
        });

        // users::A should be evicted. Verify by modifying disk.
        const shardAFile = path.join(TEST_DB_FOLDER, "users", "shard_A.json");
        expect(fs.existsSync(shardAFile)).toBe(true);

        const data = JSON.parse(fs.readFileSync(shardAFile, "utf-8"));
        data[0].name = "MODIFIED_SHARD";
        fs.writeFileSync(shardAFile, JSON.stringify(data));

        await db.transaction(async (tx: Transaction) => {
            const doc = await tx.find({ collection: "users", index: "A", filter: {} });
            expect(doc.name).toBe("MODIFIED_SHARD");
        });
    });
});
