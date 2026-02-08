#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { Metafile } from "./types";
import { version as VERSION } from "../package.json";
import { fetchOidcToken, getServiceParams, isGitHubActions } from "./providers/github";
import { transformMetafile } from "./transform";
import { uploadBundleStats } from "./upload";

const HELP = `Usage: metafile-codecov [options]

Convert metafile output to Codecov bundle analysis format.

Options:
  -f, --metafile <path>      Path to metafile JSON (required)
  -n, --bundle-name <name>   Bundle name for Codecov (required)
      --output-dir <dir>     Build output directory for gzip size calculation
      --bundler-name <name>  Bundler name (default: "bun")
      --bundler-version <v>  Bundler version
  -o, --output <path>        Write output to file instead of stdout
      --upload               Upload bundle stats to Codecov (GitHub Actions OIDC)
  -h, --help                 Show this help message
  -v, --version              Show version`;

export interface CliArgs {
	metafile: string;
	bundleName: string;
	outputDir?: string;
	bundlerName: string;
	bundlerVersion?: string;
	output?: string;
	upload: boolean;
}

export const parseCliArgs = (args: string[]): CliArgs => {
	const { values } = parseArgs({
		args,
		options: {
			metafile: { type: "string", short: "f" },
			"bundle-name": { type: "string", short: "n" },
			"output-dir": { type: "string" },
			"bundler-name": { type: "string" },
			"bundler-version": { type: "string" },
			output: { type: "string", short: "o" },
			upload: { type: "boolean" },
			help: { type: "boolean", short: "h" },
			version: { type: "boolean", short: "v" },
		},
		strict: true,
	});

	if (values.help) {
		console.log(HELP);
		process.exit(0);
	}

	if (values.version) {
		console.log(VERSION);
		process.exit(0);
	}

	if (!values.metafile) {
		console.error("Error: --metafile is required");
		process.exit(1);
	}

	if (!values["bundle-name"]) {
		console.error("Error: --bundle-name is required");
		process.exit(1);
	}

	return {
		metafile: values.metafile,
		bundleName: values["bundle-name"],
		outputDir: values["output-dir"],
		bundlerName: values["bundler-name"] ?? "bun",
		bundlerVersion: values["bundler-version"],
		output: values.output,
		upload: values.upload ?? false,
	};
};

export const run = (args: string[]): { json: string; output?: string; upload: boolean } => {
	const parsed = parseCliArgs(args);

	const raw = readFileSync(parsed.metafile, "utf-8");
	const metafile: Metafile = JSON.parse(raw);

	const payload = transformMetafile(metafile, {
		bundleName: parsed.bundleName,
		outputDir: parsed.outputDir,
		bundler: parsed.bundlerVersion
			? { name: parsed.bundlerName, version: parsed.bundlerVersion }
			: undefined,
	});

	return { json: JSON.stringify(payload, null, 2), output: parsed.output, upload: parsed.upload };
};

// Upload bundle stats to Codecov via GitHub Actions OIDC.
// Detects the GitHub Actions environment, fetches an OIDC token,
// gathers service parameters, and performs the 2-step upload.
export const runUpload = async (
	payload: string,
	fetcher?: typeof globalThis.fetch,
	retryDelayMs?: number,
): Promise<void> => {
	if (!isGitHubActions()) {
		throw new Error("--upload is only supported in GitHub Actions");
	}

	console.error("Fetching OIDC token...");
	const oidcToken = await fetchOidcToken(undefined, fetcher);

	console.error("Gathering service parameters...");
	const serviceParams = getServiceParams();

	console.error("Uploading bundle stats to Codecov...");
	const result = await uploadBundleStats({
		payload,
		oidcToken,
		serviceParams,
		fetcher,
		retryDelayMs,
	});

	if (!result.success) {
		throw new Error(`Upload failed: ${result.error}`);
	}

	console.error("Upload successful");
};

// Run when executed directly
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));
if (isMain) {
	(async () => {
		const result = run(process.argv.slice(2));

		if (result.output) {
			writeFileSync(result.output, result.json);
			console.error(`Wrote Codecov bundle analysis to ${result.output}`);
		} else {
			console.log(result.json);
		}

		if (result.upload) {
			await runUpload(result.json);
		}
	})().catch((err: unknown) => {
		console.error(err instanceof Error ? err.message : String(err));
		process.exit(1);
	});
}
