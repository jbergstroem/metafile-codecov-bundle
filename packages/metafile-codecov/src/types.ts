/** Bun/esbuild metafile input entry */
export interface MetafileInput {
	bytes: number;
	imports: Array<{ path: string; kind: string; original?: string }>;
	format?: string;
}

/** Bun/esbuild metafile output entry */
export interface MetafileOutput {
	bytes: number;
	inputs: Record<string, { bytesInOutput: number }>;
	imports: Array<{
		path: string;
		kind: string;
		original?: string;
		external?: boolean;
	}>;
	exports: string[];
	entryPoint?: string;
}

/** Metafile format produced by bun (`bun build --metafile`) or esbuild (`metafile: true`) */
export interface Metafile {
	inputs: Record<string, MetafileInput>;
	outputs: Record<string, MetafileOutput>;
}

/** Codecov bundle analysis asset */
export interface Asset {
	name: string;
	size: number;
	gzipSize: number | null;
	normalized: string;
}

/** Codecov bundle analysis chunk */
export interface Chunk {
	id: string;
	uniqueId: string;
	entry: boolean;
	initial: boolean;
	names: string[];
	files: string[];
	dynamicImports: string[];
}

/** Codecov bundle analysis module */
export interface Module {
	name: string;
	size?: number;
	chunkUniqueIds: string[];
}

/** Codecov bundle analysis payload (version "3") */
export interface OutputPayload {
	version: string;
	bundleName: string;
	bundler?: { name: string; version: string };
	outputPath?: string;
	builtAt?: number;
	duration?: number;
	assets: Asset[];
	chunks: Chunk[];
	modules: Module[];
	plugin: { name: string; version: string };
}
