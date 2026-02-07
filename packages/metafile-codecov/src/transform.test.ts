import { describe, expect, test } from "bun:test";
import type { Metafile } from "./types";
import { transformMetafile } from "./transform";

const SIMPLE_METAFILE: Metafile = {
	inputs: {
		"src/index.ts": {
			bytes: 150,
			imports: [{ path: "src/utils.ts", kind: "import-statement" }],
			format: "esm",
		},
		"src/utils.ts": {
			bytes: 80,
			imports: [],
			format: "esm",
		},
	},
	outputs: {
		"dist/index.js": {
			bytes: 5000,
			inputs: {
				"src/index.ts": { bytesInOutput: 120 },
				"src/utils.ts": { bytesInOutput: 60 },
			},
			imports: [],
			exports: ["default"],
			entryPoint: "src/index.ts",
		},
	},
};

const MULTI_OUTPUT_METAFILE: Metafile = {
	inputs: {
		"src/main.tsx": {
			bytes: 200,
			imports: [{ path: "src/lazy.tsx", kind: "dynamic-import" }],
			format: "esm",
		},
		"src/lazy.tsx": {
			bytes: 100,
			imports: [],
			format: "esm",
		},
		"node_modules/react/index.js": {
			bytes: 50000,
			imports: [],
		},
	},
	outputs: {
		"dist/main-abc12345.js": {
			bytes: 45000,
			inputs: {
				"src/main.tsx": { bytesInOutput: 180 },
				"node_modules/react/index.js": { bytesInOutput: 44000 },
			},
			imports: [{ path: "dist/lazy-def67890.js", kind: "dynamic-import" }],
			exports: [],
			entryPoint: "src/main.tsx",
		},
		"dist/lazy-def67890.js": {
			bytes: 800,
			inputs: {
				"src/lazy.tsx": { bytesInOutput: 750 },
			},
			imports: [],
			exports: ["default"],
		},
		"dist/main-abc12345.js.map": {
			bytes: 10000,
			inputs: {},
			imports: [],
			exports: [],
		},
	},
};

