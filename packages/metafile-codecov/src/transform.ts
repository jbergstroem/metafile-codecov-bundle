import { readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { Asset, Chunk, Metafile, Module, OutputPayload } from "./types";
import { version as PLUGIN_VERSION } from "../package.json";
import { getGzipSize } from "./compress";
import { normalizeAssetName } from "./normalize";

export interface TransformOptions {
	/** Name for this bundle in Codecov */
	bundleName: string;
	/** Directory containing the build output files (for gzip size calculation) */
	outputDir?: string;
	/** Bundler info to include in the payload */
	bundler?: { name: string; version: string };
	/** Unix timestamp (ms) when the build started */
	builtAt?: number;
	/** Build duration in milliseconds */
	duration?: number;
}

/**
 * Transform a bun/esbuild metafile into a Codecov bundle analysis payload.
 *
 * @example
 * ```typescript
 * import { readFileSync } from "node:fs";
 * import { transformMetafile } from "metafile-codecov-bundle";
 *
 * const metafile = JSON.parse(readFileSync("metafile.json", "utf-8"));
 * const payload = transformMetafile(metafile, { bundleName: "my-app" });
 * ```
 */
export const transformMetafile = (metafile: Metafile, options: TransformOptions): OutputPayload => {
	const outputDir = options.outputDir ? resolve(options.outputDir) : undefined;
	const outputEntries = Object.entries(metafile.outputs);

	// Build a map from output path to uniqueId for module association
	const chunkIdMap = new Map<string, string>();
	for (let i = 0; i < outputEntries.length; i++) {
		const [outputPath] = outputEntries[i];
		chunkIdMap.set(outputPath, `${i}-${outputPath}`);
	}

	const assets: Asset[] = [];
	const chunks: Chunk[] = [];

	for (const [outputPath, output] of outputEntries) {
		// Skip source maps
		if (outputPath.endsWith(".map")) {
			continue;
		}

		const uniqueId = chunkIdMap.get(outputPath)!;

		// Compute gzip size from the actual file on disk if possible
		let gzipSize: number | null = null;
		if (outputDir) {
			try {
				const filePath = join(outputDir, basename(outputPath));
				const content = readFileSync(filePath);
				gzipSize = getGzipSize(outputPath, content);
			} catch {
				// File not readable; leave gzipSize as null
			}
		}

		assets.push({
			name: outputPath,
			size: output.bytes,
			gzipSize,
			normalized: normalizeAssetName(outputPath),
		});

		// Collect dynamic imports by matching import kinds
		const dynamicImports: string[] = [];
		for (const imp of output.imports) {
			if (imp.kind === "dynamic-import" && !imp.external) {
				dynamicImports.push(imp.path);
			}
		}

		const name = output.entryPoint
			? basename(output.entryPoint).replace(/\.[^.]+$/, "")
			: basename(outputPath).replace(/\.[^.]+$/, "");

		chunks.push({
			id: outputPath,
			uniqueId,
			entry: output.entryPoint !== undefined,
			initial: output.entryPoint !== undefined,
			names: [name],
			files: [outputPath],
			dynamicImports,
		});
	}

	// Build modules from inputs, linking to chunks via output.inputs membership
	const modules: Module[] = [];
	for (const [inputPath, input] of Object.entries(metafile.inputs)) {
		const chunkUniqueIds: string[] = [];
		for (const [outputPath, output] of outputEntries) {
			if (outputPath.endsWith(".map")) {
				continue;
			}
			if (inputPath in output.inputs) {
				const uid = chunkIdMap.get(outputPath);
				if (uid) {
					chunkUniqueIds.push(uid);
				}
			}
		}

		modules.push({
			name: inputPath,
			size: input.bytes,
			chunkUniqueIds,
		});
	}

	return {
		version: "3",
		bundleName: options.bundleName,
		bundler: options.bundler,
		builtAt: options.builtAt ?? Date.now(),
		duration: options.duration,
		assets,
		chunks,
		modules,
		plugin: { name: "metafile-codecov-bundle", version: PLUGIN_VERSION },
	};
};
