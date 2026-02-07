# metafile-codecov-bundle

Convert [bun](https://bun.sh/docs/bundler) or [esbuild](https://esbuild.github.io/)
metafile output to
[Codecov bundle analysis](https://docs.codecov.com/docs/javascript-bundle-analysis) format.

Both bun and esbuild produce an identical metafile JSON format describing
the build. This package transforms that into Codecov's v3 bundle analysis
payload, which can then be uploaded via the
[Codecov GitHub Action](https://github.com/codecov/codecov-action).

## Installation

```sh
bun add -d metafile-codecov-bundle
# or
npm install -D metafile-codecov-bundle
```

## CLI usage

Generate a metafile during your build, then convert it:

```sh
# bun
bun build --outdir=dist --metafile=metafile.json ./src/index.ts
metafile-codecov -f metafile.json -n my-app --bundler-name bun --bundler-version 1.2.0

# esbuild
esbuild src/index.ts --bundle --outdir=dist --metafile=metafile.json
metafile-codecov -f metafile.json -n my-app --bundler-name esbuild --bundler-version 0.24.0
```

The Codecov JSON is written to stdout. To write to a file instead:

```sh
metafile-codecov -f metafile.json -n my-app -o codecov-bundle-stats.json
```

### Options

| Flag                    | Short | Description                                          |
| ----------------------- | ----- | ---------------------------------------------------- |
| `--metafile <path>`     | `-f`  | Path to metafile JSON (required)                     |
| `--bundle-name <name>`  | `-n`  | Bundle name for Codecov (required)                   |
| `--output-dir <dir>`    |       | Build output directory for gzip size calculation     |
| `--bundler-name <name>` |       | Bundler name (default: `bun`)                        |
| `--bundler-version <v>` |       | Bundler version                                      |
| `--output <path>`       | `-o`  | Write output to file instead of stdout               |
| `--upload`              |       | Upload bundle stats to Codecov (GitHub Actions OIDC) |
| `--help`                | `-h`  | Show help                                            |
| `--version`             | `-v`  | Show version                                         |

When `--output-dir` is provided, gzip sizes are computed by reading the
actual output files from disk. Without it, `gzipSize` will be `null`.

## Programmatic API

```typescript
import { readFileSync, writeFileSync } from "node:fs";
import { transformMetafile } from "metafile-codecov-bundle";

const metafile = JSON.parse(readFileSync("metafile.json", "utf-8"));
const payload = transformMetafile(metafile, {
	bundleName: "my-app",
	outputDir: "dist",
	bundler: { name: "bun", version: "1.2.0" },
});

writeFileSync("codecov-bundle-stats.json", JSON.stringify(payload));
```

### `transformMetafile(metafile, options)`

Transforms a bun/esbuild metafile into a Codecov `OutputPayload`.

The `metafile` parameter accepts the `Metafile` type exported by this package.
It is also compatible with esbuild's `Metafile` type from the `esbuild` package.

| Option       | Type                                | Description                                                  |
| ------------ | ----------------------------------- | ------------------------------------------------------------ |
| `bundleName` | `string`                            | Name for this bundle in Codecov (required)                   |
| `outputDir`  | `string`                            | Directory containing build output files for gzip calculation |
| `bundler`    | `{ name: string; version: string }` | Bundler metadata                                             |
| `builtAt`    | `number`                            | Unix timestamp in ms (defaults to `Date.now()`)              |
| `duration`   | `number`                            | Build duration in ms                                         |

## Upload to Codecov

### Built-in upload (OIDC)

The `--upload` flag uploads bundle stats directly to Codecov using GitHub Actions
OIDC authentication. No token required — the workflow must have `id-token: write`
permission.

```yaml
permissions:
  id-token: write

steps:
  - name: Build
    run: bun build --outdir=dist --metafile=metafile.json ./src/index.ts

  - name: Upload bundle stats
    run: bunx metafile-codecov-bundle -f metafile.json -n my-app --upload
```

### Programmatic upload

```typescript
import { fetchOidcToken, getServiceParams, uploadBundleStats } from "metafile-codecov-bundle";

const result = await uploadBundleStats({
	payload: JSON.stringify(codecovPayload),
	oidcToken: await fetchOidcToken(),
	serviceParams: getServiceParams(),
});
```

## How it works

The metafile contains `inputs` (source modules) and `outputs` (bundled files).
These map to Codecov's payload as follows:

| Metafile  | Codecov   | Mapping                                               |
| --------- | --------- | ----------------------------------------------------- |
| `outputs` | `assets`  | File name, byte size, gzip size, hash-normalized name |
| `outputs` | `chunks`  | Entry detection, dynamic imports, file associations   |
| `inputs`  | `modules` | Module path, byte size, chunk membership              |

Source map files (`.map`) are excluded. Asset filenames containing 8+ hex
character hashes are normalized (e.g., `main-2c458a0c.js` becomes `main-*.js`)
for stable cross-build comparison.

## License

MIT