describe("transformMetafile", () => {
	test("sets version to 3", () => {
		const result = transformMetafile(SIMPLE_METAFILE, { bundleName: "test" });
		expect(result.version).toBe("3");
	});

	test("sets bundleName from options", () => {
		const result = transformMetafile(SIMPLE_METAFILE, { bundleName: "my-app" });
		expect(result.bundleName).toBe("my-app");
	});

	test("sets plugin info", () => {
		const result = transformMetafile(SIMPLE_METAFILE, { bundleName: "test" });
		expect(result.plugin.name).toBe("metafile-codecov-bundle");
		expect(result.plugin.version).toBeString();
	});

	test("passes bundler info through", () => {
		const result = transformMetafile(SIMPLE_METAFILE, {
			bundleName: "test",
			bundler: { name: "bun", version: "1.2.0" },
		});
		expect(result.bundler).toEqual({ name: "bun", version: "1.2.0" });
	});

	test("sets builtAt from options or defaults to now", () => {
		const result = transformMetafile(SIMPLE_METAFILE, {
			bundleName: "test",
			builtAt: 1700000000000,
		});
		expect(result.builtAt).toBe(1700000000000);

		const result2 = transformMetafile(SIMPLE_METAFILE, { bundleName: "test" });
		expect(result2.builtAt).toBeNumber();
		expect(Math.abs(result2.builtAt! - Date.now())).toBeLessThan(1000);
	});

	test("creates assets from outputs", () => {
		const result = transformMetafile(SIMPLE_METAFILE, { bundleName: "test" });
		expect(result.assets).toHaveLength(1);
		expect(result.assets[0].name).toBe("dist/index.js");
		expect(result.assets[0].size).toBe(5000);
		expect(result.assets[0].normalized).toBe("dist/index.js");
	});

	test("normalizes asset names with hashes", () => {
		const result = transformMetafile(MULTI_OUTPUT_METAFILE, {
			bundleName: "test",
		});
		const mainAsset = result.assets.find((a) => a.name === "dist/main-abc12345.js");
		expect(mainAsset).toBeDefined();
		expect(mainAsset!.normalized).toBe("dist/main-*.js");
	});

	test("skips source map files in assets and chunks", () => {
		const result = transformMetafile(MULTI_OUTPUT_METAFILE, {
			bundleName: "test",
		});
		expect(result.assets.some((a) => a.name.endsWith(".map"))).toBe(false);
		expect(result.chunks.some((c) => c.id.endsWith(".map"))).toBe(false);
	});

	test("creates chunks from outputs", () => {
		const result = transformMetafile(SIMPLE_METAFILE, { bundleName: "test" });
		expect(result.chunks).toHaveLength(1);
		expect(result.chunks[0].id).toBe("dist/index.js");
		expect(result.chunks[0].entry).toBe(true);
		expect(result.chunks[0].initial).toBe(true);
		expect(result.chunks[0].files).toEqual(["dist/index.js"]);
		expect(result.chunks[0].names).toEqual(["index"]);
	});

	test("detects entry vs non-entry chunks", () => {
		const result = transformMetafile(MULTI_OUTPUT_METAFILE, {
			bundleName: "test",
		});
		const mainChunk = result.chunks.find((c) => c.id === "dist/main-abc12345.js");
		const lazyChunk = result.chunks.find((c) => c.id === "dist/lazy-def67890.js");

		expect(mainChunk!.entry).toBe(true);
		expect(mainChunk!.initial).toBe(true);
		expect(lazyChunk!.entry).toBe(false);
		expect(lazyChunk!.initial).toBe(false);
	});

	test("collects dynamic imports", () => {
		const result = transformMetafile(MULTI_OUTPUT_METAFILE, {
			bundleName: "test",
		});
		const mainChunk = result.chunks.find((c) => c.id === "dist/main-abc12345.js");
		expect(mainChunk!.dynamicImports).toEqual(["dist/lazy-def67890.js"]);
	});

	test("assigns uniqueId as counter-id format", () => {
		const result = transformMetafile(MULTI_OUTPUT_METAFILE, {
			bundleName: "test",
		});
		expect(result.chunks[0].uniqueId).toBe("0-dist/main-abc12345.js");
		expect(result.chunks[1].uniqueId).toBe("1-dist/lazy-def67890.js");
	});

	test("creates modules from inputs", () => {
		const result = transformMetafile(SIMPLE_METAFILE, { bundleName: "test" });
		expect(result.modules).toHaveLength(2);

		const indexModule = result.modules.find((m) => m.name === "src/index.ts");
		expect(indexModule).toBeDefined();
		expect(indexModule!.size).toBe(150);
	});

	test("links modules to chunks via chunkUniqueIds", () => {
		const result = transformMetafile(SIMPLE_METAFILE, { bundleName: "test" });
		const indexModule = result.modules.find((m) => m.name === "src/index.ts");
		expect(indexModule!.chunkUniqueIds).toEqual(["0-dist/index.js"]);
	});

	test("modules appear in multiple chunks when shared", () => {
		// react appears only in main chunk, lazy module only in lazy chunk
		const result = transformMetafile(MULTI_OUTPUT_METAFILE, {
			bundleName: "test",
		});
		const reactModule = result.modules.find((m) => m.name === "node_modules/react/index.js");
		expect(reactModule!.chunkUniqueIds).toHaveLength(1);

		const lazyModule = result.modules.find((m) => m.name === "src/lazy.tsx");
		expect(lazyModule!.chunkUniqueIds).toHaveLength(1);
		expect(lazyModule!.chunkUniqueIds[0]).toContain("dist/lazy-def67890.js");
	});

	test("handles empty metafile", () => {
		const empty: Metafile = { inputs: {}, outputs: {} };
		const result = transformMetafile(empty, { bundleName: "empty" });
		expect(result.assets).toHaveLength(0);
		expect(result.chunks).toHaveLength(0);
		expect(result.modules).toHaveLength(0);
	});

	test("gzipSize is null when outputDir is not provided", () => {
		const result = transformMetafile(SIMPLE_METAFILE, { bundleName: "test" });
		expect(result.assets[0].gzipSize).toBeNull();
	});
});
