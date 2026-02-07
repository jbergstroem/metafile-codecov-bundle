import { describe, expect, test } from "bun:test";
import { getGzipSize } from "./compress";

describe("getGzipSize", () => {
	test("returns a number for compressible file types", () => {
		const content = new TextEncoder().encode("console.log('hello world');");
		const result = getGzipSize("bundle.js", content);
		expect(result).toBeNumber();
		expect(result).toBeGreaterThan(0);
	});

	test("compressed size is less than original for non-trivial input", () => {
		const code = "export const x = 1;\n".repeat(100);
		const content = new TextEncoder().encode(code);
		const result = getGzipSize("app.js", content);
		expect(result).toBeNumber();
		expect(result!).toBeLessThan(content.byteLength);
	});

	test("returns null for non-compressible file types", () => {
		const content = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
		expect(getGzipSize("image.png", content)).toBeNull();
		expect(getGzipSize("font.woff2", content)).toBeNull();
		expect(getGzipSize("archive.zip", content)).toBeNull();
	});

	test("handles all compressible extensions", () => {
		const content = new TextEncoder().encode("test");
		for (const ext of [".css", ".html", ".json", ".js", ".mjs", ".svg", ".txt", ".xml", ".xhtml"]) {
			expect(getGzipSize(`file${ext}`, content)).toBeNumber();
		}
	});

	test("handles empty content", () => {
		const content = new Uint8Array(0);
		const result = getGzipSize("empty.js", content);
		expect(result).toBeNumber();
		expect(result).toBeGreaterThan(0); // gzip header overhead
	});
});
