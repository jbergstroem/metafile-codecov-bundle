type Env = Record<string, string | undefined>;

const OIDC_AUDIENCE = "https://codecov.io";

export interface GitHubActionsParams {
	branch: string;
	commit: string;
	pr: string;
	service: "github-actions";
	slug: string;
	build: string;
	buildURL: string;
	job: string;
}

// Encode a GitHub "owner/repo" slug into Codecov's wire format.
//
// @example
// ```typescript
// encodeSlug("jbergstroem/metafile-codecov-bundle");
// // "jbergstroem:::metafile-codecov-bundle::::"
// ```
export const encodeSlug = (ownerRepo: string): string => {
	const idx = ownerRepo.indexOf("/");
	if (idx === -1) {
		return `${ownerRepo}::::`;
	}
	const owner = ownerRepo.slice(0, idx);
	const repo = ownerRepo.slice(idx + 1);
	return `${owner}:::${repo}::::`;
};

// Detect whether we are running inside GitHub Actions.
//
// @example
// ```typescript
// isGitHubActions(); // true when GITHUB_ACTIONS === "true"
// ```
export const isGitHubActions = (env: Env = process.env): boolean => env.GITHUB_ACTIONS === "true";

// Extract the pull request number from GITHUB_REF.
// Returns an empty string if not a PR event.
//
// @example
// ```typescript
// extractPrNumber("refs/pull/42/merge"); // "42"
// extractPrNumber("refs/heads/main"); // ""
// ```
export const extractPrNumber = (ref: string): string => {
	const match = /^refs\/pull\/(\d+)\/merge$/.exec(ref);
	return match ? match[1] : "";
};

// Extract the branch name from GitHub Actions environment variables.
// Uses GITHUB_HEAD_REF for pull requests, GITHUB_REF_NAME for pushes.
export const extractBranch = (env: Env = process.env): string =>
	env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME || "";

// Gather all service parameters from GitHub Actions environment variables.
// Throws if required variables (GITHUB_REPOSITORY, GITHUB_SHA) are missing.
//
// @example
// ```typescript
// const params = getServiceParams();
// // { branch: "main", commit: "abc123", pr: "", service: "github-actions", ... }
// ```
export const getServiceParams = (env: Env = process.env): GitHubActionsParams => {
	const repository = env.GITHUB_REPOSITORY;
	if (!repository) {
		throw new Error("GITHUB_REPOSITORY is not set");
	}

	const commit = env.GITHUB_SHA;
	if (!commit) {
		throw new Error("GITHUB_SHA is not set");
	}

	const serverUrl = env.GITHUB_SERVER_URL || "https://github.com";
	const runId = env.GITHUB_RUN_ID || "";

	return {
		branch: extractBranch(env),
		commit,
		pr: extractPrNumber(env.GITHUB_REF || ""),
		service: "github-actions",
		slug: encodeSlug(repository),
		build: runId,
		buildURL: runId ? `${serverUrl}/${repository}/actions/runs/${runId}` : "",
		job: env.GITHUB_JOB || "",
	};
};

// Fetch an OIDC JWT token from the GitHub Actions runtime.
// Requires ACTIONS_ID_TOKEN_REQUEST_URL and ACTIONS_RUNTIME_TOKEN environment variables.
//
// @example
// ```typescript
// const token = await fetchOidcToken();
// // "eyJ..."
// ```
export const fetchOidcToken = async (
	env: Env = process.env,
	fetcher: typeof globalThis.fetch = globalThis.fetch,
): Promise<string> => {
	const requestUrl = env.ACTIONS_ID_TOKEN_REQUEST_URL;
	if (!requestUrl) {
		throw new Error(
			"ACTIONS_ID_TOKEN_REQUEST_URL is not set. Ensure the workflow has 'permissions: id-token: write'.",
		);
	}

	const runtimeToken = env.ACTIONS_RUNTIME_TOKEN;
	if (!runtimeToken) {
		throw new Error("ACTIONS_RUNTIME_TOKEN is not set");
	}

	const url = `${requestUrl}&audience=${OIDC_AUDIENCE}`;
	const response = await fetcher(url, {
		headers: { Authorization: `Bearer ${runtimeToken}` },
	});

	if (!response.ok) {
		throw new Error(`OIDC token request failed: ${response.status} ${response.statusText}`);
	}

	const data = (await response.json()) as { value?: string };
	if (!data.value) {
		throw new Error("OIDC token response missing 'value' field");
	}

	return data.value;
};
