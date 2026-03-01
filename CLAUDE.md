# CLAUDE.md

## Development workflow

After **every change** to this codebase, complete all of the steps below before
marking a task done. All steps must pass with exit code 0.

### 1. Update tests

If you added or changed functionality, update or add tests in the matching
`*_test.ts` file next to the source file.

### 2. Run the full CI suite

```bash
deno task ci
```

This single command runs all checks in order:

| Step | Command | Purpose |
|------|---------|---------|
| Format check | `deno fmt --check` | Prettier equivalent for Deno |
| Lint | `deno lint` | ESLint equivalent for Deno |
| Type check | `deno check manifest.ts` | Build / tsc equivalent for Deno |
| Tests | `deno test --allow-env` | Unit tests |

Or run each step individually:

```bash
deno task fmt        # auto-format files
deno task fmt:check  # verify formatting without changing files
deno task lint       # static analysis
deno task check      # TypeScript type checking
deno task test       # run all tests
```

### Type safety rules

- **No `any` types** — use explicit interfaces or type guards.
- **No unsafe `as T` casts** in production code — use type narrowing
  (`typeof x === "string"`, optional chaining, null coalescing).
- `as unknown as T` is acceptable **only** in `*_test.ts` files for creating
  typed mock objects.

### Project structure

```
manifest.ts          ← app manifest
types.ts             ← shared interfaces (SecretSantaEvent, SlackClient, …)
datastores/          ← DefineDatastore definitions
functions/           ← SlackFunction implementations
utils/               ← pure (no-SDK) helper functions, fully unit-testable
workflows/           ← DefineWorkflow definitions
triggers/            ← trigger definitions
```
