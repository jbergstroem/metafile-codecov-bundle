import { describe, expect, test } from "bun:test";
import { normalizeAssetName } from "./normalize";

describe("normalizeAssetName", () => {
	test("strips dash-delimited hashes", () => {
		expect(normalizeAssetName("main-2c458a0c.js")).toBe("main-*.js");
	});

	test("strips dot-delimited hashes", () => {
		expect(normalizeAssetName("index.abc12345.css")).toBe("index.*.css");
	});

	test("strips long hashes", () => {
		expect(normalizeAssetName("vendor-abcdef0123456789.js")).toBe("vendor-*.js");
	});

	test("preserves names without hashes", () => {
		expect(normalizeAssetName("style.css")).toBe("style.css");
	});

	test("preserves directory paths", () => {
		expect(normalizeAssetName("dist/assets/main-abc123ef.js")).toBe("dist/assets/main-*.js");
	});

	test("handles chunk naming patterns", () => {
		expect(normalizeAssetName("chunk-ABCD1234.js")).toBe("chunk-*.js");
	});

	test("handles names with only hash as basename segment", () => {
		expect(normalizeAssetName("abcdef0123456789.js")).toBe("*.js");
	});

	test("does not strip short hex sequences", () => {
		expect(normalizeAssetName("main-abc.js")).toBe("main-abc.js");
	});
});
