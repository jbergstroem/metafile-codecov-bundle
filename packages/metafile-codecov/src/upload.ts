import type { GitHubActionsParams } from "./providers/github";

const CODECOV_API_URL = "https://api.codecov.io/upload/bundle_analysis/v1";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export interface UploadOptions {
	// The JSON string of the bundle stats payload
	payload: string;
	// OIDC JWT token for authentication
	oidcToken: string;
	// Service parameters gathered from the CI environment
	serviceParams: GitHubActionsParams;
	// Override the Codecov API URL (useful for testing or self-hosted instances)
	apiUrl?: string;
	// Override fetch implementation (for testing)
	fetcher?: typeof globalThis.fetch;
	// Override retry delay in milliseconds (default: 1000)
	retryDelayMs?: number;
}

export interface UploadResult {
	success: boolean;
	presignedUrl?: string;
	error?: string;
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithRetry = async (
	url: string,
	init: RequestInit,
	fetcher: typeof globalThis.fetch,
	retries: number,
	delayMs: number,
): Promise<Response> => {
	const response = await fetcher(url, init);
	if (response.ok) {
		return response;
	}
	if (retries <= 1) {
		throw new Error(`Request failed: ${response.status} ${response.statusText}`);
	}
	await delay(delayMs);
	return fetchWithRetry(url, init, fetcher, retries - 1, delayMs);
};

const getPresignedUrl = async (
	apiUrl: string,
	serviceParams: GitHubActionsParams,
	oidcToken: string,
	fetcher: typeof globalThis.fetch,
	retries: number,
	delayMs: number,
): Promise<string> => {
	const response = await fetchWithRetry(
		apiUrl,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `token ${oidcToken}`,
			},
			body: JSON.stringify(serviceParams),
		},
		fetcher,
		retries,
		delayMs,
	);

	const data = (await response.json()) as { url?: string };
	if (!data.url) {
		throw new Error("Presigned URL response missing 'url' field");
	}

	return data.url;
};

const putPayload = async (
	presignedUrl: string,
	payload: string,
	fetcher: typeof globalThis.fetch,
	retries: number,
	delayMs: number,
): Promise<void> => {
	await fetchWithRetry(
		presignedUrl,
		{
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: payload,
		},
		fetcher,
		retries,
		delayMs,
	);
};

// Upload bundle analysis stats to Codecov.
//
// Performs a 2-step upload:
// 1. POST service params to Codecov API to get a presigned URL
// 2. PUT the bundle stats JSON to the presigned URL
//
// Retries each step up to 3 times with a 1s delay on failure.
//
// @example
// ```typescript
// import { getServiceParams, fetchOidcToken } from "metafile-codecov-bundle";
//
// const result = await uploadBundleStats({
//     payload: JSON.stringify(codecovPayload),
//     oidcToken: await fetchOidcToken(),
//     serviceParams: getServiceParams(),
// });
// ```
export const uploadBundleStats = async (options: UploadOptions): Promise<UploadResult> => {
	const apiUrl = options.apiUrl ?? CODECOV_API_URL;
	const fetcher = options.fetcher ?? globalThis.fetch;
	const retryDelay = options.retryDelayMs ?? RETRY_DELAY_MS;

	try {
		const presignedUrl = await getPresignedUrl(
			apiUrl,
			options.serviceParams,
			options.oidcToken,
			fetcher,
			MAX_RETRIES,
			retryDelay,
		);

		await putPayload(presignedUrl, options.payload, fetcher, MAX_RETRIES, retryDelay);

		return { success: true, presignedUrl };
	} catch (err) {
		return { success: false, error: err instanceof Error ? err.message : String(err) };
	}
};
