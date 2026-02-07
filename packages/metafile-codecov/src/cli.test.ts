import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Metafile } from "./types";
import { parseCliArgs, run } from "./cli";

const FIXTURE: Metafile = {
	inputs: {
		"src/index.ts": {
			bytes: 100,
			imports: [],
			format: "esm",
		},
	},
	outputs: {
		"dist/index.js": {
			bytes: 2000,
			inputs: { "src/index.ts": { bytesInOutput: 90 } },
			imports: [],
			exports: ["default"],
			entryPoint: "src/index.ts",
		},
	},
};

const writeFixture = (): string => {
	const dir = mkdtempSync(join(tmpdir(), "metafile-codecov-test-"));
	const path = join(dir, "metafile.json");
	writeFileSync(path, JSON.stringify(FIXTURE));
	return path;
};

describe("parseCliArgs", () => {
	test("parses required flags", () => {
		const result = parseCliArgs(["--metafile", "meta.json", "--bundle-name", "test"]);
		expect(result.metafile).toBe("meta.json");
		expect(result.bundleName).toBe("test");
	});

	test("parses short flags", () => {
		const result = parseCliArgs(["-f", "meta.json", "-n", "test"]);
		expect(result.metafile).toBe("meta.json");
		expect(result.bundleName).toBe("test");
	});

	test("parses optional flags", () => {
		const result = parseCliArgs([
			"-f",
			"meta.json",
			"-n",
			"test",
			"--output-dir",
			"dist",
			"--bundler-name",
			"esbuild",
			"--bundler-version",
			"0.20.0",
			"-o",
			"out.json",
		]);
		expect(result.outputDir).toBe("dist");
		expect(result.bundlerName).toBe("esbuild");
		expect(result.bundlerVersion).toBe("0.20.0");
		expect(result.output).toBe("out.json");
	});

	test("defaults bundlerName to bun", () => {
		const result = parseCliArgs(["-f", "meta.json", "-n", "test"]);
		expect(result.bundlerName).toBe("bun");
	});

	test("defaults upload to false", () => {
		const result = parseCliArgs(["-f", "meta.json", "-n", "test"]);
		expect(result.upload).toBe(false);
	});

	test("parses --upload flag", () => {
		const result = parseCliArgs(["-f", "meta.json", "-n", "test", "--upload"]);
		expect(result.upload).toBe(true);
	});
});

describe("run", () => {
	test("produces valid Codecov JSON", () => {
		const metafilePath = writeFixture();
		const result = run(["-f", metafilePath, "-n", "my-app"]);
		const payload = JSON.parse(result.json);

		expect(payload.version).toBe("3");
		expect(payload.bundleName).toBe("my-app");
		expect(payload.assets).toHaveLength(1);
		expect(payload.chunks).toHaveLength(1);
		expect(payload.modules).toHaveLength(1);
		expect(payload.plugin.name).toBe("metafile-codecov-bundle");
	});

	test("includes bundler info when version is provided", () => {
		const metafilePath = writeFixture();
		const result = run(["-f", metafilePath, "-n", "test", "--bundler-version", "1.2.0"]);
		const payload = JSON.parse(result.json);

		expect(payload.bundler).toEqual({ name: "bun", version: "1.2.0" });
	});

	test("omits bundler info when version is not provided", () => {
		const metafilePath = writeFixture();
		const result = run(["-f", metafilePath, "-n", "test"]);
		const payload = JSON.parse(result.json);

		expect(payload.bundler).toBeUndefined();
	});

	test("returns output path when -o is provided", () => {
		const metafilePath = writeFixture();
		const result = run(["-f", metafilePath, "-n", "test", "-o", "out.json"]);
		expect(result.output).toBe("out.json");
	});

	test("returns upload false by default", () => {
		const metafilePath = writeFixture();
		const result = run(["-f", metafilePath, "-n", "test"]);
		expect(result.upload).toBe(false);
	});

	test("returns upload true when --upload is passed", () => {
		const metafilePath = writeFixture();
		const result = run(["-f", metafilePath, "-n", "test", "--upload"]);
		expect(result.upload).toBe(true);
	});
});
