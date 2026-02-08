import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Metafile } from "./types";
import { parseCliArgs, run, runUpload } from "./cli";

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

// Sentinel error thrown by our process.exit spy so we can catch the exit
// without actually terminating the test runner.
class ExitCalled extends Error {
	code: number;
	constructor(code: number) {
		super(`process.exit(${code})`);
		this.code = code;
	}
}

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

	test("exits with 0 and prints help for --help", () => {
		const exitSpy = spyOn(process, "exit").mockImplementation((code) => {
			throw new ExitCalled(typeof code === "number" ? code : 0);
		});
		const logSpy = spyOn(console, "log").mockImplementation(() => {});
		try {
			parseCliArgs(["--help"]);
		} catch (e) {
			expect(e).toBeInstanceOf(ExitCalled);
			expect((e as ExitCalled).code).toBe(0);
		}
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Usage: metafile-codecov"));
		exitSpy.mockRestore();
		logSpy.mockRestore();
	});

	test("exits with 0 and prints help for -h", () => {
		const exitSpy = spyOn(process, "exit").mockImplementation((code) => {
			throw new ExitCalled(typeof code === "number" ? code : 0);
		});
		const logSpy = spyOn(console, "log").mockImplementation(() => {});
		try {
			parseCliArgs(["-h"]);
		} catch (e) {
			expect(e).toBeInstanceOf(ExitCalled);
			expect((e as ExitCalled).code).toBe(0);
		}
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Usage: metafile-codecov"));
		exitSpy.mockRestore();
		logSpy.mockRestore();
	});

	test("exits with 0 and prints version for --version", () => {
		const exitSpy = spyOn(process, "exit").mockImplementation((code) => {
			throw new ExitCalled(typeof code === "number" ? code : 0);
		});
		const logSpy = spyOn(console, "log").mockImplementation(() => {});
		try {
			parseCliArgs(["--version"]);
		} catch (e) {
			expect(e).toBeInstanceOf(ExitCalled);
			expect((e as ExitCalled).code).toBe(0);
		}
		expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/^\d+\.\d+\.\d+/));
		exitSpy.mockRestore();
		logSpy.mockRestore();
	});

	test("exits with 1 when --metafile is missing", () => {
		const exitSpy = spyOn(process, "exit").mockImplementation((code) => {
			throw new ExitCalled(typeof code === "number" ? code : 0);
		});
		const errorSpy = spyOn(console, "error").mockImplementation(() => {});
		try {
			parseCliArgs(["--bundle-name", "test"]);
		} catch (e) {
			expect(e).toBeInstanceOf(ExitCalled);
			expect((e as ExitCalled).code).toBe(1);
		}
		expect(errorSpy).toHaveBeenCalledWith("Error: --metafile is required");
		exitSpy.mockRestore();
		errorSpy.mockRestore();
	});

	test("exits with 1 when --bundle-name is missing", () => {
		const exitSpy = spyOn(process, "exit").mockImplementation((code) => {
			throw new ExitCalled(typeof code === "number" ? code : 0);
		});
		const errorSpy = spyOn(console, "error").mockImplementation(() => {});
		try {
			parseCliArgs(["--metafile", "meta.json"]);
		} catch (e) {
			expect(e).toBeInstanceOf(ExitCalled);
			expect((e as ExitCalled).code).toBe(1);
		}
		expect(errorSpy).toHaveBeenCalledWith("Error: --bundle-name is required");
		exitSpy.mockRestore();
		errorSpy.mockRestore();
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

describe("runUpload", () => {
	const PRESIGNED_URL = "https://storage.example.com/upload/presigned-abc";

	const savedEnv: Record<string, string | undefined> = {};
	const ghEnvVars = [
		"GITHUB_ACTIONS",
		"GITHUB_REPOSITORY",
		"GITHUB_SHA",
		"GITHUB_REF",
		"GITHUB_REF_NAME",
		"GITHUB_RUN_ID",
		"GITHUB_SERVER_URL",
		"GITHUB_JOB",
		"GITHUB_HEAD_REF",
		"ACTIONS_ID_TOKEN_REQUEST_URL",
		"ACTIONS_ID_TOKEN_REQUEST_TOKEN",
		"ACTIONS_RUNTIME_TOKEN",
	];

	beforeEach(() => {
		for (const key of ghEnvVars) {
			savedEnv[key] = process.env[key];
		}
	});

	afterEach(() => {
		for (const key of ghEnvVars) {
			if (savedEnv[key] === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = savedEnv[key];
			}
		}
	});

	const setGitHubEnv = () => {
		process.env.GITHUB_ACTIONS = "true";
		process.env.GITHUB_REPOSITORY = "owner/repo";
		process.env.GITHUB_SHA = "abc123";
		process.env.GITHUB_REF = "refs/heads/main";
		process.env.GITHUB_REF_NAME = "main";
		process.env.GITHUB_RUN_ID = "99999";
		process.env.GITHUB_SERVER_URL = "https://github.com";
		process.env.GITHUB_JOB = "build";
		process.env.ACTIONS_ID_TOKEN_REQUEST_URL =
			"https://token.actions.githubusercontent.com/id?api-version=1";
		process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = "runtime-token";
	};

	const makeFetcher = (responses: Array<{ status: number; body: string }>) => {
		let callIndex = 0;
		return ((_url: string | URL | Request, _init?: RequestInit) => {
			const entry = responses[callIndex++];
			return Promise.resolve(new Response(entry.body, { status: entry.status }));
		}) as typeof globalThis.fetch;
	};

	test("throws when not running in GitHub Actions", async () => {
		delete process.env.GITHUB_ACTIONS;
		await expect(runUpload("{}")).rejects.toThrow("--upload is only supported in GitHub Actions");
	});

	test("completes successfully with valid environment", async () => {
		setGitHubEnv();
		const errorSpy = spyOn(console, "error").mockImplementation(() => {});

		const fetcher = makeFetcher([
			// OIDC token fetch
			{ status: 200, body: JSON.stringify({ value: "fake-jwt" }) },
			// Presigned URL request
			{ status: 200, body: JSON.stringify({ url: PRESIGNED_URL }) },
			// PUT payload
			{ status: 200, body: "" },
		]);

		await runUpload('{"version":"3"}', fetcher);

		expect(errorSpy).toHaveBeenCalledWith("Upload successful");
		errorSpy.mockRestore();
	});

	test("throws when upload fails", async () => {
		setGitHubEnv();
		const errorSpy = spyOn(console, "error").mockImplementation(() => {});

		const fetcher = makeFetcher([
			// OIDC token fetch
			{ status: 200, body: JSON.stringify({ value: "fake-jwt" }) },
			// Presigned URL request fails
			{ status: 403, body: "Forbidden" },
			{ status: 403, body: "Forbidden" },
			{ status: 403, body: "Forbidden" },
		]);

		await expect(runUpload("{}", fetcher)).rejects.toThrow("Upload failed:");
		errorSpy.mockRestore();
	});

	test("throws when OIDC token fetch fails", async () => {
		setGitHubEnv();
		const errorSpy = spyOn(console, "error").mockImplementation(() => {});

		const fetcher = makeFetcher([{ status: 403, body: "Forbidden" }]);

		await expect(runUpload("{}", fetcher)).rejects.toThrow("OIDC token request failed");
		errorSpy.mockRestore();
	});
});
