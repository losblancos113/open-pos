# AGENTS.md

Instructions for AI coding agents working in the Open POS repository. Read this before
making changes. It assumes you have already read [`README.md`](./README.md) for the product
overview.

The design document at `docs/superpowers/specs/2026-10-20-open-pos-design.md` is the
**authority on product decisions**. If code and spec disagree, the spec wins — or you
propose a spec change explicitly. Do not silently invent product behaviour.

---

## 1. Quick orientation

| Question | Answer |
|----------|--------|
| What is this? | Offline-first POS for restaurants/cafés (Vietnamese market) |
| Current milestone | M0 complete; next is M1 (Type Registry) |
| Frontend | Vue 3 + TypeScript strict + Vite |
| Desktop shell | Tauri 2 (Rust) |
| Local storage | PouchDB |
| Sync | PouchDB-server "hub" sidecar over LAN |
| Tests | Vitest (TS) + `cargo test` (Rust) |
| Package manager | npm (with a separate `npm ci --prefix sidecar`) |

---

## 2. Repository layout and where code belongs

```
src/                Vue 3 frontend
  core/             Domain logic — MUST NOT import Vue or PouchDB
  i18n/             vi.json, en.json, i18n setup
  styles/           tokens.ts (source of truth) + tokens.css (mirror)
src-tauri/          Rust desktop shell + axum LAN server
sidecar/            PouchDB-server hub (own package.json, own node_modules)
tests/              Cross-process integration tests
docs/superpowers/   Design spec + implementation plans
```

Placement rules:

- **Domain logic → `src/core/**`.** Plain TypeScript, no framework imports. This is what
  makes it testable and reusable. If you find yourself importing `vue` in `core/`, stop.
- **UI → `src/**` outside `core/`.**
- **Anything needing its own process → `src-tauri/` or `sidecar/`.**
- **Tests → next to the code** in `src/**/__tests__/*.test.ts`. **Exception:** tests that
  spawn a process or drive the hub go in `tests/*.test.ts` (they need the `tests/` include
  pattern in `vite.config.ts`).

---

## 3. Commands

```bash
# Setup (both installs are required — the sidecar is a separate package)
npm ci
npm ci --prefix sidecar

# Frontend dev / build
npm run dev                 # Vite on :5173 (strictPort — will fail if taken)
npm run build               # vue-tsc --noEmit && vite build
npm run test                # full Vitest suite, one shot
npm run test:watch          # watch mode
npm run test -- tests/two-terminal-sync.test.ts   # single file

# Desktop app
npm run tauri dev           # first run compiles Rust; slow
npm run tauri build

# Rust
cargo test  --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings

# Hub standalone
cd sidecar && HUB_PORT=5984 HUB_DATA_DIR=./.hub-data node src/server.mjs
```

### Windows toolchain gotcha

If `cargo` or `link.exe` is "not found", they are installed but not on Git Bash's `PATH`.
Prepend them:

```bash
export PATH="$HOME/.cargo/bin:$PATH"
export PATH="/c/Program Files/Microsoft Visual Studio/2022/Community/VC/Tools/MSVC/<version>/bin/Hostx64/x64:$PATH"
```

`cargo check` does **not** link the binary. Run `cargo build` when validating anything that
touches bundling, icons, or FFI — otherwise a link error stays hidden.

---

## 4. Non-negotiable invariants

These are load-bearing. Each is enforced by a type, a guard, or a test. If your change
appears to require relaxing one, raise it rather than working around it.

### 4.1 `branchId` on every document

