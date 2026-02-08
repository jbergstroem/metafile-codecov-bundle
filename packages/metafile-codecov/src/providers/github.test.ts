import { describe, expect, test } from "bun:test";
import {
	encodeSlug,
	extractBranch,
	extractPrNumber,
	fetchOidcToken,
	getServiceParams,
	isGitHubActions,
} from "./github";

describe("encodeSlug", () => {
	test("encodes owner/repo format", () => {
		expect(encodeSlug("jbergstroem/metafile-codecov-bundle")).toBe(
			"jbergstroem:::metafile-codecov-bundle::::",
		);
	});

	test("handles org names with hyphens", () => {
		expect(encodeSlug("my-org/my-repo")).toBe("my-org:::my-repo::::");
	});

	test("handles slug without slash", () => {
		expect(encodeSlug("monorepo")).toBe("monorepo::::");
	});
});

describe("isGitHubActions", () => {
	test("returns true when GITHUB_ACTIONS is 'true'", () => {
		expect(isGitHubActions({ GITHUB_ACTIONS: "true" })).toBe(true);
	});

	test("returns false when GITHUB_ACTIONS is absent", () => {
		expect(isGitHubActions({})).toBe(false);
	});

	test("returns false when GITHUB_ACTIONS is 'false'", () => {
		expect(isGitHubActions({ GITHUB_ACTIONS: "false" })).toBe(false);
	});
});

describe("extractPrNumber", () => {
	test("extracts PR number from refs/pull/N/merge", () => {
		expect(extractPrNumber("refs/pull/42/merge")).toBe("42");
	});

	test("returns empty string for branch refs", () => {
		expect(extractPrNumber("refs/heads/main")).toBe("");
	});

	test("returns empty string for tag refs", () => {
		expect(extractPrNumber("refs/tags/v1.0.0")).toBe("");
	});

	test("extracts large PR numbers", () => {
		expect(extractPrNumber("refs/pull/12345/merge")).toBe("12345");
	});
});

describe("extractBranch", () => {
	test("uses GITHUB_HEAD_REF for pull request events", () => {
		expect(extractBranch({ GITHUB_HEAD_REF: "feature-branch", GITHUB_REF_NAME: "42/merge" })).toBe(
			"feature-branch",
		);
	});

	test("uses GITHUB_REF_NAME for push events", () => {
		expect(extractBranch({ GITHUB_REF_NAME: "main" })).toBe("main");
	});

	test("falls back to GITHUB_REF_NAME when GITHUB_HEAD_REF is empty", () => {
		expect(extractBranch({ GITHUB_HEAD_REF: "", GITHUB_REF_NAME: "main" })).toBe("main");
	});

	test("returns empty string when neither is set", () => {
		expect(extractBranch({})).toBe("");
	});
});

describe("getServiceParams", () => {
	const baseEnv = {
		GITHUB_REPOSITORY: "owner/repo",
		GITHUB_SHA: "abc123def456",
		GITHUB_REF: "refs/heads/main",
		GITHUB_REF_NAME: "main",
		GITHUB_RUN_ID: "98765",
		GITHUB_SERVER_URL: "https://github.com",
		GITHUB_JOB: "build",
	};

	test("constructs params from full env", () => {
		const params = getServiceParams(baseEnv);
		expect(params.service).toBe("github-actions");
		expect(params.commit).toBe("abc123def456");
		expect(params.branch).toBe("main");
		expect(params.build).toBe("98765");
		expect(params.job).toBe("build");
	});

	test("encodes slug correctly", () => {
		const params = getServiceParams(baseEnv);
		expect(params.slug).toBe("owner:::repo::::");
	});

	test("constructs buildURL from server URL and repository", () => {
		const params = getServiceParams(baseEnv);
		expect(params.buildURL).toBe("https://github.com/owner/repo/actions/runs/98765");
	});

	test("sets pr from GITHUB_REF for PR events", () => {
		const prEnv = Object.assign({}, baseEnv, { GITHUB_REF: "refs/pull/42/merge" });
		const params = getServiceParams(prEnv);
		expect(params.pr).toBe("42");
	});

	test("sets pr to empty string for push events", () => {
		const params = getServiceParams(baseEnv);
		expect(params.pr).toBe("");
	});

	test("throws when GITHUB_REPOSITORY is missing", () => {
		expect(() => getServiceParams({ GITHUB_SHA: "abc" })).toThrow("GITHUB_REPOSITORY is not set");
	});

	test("throws when GITHUB_SHA is missing", () => {
		expect(() => getServiceParams({ GITHUB_REPOSITORY: "owner/repo" })).toThrow(
			"GITHUB_SHA is not set",
		);
	});
});

describe("fetchOidcToken", () => {
	const oidcEnv = {
		ACTIONS_ID_TOKEN_REQUEST_URL: "https://token.actions.githubusercontent.com/id?api-version=1",
		ACTIONS_ID_TOKEN_REQUEST_TOKEN: "runtime-bearer-token",
	};

	test("fetches token with correct URL and headers", async () => {
		let capturedUrl = "";
		let capturedInit: RequestInit | undefined;

		const fakeFetcher = ((url: string | URL | Request, init?: RequestInit) => {
			capturedUrl = url instanceof Request ? url.url : url.toString();
			capturedInit = init;
			return Promise.resolve(new Response(JSON.stringify({ value: "fake-jwt-token" })));
		}) as typeof globalThis.fetch;

		const token = await fetchOidcToken(oidcEnv, fakeFetcher);

		expect(token).toBe("fake-jwt-token");
		expect(capturedUrl).toBe(
			"https://token.actions.githubusercontent.com/id?api-version=1&audience=https://codecov.io",
		);
		const headers = capturedInit!.headers as Record<string, string>;
		expect(headers.Authorization).toBe("Bearer runtime-bearer-token");
	});

	test("throws when ACTIONS_ID_TOKEN_REQUEST_URL is missing", async () => {
		const fakeFetcher = ((_url: string | URL | Request, _init?: RequestInit) =>
			Promise.resolve(new Response("{}"))) as typeof globalThis.fetch;
		await expect(fetchOidcToken({}, fakeFetcher)).rejects.toThrow(
			"ACTIONS_ID_TOKEN_REQUEST_URL is not set",
		);
	});

	test("throws when ACTIONS_ID_TOKEN_REQUEST_TOKEN is missing", async () => {
		const fakeFetcher = ((_url: string | URL | Request, _init?: RequestInit) =>
			Promise.resolve(new Response("{}"))) as typeof globalThis.fetch;
		const env = { ACTIONS_ID_TOKEN_REQUEST_URL: "https://example.com" };
		await expect(fetchOidcToken(env, fakeFetcher)).rejects.toThrow(
			"ACTIONS_ID_TOKEN_REQUEST_TOKEN is not set",
		);
	});

	test("throws on non-ok response", async () => {
		const fakeFetcher = ((_url: string | URL | Request, _init?: RequestInit) =>
			Promise.resolve(
				new Response("Forbidden", { status: 403, statusText: "Forbidden" }),
			)) as typeof globalThis.fetch;
		await expect(fetchOidcToken(oidcEnv, fakeFetcher)).rejects.toThrow(
			"OIDC token request failed: 403 Forbidden",
		);
	});

	test("throws when response missing value field", async () => {
		const fakeFetcher = ((_url: string | URL | Request, _init?: RequestInit) =>
			Promise.resolve(new Response(JSON.stringify({})))) as typeof globalThis.fetch;
		await expect(fetchOidcToken(oidcEnv, fakeFetcher)).rejects.toThrow(
			"OIDC token response missing 'value' field",
		);
	});
});
