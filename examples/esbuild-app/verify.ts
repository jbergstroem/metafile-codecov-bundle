import type { OutputPayload } from "metafile-codecov-bundle";
// E2E verification: builds the esbuild app, transforms its metafile,
// and validates the output matches the Codecov bundle analysis schema.
import { transformMetafile } from "metafile-codecov-bundle";
import { readFileSync } from "node:fs";

const raw = readFileSync("metafile.json", "utf-8");
const metafile = JSON.parse(raw);

const payload: OutputPayload = transformMetafile(metafile, {
	bundleName: "esbuild-app",
	outputDir: "dist",
	bundler: { name: "esbuild", version: "0.24.0" },
});

const assert = (condition: boolean, message: string) => {
	if (!condition) {
		console.error(`FAIL: ${message}`);
		process.exit(1);
	}
};

assert(payload.version === "3", "version should be '3'");
assert(payload.bundleName === "esbuild-app", "bundleName should be 'esbuild-app'");
assert(payload.bundler?.name === "esbuild", "bundler name should be 'esbuild'");
assert(
	payload.plugin.name === "metafile-codecov-bundle",
	"plugin name should be 'metafile-codecov-bundle'",
);
assert(Array.isArray(payload.assets), "assets should be an array");
assert(payload.assets.length > 0, "should have at least one asset");
assert(Array.isArray(payload.chunks), "chunks should be an array");
assert(payload.chunks.length > 0, "should have at least one chunk");
assert(Array.isArray(payload.modules), "modules should be an array");
assert(payload.modules.length > 0, "should have at least one module");

// Validate asset structure
for (const asset of payload.assets) {
	assert(
		typeof asset.name === "string" && asset.name.length > 0,
		`asset name should be non-empty: ${asset.name}`,
	);
	assert(
		typeof asset.size === "number" && asset.size > 0,
		`asset size should be positive: ${asset.name}`,
	);
	assert(
		typeof asset.normalized === "string",
		`asset normalized should be a string: ${asset.name}`,
	);
	if (asset.name.endsWith(".js")) {
		assert(
			typeof asset.gzipSize === "number" && asset.gzipSize > 0,
			`JS asset should have gzipSize: ${asset.name}`,
		);
		assert(asset.gzipSize! < asset.size, `gzipSize should be less than size: ${asset.name}`);
	}
}

// Validate entry chunk exists
const entryChunk = payload.chunks.find((c) => c.entry);
assert(entryChunk !== undefined, "should have at least one entry chunk");

// Validate lodash module exists
const lodashModule = payload.modules.find((m) => m.name.includes("lodash"));
assert(lodashModule !== undefined, "should have a lodash module");

console.log("E2E verification passed!");
console.log(`  Assets: ${payload.assets.length}`);
console.log(`  Chunks: ${payload.chunks.length}`);
console.log(`  Modules: ${payload.modules.length}`);
console.log(`  Entry chunks: ${payload.chunks.filter((c) => c.entry).length}`);
