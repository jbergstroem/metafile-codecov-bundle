import type { OutputPayload } from "metafile-codecov-bundle";
import { transformMetafile } from "metafile-codecov-bundle";
import { readFileSync } from "node:fs";

interface VerifyOptions {
	bundleName: string;
	bundler: { name: string; version: string };
	/** Module name substring that must exist in the output (e.g. "react", "lodash") */
	expectedModule: string;
}

function assert(condition: boolean, message: string): void {
	if (!condition) {
		console.error(`FAIL: ${message}`);
		process.exit(1);
	}
}

/** Run E2E verification: read metafile, transform, and validate the output. */
export function verify({ bundleName, bundler, expectedModule }: VerifyOptions): void {
	const raw = readFileSync("metafile.json", "utf-8");
	const metafile = JSON.parse(raw);

	const payload: OutputPayload = transformMetafile(metafile, {
		bundleName,
		outputDir: "dist",
		bundler,
	});

	assert(payload.version === "3", "version should be '3'");
	assert(payload.bundleName === bundleName, `bundleName should be '${bundleName}'`);
	assert(payload.bundler?.name === bundler.name, `bundler name should be '${bundler.name}'`);
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
			`asset name should be non-empty string: ${asset.name}`,
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

	// Validate chunk structure
	for (const chunk of payload.chunks) {
		assert(typeof chunk.id === "string", "chunk id should be a string");
		assert(typeof chunk.uniqueId === "string", "chunk uniqueId should be a string");
		assert(typeof chunk.entry === "boolean", "chunk entry should be a boolean");
		assert(Array.isArray(chunk.files), "chunk files should be an array");
		assert(chunk.files.length > 0, "chunk should have at least one file");
	}

	// Validate module structure
	for (const mod of payload.modules) {
		assert(typeof mod.name === "string", "module name should be a string");
		assert(Array.isArray(mod.chunkUniqueIds), "module chunkUniqueIds should be an array");
	}

	// Validate entry chunk exists
	const entryChunk = payload.chunks.find((c) => c.entry);
	assert(entryChunk !== undefined, "should have at least one entry chunk");

	// Validate expected module exists
	const foundModule = payload.modules.find((m) => m.name.includes(expectedModule));
	assert(foundModule !== undefined, `should have a ${expectedModule} module`);

	console.log("E2E verification passed!");
	console.log(`  Assets: ${payload.assets.length}`);
	console.log(`  Chunks: ${payload.chunks.length}`);
	console.log(`  Modules: ${payload.modules.length}`);
	console.log(`  Entry chunks: ${payload.chunks.filter((c) => c.entry).length}`);
}
