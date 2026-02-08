# bun-codecov

Converts bun/esbuild metafile output to Codecov bundle analysis format.

## Monorepo structure

- `packages/metafile-codecov/` - main library package
- `examples/react-app/` - e2e test with bun build + React
- `examples/esbuild-app/` - e2e test with esbuild + lodash-es

## Commands

- `bun test` - run tests across all workspaces
- `bun run build` - build all packages
- `bun run lint` - run oxlint + oxfmt
- `bun run knip` - find unused code, exports, and dependencies
- `bun run typecheck` - type check with tsc
- `bun run --parallel --filter='*' test:e2e` - Run example e2e tests

## Code style

- No `any` types
- No classes; prefer functions with explicit state
- Named exports only, no default exports
- Colocated tests: `foo.ts` paired with `foo.test.ts`
- Use `node:*` APIs in library code (no Bun-specific APIs) for Node.js compatibility
- Build tooling uses Bun
- Tabs for indentation, 120 char line width
- Exhaustiveness checks in switch statements
- JSDoc on public API functions with @example blocks

## Testing

- Use `bun:test` (describe, test, expect)
- No snapshot tests
- No mocking unless absolutely required
