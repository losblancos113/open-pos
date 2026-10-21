# CLAUDE.md

Guidance for Claude Code when working in this repository. See [`README.md`](./README.md)
for the product overview and [`AGENTS.md`](./AGENTS.md) for the full engineering handbook.
This file is the short version plus the things that are easy to get wrong.

---

## What this is

Offline-first POS for restaurants and cafés. Vue 3 + TypeScript frontend, Tauri 2 desktop
shell, PouchDB for local storage, and a PouchDB-server "hub" sidecar for LAN sync between
terminals in one branch.

**Current state: M0 complete.** The foundation works end to end — two terminals sync through
the hub. Features (catalog, orders, tables, QR, KDS) are not built yet. The next milestone
is M1 (Type Registry).

---

## Commands

```bash
npm ci && npm ci --prefix sidecar    # BOTH installs are required

npm run dev                          # Vite dev server, :5173, strictPort
npm run test                         # full Vitest suite
npm run test -- tests/foo.test.ts    # a single test file
npm run build                        # vue-tsc --noEmit && vite build
npm run tauri dev                    # desktop app (compiles Rust; first run is slow)

cargo test  --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
npx vue-tsc --noEmit
```

Verification before reporting a task complete — run all four: `npm run test`,
`cargo test --manifest-path src-tauri/Cargo.toml`, clippy with `-D warnings`, and
`npx vue-tsc --noEmit`. CI runs exactly these, so a local pass is the real gate.

### Windows: Rust not on PATH

`cargo` and `link.exe` are installed but not on Git Bash's `PATH`:

```bash
export PATH="$HOME/.cargo/bin:$PATH"
export PATH="/c/Program Files/Microsoft Visual Studio/2022/Community/VC/Tools/MSVC/<version>/bin/Hostx64/x64:$PATH"
```

`cargo check` does not link — use `cargo build` when validating bundling, icons, or FFI.

---

## Architecture in one minute

```
Vue 3 UI ──► DbAdapter ──► PouchDB (local disk) ──► HTTP replication ──► hub sidecar
```

- Domain logic lives in `src/core/**` and must **not** import Vue or PouchDB. It is plain
  TypeScript so the memory adapter can stand in for storage in tests.
- The hub (`sidecar/src/server.mjs`) is a separate npm package. It speaks the CouchDB HTTP
  protocol so PouchDB clients can replicate against it. It announces itself on stdout:
  `OPEN_POS_HUB_URL=http://127.0.0.1:<port>`.
- The axum LAN server in `src-tauri/src/lan/` currently serves only `GET /api/health`.

---

## Non-negotiable invariants

Breaking any of these fails a type or a test. Do not work around them — raise the conflict.

1. **`branchId` on every document.** `createEnvelope()` throws without it. Retrofitting it
   later would mean migrating all data (design doc Risk #17).
2. **Money is integer minor units.** Use `money`, `add`, `sub`, `mulInt`, `allocate`,
   `allocateEqual`. VND exponent 0, USD exponent 2. Never float arithmetic on money.
3. **Allocation is deterministic and lossless.** Parts always sum to the total. The
   safe-integer overflow guard **throws by design** — do not remove it or "fix" the throw.
4. **`_id` prefixes are a contract.** `branch:`, `product:`,
   `product_override:<branchId>:<productId>`. Use the helpers in `src/core/db/ids.ts`.
   Segments may not contain `:`.
5. **Storage goes through `DbAdapter`.** Extend the interface and implement in both adapters
   if you need more.
6. **i18n key parity.** Every key must exist in both `vi.json` and `en.json`.
7. **Design tokens are defined once** in `tokens.ts`; `tokens.css` must mirror them exactly.

---

## Hub: do not undo these guards

The hub is the network boundary, and these guards each fix a bug found in review. They are
not decoration — reverting one reintroduces a crash, a path traversal, or silent data loss.

| Guard | What it prevents |
|-------|------------------|
| Specific routes registered **before** `/:db/:id` | Express matches `_changes`/`_all_docs`/`_local` into the wildcard → 404s |
| Database-name allowlist `^[A-Za-z0-9][A-Za-z0-9_.$-]{0,62}$` | `%2f` survives param decoding → path traversal outside `HUB_DATA_DIR` |
| `since`/`limit` parsed as non-negative safe integers | `limit=-1` throws a `RangeError` outside `try/catch` → process death (DoS) |
| `_revs_diff` rethrows non-404 errors | Treating unknown failure as "already present" drops the document from replication **permanently** |
| `_local` returns **409** on a stale rev, and does not overwrite | PouchDB retries only on 409; a 500 aborts, and a stale write rewinds the cursor |
| `errorResponse()` preserves `err.status` | Collapsing 409→500 turns a retry into a hard failure |
| `listen` has an `'error'` handler + port fallback | A busy port crashes the hub *before* it prints the ready line → callers hang forever |
| Ready line `OPEN_POS_HUB_URL=...` | The tests and the app parse this exact line from stdout |

**Any change to the hub needs a regression test** in `tests/sidecar.test.ts` or
`tests/hub-endpoints.test.ts`.

---

## Testing notes

- TDD is the house style: failing test first, then the fix. Commits land with tests.
- Unit tests live in `src/**/__tests__/`, integration tests in `tests/`.
- Integration tests spawn a real hub process. Give them 30–45 s timeouts and tear down
  properly — kill the child and let its LevelDB handles go before deleting the temp
  directory. On Windows a lingering handle makes `rmSync` throw; the existing suites wrap
  cleanup in `try/catch` so it never fails the run.
- Property tests use `fast-check` where an invariant must always hold (allocation).
- Rust router tests use `tower::ServiceExt::oneshot`.

---

## Style

TypeScript is strict with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`verbatimModuleSyntax`, and `isolatedModules`. So: array indexing yields `T | undefined`;
type-only imports need `import type`; optional properties cannot be assigned `undefined`.
Path alias `@/*` maps to `./src/*`.

Comments and domain vocabulary are Vietnamese in places — match the surrounding file. Error
messages are English. Errors are thrown, not returned, and the message should name the
function and the offending value.

---

## Authority

`docs/superpowers/specs/2026-10-20-open-pos-design.md` is the authority on product
decisions. If code and spec disagree, the spec wins — or propose a spec change explicitly.
Do not invent product behaviour. The M0 plan is at
`docs/superpowers/plans/2026-10-20-m0-foundation.md`; check it for an existing task before
designing your own approach.

Do not weaken a security guard or delete a test to make something pass. Report honestly what
you verified and what you did not.
