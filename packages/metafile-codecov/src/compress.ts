import { gzipSync } from "node:zlib";

const COMPRESSIBLE = /\.(css|html|json|js|mjs|svg|txt|xml|xhtml)$/;

/**
 * Compute gzip-compressed size of a buffer.
 * Returns `null` for file types that are not compressible (images, fonts, etc.).
 *
 * @example
 * ```typescript
 * getGzipSize("bundle.js", Buffer.from("console.log('hello')")); // number
 * getGzipSize("image.png", Buffer.from([0x89, 0x50])); // null
 * ```
 */
export const getGzipSize = (fileName: string, content: Uint8Array): number | null => {
	if (!COMPRESSIBLE.test(fileName)) {
		return null;
	}
	return gzipSync(content).byteLength;
};
