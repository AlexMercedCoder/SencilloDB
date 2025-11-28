import bfj from "bfj";
import fs from "fs";
import zlib from "zlib";

const testFile = "test_compression.json.gz";
const data = { hello: "world" };

async function test() {
    try {
        // Test Write
        const outStream = fs.createWriteStream(testFile);
        const gzip = zlib.createGzip();
        outStream.on("error", console.error);
        gzip.pipe(outStream);
        
        // bfj.streamify returns a stream
        const bfjStream = bfj.streamify(data);
        bfjStream.pipe(gzip);
        
        await new Promise(fulfill => outStream.on("finish", fulfill));
        console.log("Write done");

        // Test Read
        const inStream = fs.createReadStream(testFile);
        const gunzip = zlib.createGunzip();
        inStream.pipe(gunzip);

        const result = await bfj.parse(gunzip);
        console.log("Read result:", result);

    } catch (e) {
        console.error(e);
    } finally {
        if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    }
}

test();