`createEnvelope()` throws if `branchId` is missing or blank. Every document goes through it.
This exists because adding `branchId` later would require migrating all existing data
(design doc Risk #17). Do not add a code path that writes a document without it.

### 4.2 Money is integer minor units

```ts
money(1500, 'VND')   // 1500 minor units = 1,500₫  (VND exponent is 0)
money(1500, 'USD')   // 1500 minor units = $15.00 (USD exponent is 2)
```

- `money()` rejects non-integers and unsafe integers. Never bypass it.
- Never use `+`, `-`, `*` on `Money` by hand — use `add`, `sub`, `mulInt`, `allocate`,
  `allocateEqual`.
- Never store or transport money as a float. The `minor`/`currency` pair is the wire format.
- `format()` is for display only. Never parse its output back into a number.

### 4.3 Allocation must stay deterministic and lossless

`allocate(total, weights)` splits by largest-remainder with an ascending-index tie-break.
Two invariants must hold:

- The parts **always sum to exactly `total`** — no lost or invented minor units.
- The same inputs **always** produce the same output.

There is an explicit guard: if `total × weight` would exceed `Number.MAX_SAFE_INTEGER`, the
function **throws** instead of returning wrong money. Do not remove that guard or "fix" the
throw — silently returning an incorrect split is the worse failure for a payment path.

### 4.4 `_id` conventions

Built by the helpers in `src/core/db/ids.ts`:

| Helper | Format |
|--------|--------|
| `branchDocId(branchId)` | `branch:<branchId>` |
| `productDocId(productId)` | `product:<productId>` |
| `productBranchOverrideId(productId, branchId)` | `product_override:<branchId>:<productId>` |

Segments must be non-empty and must not contain `:`. Do not build ids by string
concatenation — use the helpers so the validation stays in one place.

**Note:** the design document (§5.4) describes a *fuller* planned scheme —
`{branchCode}:{entity}:{uuid}` for branch-scoped docs, `global:{entity}:{key}` for shared
docs, and `{branchCode}:{deviceId}:{entity}:{uuid}` for device-personal docs. That scheme is
for later milestones. What exists today is the three helpers above. If you need ids in the
spec's format, add helpers to `ids.ts` rather than changing the existing ones — several tests
assert the current prefixes.

### 4.5 Storage goes through `DbAdapter`

`src/core/db/adapter.ts` defines the contract: `get`, `put`, `allDocs({ branchId? })`,
`remove`. Domain code must depend on this interface, never on PouchDB directly. That is what
lets the in-memory adapter stand in for tests. If you need a capability the interface lacks,
extend the interface and implement it in **both** adapters.

The in-memory adapter (`createMemoryAdapter(): Promise<DbAdapter>`) is the current test
double. It is a factory, not a class — each call returns a fully isolated store. Two traps:

- **It returns shallow copies.** Nested objects and arrays inside a document are shared by
  reference with the store, so mutating a nested value after `get()` silently mutates the
  stored document. Copy nested structures yourself if you need to mutate them.
- **Two deletion paths coexist.** `get()`/`allDocs()` hide documents with a `deletedAt`
  field (soft delete), while `remove()` deletes the document outright (hard delete). Pick
  deliberately; do not assume `remove()` leaves a tombstone.
- Revs are `1-00000001`, `1-00000002`, … — a counter, not content-addressed like real
  PouchDB. The API shape matches, but do not write tests that assert a real PouchDB rev hash.

### 4.6 i18n key parity

Every key in `src/i18n/vi.json` must exist in `src/i18n/en.json` and vice versa — a test
enforces it. Vietnamese is the default and fallback locale. Add keys to both files in the
same change. Do not hard-code user-visible strings in components; use `t('...')`.

### 4.7 Design tokens are defined once

`src/styles/tokens.ts` is the source of truth. `src/styles/tokens.css` must declare exactly
the same set of CSS variables; a drift test enforces it. Add a token in both places.

### 4.8 UI primitives come from Vuetify0

All interactive UI is built from **Vuetify0**, imported as **`@vuetify/v0`**.

> **Package-name trap.** The product is "Vuetify0" / "Vuetify Zero", but the npm package is
> `@vuetify/v0`. There is no `vuetify0` package — that name 404s. Plain `vuetify` is the
> older v3/v4 component library and is **not** what this project uses. `@vuetify/v0` was at
> **1.3.0** and is SemVer-stable since v1.0.0.

Why: it is headless and unstyled (zero runtime dependencies), so it gives us behaviour,
accessibility wiring, and validation without imposing a look — we keep our own design tokens
as the single styling source (4.7).

Rules:

- **Do not hand-roll controls.** No raw `<input>`, `<select>`, `<button>`, or `<table>` for
  interactive UI in feature code. Use the Vuetify0 components instead:

  | Need | Use |
  |------|-----|
  | Text / number-ish text input | `Input.Root` + `Input.Control` (+ `Input.Description`, `Input.Error`) |
  | Number, decimal, money | `NumberField.Root` (+ `.Control`, `.Increment`, `.Decrement`, `.Scrub`, `.Error`) — supports `min`/`max`/`step`/`locale`/`format` |
  | Single select | `Select.Root` |
  | Searchable select / reference picker | `Combobox.Root` |
  | Boolean | `Checkbox.Root` / `Switch.Root` / `Toggle.Root` |
  | Radio group | `Radio.Root` |
  | Tabular list | `DataTable` / `DataGrid` |
  | Confirm / modal | `Dialog` / `AlertDialog` |
  | Transient feedback | `Snackbar`, `Alert` |
  | Progress | `Progress` |
  | Buttons | `Button.Root` (+ `.Content`, `.Icon`, `.Loading`) |
  | Form orchestration | `Form` component + `createForm` / `useForm` |

- **Validation is Vuetify0's, not ours.** Field rules are `FormValidationRule` functions or
  `RuleAlias` strings passed to `Input.Root :rules`, resolved by `useRules`. Vuetify0 also
  accepts **Standard Schema** objects (Zod ≥3.24, Valibot, ArkType) if we adopt one later.
  Do not build a parallel validation engine — but note that *domain* validation (type
  definitions: reserved keys, formula cycles, index limits) is **not** input validation and
  stays in `core/`.
- **Custom widgets are built with `createInput`.** Anything Vuetify0 does not ship (see the
  gaps below) is authored as a primitive via `createInput` so it still registers with the
  parent `Form`, participates in validation, and gets `aria-describedby` /
  `aria-errormessage` wiring for free.
- **Do not adopt Vuetify0's theme layer.** `useTheme`, `createTheme`, and the `./palettes/*`
  exports are out of scope — they would duplicate `tokens.ts` and violate 4.7. Use Vuetify0's
  optional plugin factories only for locale and rules.
- **No plugin install is required** for the components; import them directly. Optional
  `createLocalePlugin` (with the `./locale/adapters/vue-i18n` adapter) and `createRulesPlugin`
  are how we wire Vuetify0 into our existing i18n.

**Known gaps — Vuetify0 does not ship these; handle them explicitly:**

| Missing | Consequence |
|---------|-------------|
| **Textarea** | `Input.Control` renders `<input>`. Author a textarea primitive with `createInput`, or wrap a native `<textarea>` in `Input.Root`/`Input.Description`/`Input.Error` |
| **DatePicker / DateInput** | No date component (`useDate` composable only). Use native `<input type="date">` / `type="datetime-local"` via `Input.Root type="..."`, or build a popover calendar later |
| **ColorPicker** | Use native `<input type="color">`, or build with `Slider` |
| **File / image upload** | No upload component. Image fields stay URL / reference-id in v1 |

**Peer dependency:** `@floating-ui/dom` is an *optional* peer, but `Select`, `Combobox`,
`Menu`, `Popover`, and `Tooltip` need it. Install it if any of those are used.

**Locale coverage:** Vuetify0 ships **`en` messages only** (`./locale/messages/en`). Its
built-in rule aliases and component strings therefore default to English. Vietnamese must come
from our own `vi.json` via the `vue-i18n` locale adapter, or from custom aliases registered
through `createRules({ aliases })`. Do not assume a Vietnamese built-in string exists.

---

## 5. Hub protocol and security invariants

The hub (`sidecar/src/server.mjs`) is the network boundary. It speaks the CouchDB/PouchDB
HTTP protocol so PouchDB clients can replicate against it. **Several of the guards below
fix real bugs that were found in review** — they are not defensive decoration. Reverting one
reintroduces a crash, a path traversal, or silent data loss.

### 5.1 Route ordering matters

Express matches in registration order. `/:db/:id` is a two-segment wildcard that also
matches `_changes`, `_all_docs`, and `_local/:id`. **All specific routes must be registered
before `/:db/:id`.** Registering `/:db/:id` first makes those endpoints return 404.

### 5.2 Database names are allowlisted

```js
const DB_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.$-]{0,62}$/;
```

Express decodes route parameters **after** matching the path, so `%2f` survives into the
parameter. Without this check, `/..%2fESCAPED` resolves to a LevelDB directory *outside*
`HUB_DATA_DIR`. This was verified as an exploitable path traversal. Do not loosen the
pattern or skip the check in a new route that takes `:db`.

### 5.3 `_changes` validates `since` and `limit`

Both are parsed as non-negative safe integers. A value like `limit=-1` reaches PouchDB's
internal `_flush`, which throws a `RangeError` **outside** the handler's `try/catch` and
kills the process — an unauthenticated denial of service from a single URL. Invalid values
must return `400` with `error: "query_parse_error"`.

### 5.4 `_revs_diff` must rethrow unknown errors

`_revs_diff` tells a client which revisions the hub is missing. If a `db.get` fails for a
reason *other than* 404, that revision must be reported as **missing** — or, if the failure
is unknown, the request must fail. Treating an unknown error as "the hub already has this"
means the client never sends that document, and it is **lost from replication permanently**.
Only a genuine 404 may be added to `missing`.

### 5.5 `_local` documents must return 409 on a stale rev

Replication checkpoints are `_local/*` documents. PouchDB's checkpointer retries on `409`
and aborts on anything else. Two rules:

- A write whose `_rev` does not match the stored rev must return **409**, not 500.
- A stale write must **not** overwrite a newer checkpoint (that would silently rewind the
  replication cursor).

### 5.6 Errors must preserve their HTTP status

`errorResponse()` maps `err.status` through instead of collapsing everything to 500. PouchDB
branches on status: `409` → retry, `401`/`403` → denied. A 500 for what should be a 409
turns a retry into a hard failure.

### 5.7 The listen error handler is load-bearing

`app.listen()` with no `'error'` listener crashes the process when the port is busy —
*before* it prints the ready line. Anything waiting for `OPEN_POS_HUB_URL` then hangs
forever. The hub therefore handles `'error'`, falls back to an ephemeral port on
`EADDRINUSE`, and only then reports its URL. Keep the fallback; a second instance or an
installed CouchDB on `:5984` must not be fatal.

### 5.8 The ready line is a contract

```
OPEN_POS_HUB_URL=http://127.0.0.1:<port>
```

The integration tests and the app both parse this exact line from stdout. If you change its
format, update the tests in `tests/` and the discovery code in the same change.

### 5.9 Add a regression test for every protocol fix

`tests/sidecar.test.ts` and `tests/hub-endpoints.test.ts` exist specifically to pin these
behaviours. A fix to the hub without a test is incomplete work.

---

## 6. Testing expectations

- **TDD is the house style.** Write the failing test first, then make it pass. Every task in
  the M0 plan is structured this way. Commits land with tests.
- **Unit tests** → `src/**/__tests__/*.test.ts`, run in the `node` environment. No jsdom;
  the memory adapter stands in for storage.
- **Integration tests** → `tests/*.test.ts`. These spawn a real hub process, so they need
  generous timeouts (the existing ones use 30–45 s) and a real teardown that kills the child
  and releases its LevelDB file handles before deleting the temp directory. On Windows a
  lingering handle makes `rmSync` throw — the existing suites wrap cleanup in `try/catch`
  and must not fail the run for that reason.
- **Rust tests** live in `src-tauri/src/**` as `#[cfg(test)] mod tests` and run via
  `cargo test`. The router tests use `tower::ServiceExt::oneshot`.
- **Property tests** use `fast-check` where an invariant matters (allocation is the current
  example). Prefer a property over an example when the requirement is "always".

Before you say a change is done:

```bash
npm run test                                   # all 68+ TS tests
cargo test  --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
npx vue-tsc --noEmit                           # types
```

CI runs exactly these on `windows-latest`, so a local pass is the real gate. `clippy` is run
with `-D warnings` — a warning fails CI.

---

## 7. Code conventions

- **TypeScript is strict**, with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `verbatimModuleSyntax`, and `isolatedModules`. Consequences you will hit:
  - Indexing an array yields `T | undefined` — handle it.
  - `import type { X }` is required for type-only imports.
  - Optional properties cannot be assigned `undefined` explicitly.
- **Module resolution is `bundler`**, path alias `@/*` → `./src/*`.
- **Comments and domain vocabulary are Vietnamese** in places — match the surrounding file.
  Error messages and thrown exceptions are in English (assertions match on them).
- **Errors are thrown, not returned.** Functions that cannot honour their contract throw
  with a message that names the function and the offending value, e.g.
  `allocate(): weight must be finite and non-negative, got -1`.
- **Prefer small, pure functions in `core/`.** They are easier to property-test and keep the
  UI thin.
- **Do not add a dependency without a reason** the spec or plan supports. The stack is
  deliberately small.

---

## 8. Working agreement for agents

1. **Read the relevant part of the design spec first.** For anything touching money,
   documents, or sync, the spec and the plan have already made the decision.
2. **Check the plan for an existing task** before designing your own approach —
   `docs/superpowers/plans/2026-10-20-m0-foundation.md`.
3. **Write the test first** when behaviour changes.
4. **Keep changes scoped.** One concern per commit, with a conventional-commit message
   (`feat:`, `fix:`, `chore:`, `docs:`) matching the existing history.
5. **Run the full verification set** above before reporting completion. Do not report a task
   as done on the strength of "it should work" — run it.
6. **Do not commit generated output** (`dist/`, `src-tauri/target/`, `.hub-data/`).
7. **Do not weaken a security guard or a test to make something pass.** If a guard blocks a
   legitimate change, explain why and propose a design change instead.
8. **Report honestly.** If something is unverified, say so and say what would verify it.
   Note explicitly anything you could not check.

---

## 9. Current state and what is next

M0 is complete. The foundation in place:

- Money type + deterministic allocation (property-tested).
- Document envelope with mandatory `branchId`; `_id` conventions.
- `DbAdapter` interface + **both** implementations — in-memory and PouchDB
  (`src/core/db/pouch-adapter.ts`), sharing one contract suite in
  `src/core/db/__tests__/adapter-contract.ts`.
- Design tokens + CSS mirror; vi/en i18n with key parity.
- Tauri 2 shell (builds and links) and axum `GET /api/health`.
- Hub sidecar with a CouchDB-compatible API and regression tests.
- Two terminals sync through the hub — the M0 acceptance test proves it.
- CI for both the web and Rust jobs.

**Next up — M1 (Type Registry):** the plan is at
`docs/superpowers/plans/2026-10-20-m1-type-registry.md`. It covers the type-definition model,
field-type registry, validation, formula interpreter, schema migration, and the Type Designer
UI. UI tasks are built on **Vuetify0** — see 4.8.

**Not yet built** (do not assume these exist): feature UI (catalog, orders, tables, QR, KDS),
hub authentication, LAN/WebSocket endpoints beyond health, branch switching, inventory,
reporting. See "Known limitations" in the README and §9 of the design spec.
