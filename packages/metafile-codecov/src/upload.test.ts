import { describe, expect, test } from "bun:test";
import type { GitHubActionsParams } from "./providers/github";
import { uploadBundleStats } from "./upload";

const SERVICE_PARAMS: GitHubActionsParams = {
	branch: "main",
	commit: "abc123",
	pr: "",
	service: "github-actions",
	slug: "owner:::repo::::",
	build: "12345",
	buildURL: "https://github.com/owner/repo/actions/runs/12345",
	job: "build",
};

const PRESIGNED_URL = "https://storage.example.com/upload/presigned-abc";

const makeFetcher = (responses: Array<{ status: number; body: string }>) => {
	const calls: Array<{
		url: string;
		method: string;
		headers: Record<string, string>;
		body: string | null;
	}> = [];
	let callIndex = 0;

	const fetcher = ((url: string | URL | Request, init?: RequestInit) => {
		const entry = responses[callIndex++];
		calls.push({
			url: String(url),
			method: init?.method ?? "GET",
			headers: Object.fromEntries(Object.entries(init?.headers ?? {})),
			body: init?.body ? String(init.body) : null,
		});
		return Promise.resolve(new Response(entry.body, { status: entry.status }));
	}) as typeof globalThis.fetch;

	return { fetcher, calls };
};

describe("uploadBundleStats", () => {
	test("performs 2-step upload successfully", async () => {
		const { fetcher, calls } = makeFetcher([
			{ status: 200, body: JSON.stringify({ url: PRESIGNED_URL }) },
			{ status: 200, body: "" },
		]);

		const result = await uploadBundleStats({
			payload: '{"version":"3"}',
			oidcToken: "test-jwt",
			serviceParams: SERVICE_PARAMS,
			apiUrl: "https://api.test.com/upload/bundle_analysis/v1",
			fetcher,
		});

		expect(result.success).toBe(true);
		expect(result.presignedUrl).toBe(PRESIGNED_URL);
		expect(calls).toHaveLength(2);
	});

	test("sends correct Authorization header with oidc token", async () => {
		const { fetcher, calls } = makeFetcher([
			{ status: 200, body: JSON.stringify({ url: PRESIGNED_URL }) },
			{ status: 200, body: "" },
		]);

		await uploadBundleStats({
			payload: "{}",
			oidcToken: "my-oidc-jwt",
			serviceParams: SERVICE_PARAMS,
			fetcher,
		});

		expect(calls[0].headers.Authorization).toBe("token my-oidc-jwt");
	});

	test("sends service params as JSON body in step 1", async () => {
		const { fetcher, calls } = makeFetcher([
			{ status: 200, body: JSON.stringify({ url: PRESIGNED_URL }) },
			{ status: 200, body: "" },
		]);

		await uploadBundleStats({
			payload: "{}",
			oidcToken: "jwt",
			serviceParams: SERVICE_PARAMS,
			fetcher,
		});

		expect(calls[0].method).toBe("POST");
		expect(calls[0].headers["Content-Type"]).toBe("application/json");
		const body = JSON.parse(calls[0].body!);
		expect(body.commit).toBe("abc123");
		expect(body.service).toBe("github-actions");
		expect(body.slug).toBe("owner:::repo::::");
	});

	test("sends payload as body in step 2 PUT", async () => {
		const { fetcher, calls } = makeFetcher([
			{ status: 200, body: JSON.stringify({ url: PRESIGNED_URL }) },
			{ status: 200, body: "" },
		]);

		await uploadBundleStats({
			payload: '{"version":"3","bundleName":"test"}',
			oidcToken: "jwt",
			serviceParams: SERVICE_PARAMS,
			fetcher,
		});

		expect(calls[1].method).toBe("PUT");
		expect(calls[1].url).toBe(PRESIGNED_URL);
		expect(calls[1].body).toBe('{"version":"3","bundleName":"test"}');
	});

	test("returns error result when presigned URL request fails", async () => {
		const { fetcher } = makeFetcher([
			{ status: 403, body: "Forbidden" },
			{ status: 403, body: "Forbidden" },
			{ status: 403, body: "Forbidden" },
		]);

		const result = await uploadBundleStats({
			payload: "{}",
			oidcToken: "jwt",
			serviceParams: SERVICE_PARAMS,
			fetcher,
			retryDelayMs: 0,
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain("403");
	});

	test("returns error result when PUT fails", async () => {
		const { fetcher } = makeFetcher([
			{ status: 200, body: JSON.stringify({ url: PRESIGNED_URL }) },
			{ status: 500, body: "Error" },
			{ status: 500, body: "Error" },
			{ status: 500, body: "Error" },
		]);

		const result = await uploadBundleStats({
			payload: "{}",
			oidcToken: "jwt",
			serviceParams: SERVICE_PARAMS,
			fetcher,
			retryDelayMs: 0,
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain("500");
	});

	test("returns error when presigned URL response missing url field", async () => {
		const { fetcher } = makeFetcher([{ status: 200, body: JSON.stringify({}) }]);

		const result = await uploadBundleStats({
			payload: "{}",
			oidcToken: "jwt",
			serviceParams: SERVICE_PARAMS,
			fetcher,
		});

		expect(result.success).toBe(false);
		expect(result.error).toContain("missing 'url' field");
	});

	test("uses custom apiUrl when provided", async () => {
		const { fetcher, calls } = makeFetcher([
			{ status: 200, body: JSON.stringify({ url: PRESIGNED_URL }) },
			{ status: 200, body: "" },
		]);

		await uploadBundleStats({
			payload: "{}",
			oidcToken: "jwt",
			serviceParams: SERVICE_PARAMS,
			apiUrl: "https://custom.api/upload/bundle_analysis/v1",
			fetcher,
		});

		expect(calls[0].url).toBe("https://custom.api/upload/bundle_analysis/v1");
	});

	test("retries step 1 on failure then succeeds", async () => {
		const { fetcher, calls } = makeFetcher([
			{ status: 500, body: "Error" },
			{ status: 200, body: JSON.stringify({ url: PRESIGNED_URL }) },
			{ status: 200, body: "" },
		]);

		const result = await uploadBundleStats({
			payload: "{}",
			oidcToken: "jwt",
			serviceParams: SERVICE_PARAMS,
			fetcher,
			retryDelayMs: 0,
		});

		expect(result.success).toBe(true);
		expect(calls).toHaveLength(3);
	});
});
