import { basename, dirname, join } from "node:path";

/**
 * Strip content hashes from an asset filename for cross-build comparison.
 *
 * @example
 * ```typescript
 * normalizeAssetName("main-2c458a0c.js"); // "main-*.js"
 * normalizeAssetName("chunk.abc12345.css"); // "chunk.*.css"
 * normalizeAssetName("style.css"); // "style.css"
 * ```
 */
export const normalizeAssetName = (name: string): string => {
	const dir = dirname(name);
	const base = basename(name);

	// Match hash segments: 8+ hex chars preceded by a delimiter (- or .) and followed by an extension
	const normalized = base.replace(/([-.])[a-f0-9]{8,}(\.[a-z]+)$/i, "$1*$2");

	if (normalized !== base) {
		return dir === "." ? normalized : join(dir, normalized);
	}

	// Fallback: replace any standalone 8+ hex segment anywhere in the name
	const fallback = base.replace(/[a-f0-9]{8,}/gi, "*");
	return dir === "." ? fallback : join(dir, fallback);
};
