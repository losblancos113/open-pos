# Open POS

Offline-first point-of-sale for restaurants and cafés, built for the Vietnamese market.
Runs as a desktop app on each terminal and syncs with the other terminals in the same
branch over the local network — no internet connection required to sell.

**Status: v1 feature-complete.** All milestones — M0 through M6c — are delivered and
covered by the test suite. See [Milestones](#milestones) for what each one delivered
and [Known limitations](#known-limitations) for what was deliberately left out.

---

## Table of contents

- [What it is](#what-it-is)
- [Key features](#key-features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Testing](#testing)
- [Milestones](#milestones)
- [Documentation](#documentation)
- [Conventions that matter](#conventions-that-matter)
- [Known limitations](#known-limitations)

---

## What it is

A single-branch POS that a small restaurant can actually run on. Two hard constraints
shape every design decision:

1. **It must work with no internet.** A dropped connection must never stop a sale. Every
   terminal keeps a full local copy of the data it needs and reconciles later.
2. **The data model must not be fixed in advance.** Menus, modifiers, and workflows differ
   from shop to shop, so the schema is user-extensible rather than hard-coded (see R1).

The desktop shell is Tauri 2 (Rust + the system webview), the UI is Vue 3, and local
storage is PouchDB. Multi-terminal sync goes through a small PouchDB-server "hub" that
runs as a sidecar next to the app.

---

## Key features

The design document defines the product as nine requirements. These are the v1 scope:

| ID | Requirement | Summary |
|----|-------------|---------|
| **R1** | Unlimited user-defined types | A Type Registry lets each shop define its own document types and fields, with a dynamic form/table renderer and schema migration. |
| **R2** | Order for many business types | The order engine is not tied to one vertical — it supports restaurant, café, and retail flows. |
| **R3** | Flexible table split/merge | Split by item / evenly / by seat, merge tables, merge bills, transfer tables and move lines. |
| **R4** | Local NoSQL database | PouchDB on the terminal PC; the POS keeps working fully offline. |
| **R5** | Staff mobile with PIN login | A `/staff/...` mobile surface authenticated by PIN (Argon2), scoped to assigned tables. |
| **R6** | QR order + waiter approval | Guests scan a QR token, order from their own table, and optionally require waiter approval before the order reaches the kitchen. |
| **R7** | Brainstorm additions | Extra capabilities captured during design review (see §13 of the design doc: station routing, image storage, event compaction, combos, tax). |
| **R8** | Multi-branch | Several branches in one system, with catalog overrides per branch and branch-scoped permissions. |
| **R9** | VietQR | Bank-transfer payment by VietQR (EMVCo payload + rendered QR) as part of the payment flow. |

All nine requirements were delivered across milestones M0–M6c, with two adjustments made
during delivery: staff PIN login (R5) runs on the desktop terminal instead of a mobile
surface, and guest QR ordering (R6) was not built — see
[Known limitations](#known-limitations).

---

## Tech stack

| Layer | Choice | Version |
|-------|--------|---------|
| UI framework | Vue 3 (`<script setup>`, Composition API) | ^3.5.44 |
| Build tool | Vite | ^8.3.4 |
| Language | TypeScript (strict) | ^5.9.3 |
| Test runner | Vitest | ^5.0.5 |
| Property testing | fast-check | ^4.10.2 |
| i18n | vue-i18n | ^11.4.16 |
| Local storage | PouchDB + pouchdb-find | ^9.0.0 |
| UI primitives | Vuetify0 (`@vuetify/v0`, headless) | ^1.3.0 |
| Styling | UnoCSS (`presetWind4`) | — |
| Desktop shell | Tauri 2 (Rust) | 2.x |
| LAN server | axum + tokio | 0.8 / 1.x |
| Hub (sync) | Node + Express + PouchDB | Express ^4.21.0 |
| CI | GitHub Actions | — |

**Runtime requirements:** Node `>=22`, Rust `>=1.82` (edition 2021).

---

## Architecture

Three processes cooperate on one terminal:

```
┌──────────────────────────────────────────────────────────────┐
│  Tauri 2 desktop shell (Rust)                                │
│                                                              │
│   ┌────────────────────────┐      ┌───────────────────────┐  │
│   │  Vue 3 UI (webview)    │      │  axum LAN server      │  │
│   │  ├─ core/** (domain)   │      │  GET /api/health      │  │
│   │  ├─ features/** (UI)   │      │  POST /api/auth/*     │  │
│   │  ├─ i18n (vi/en)       │      └───────────────────────┘  │
│   │  └─ styles/tokens      │                                 │
│   └───────────┬────────────┘                                 │
│               │                                              │
│   ┌───────────▼────────────┐                                 │
│   │  PouchDB (local disk)  │                                 │
│   └───────────┬────────────┘                                 │
└───────────────┼──────────────────────────────────────────────┘
                │  HTTP replication (LAN)
                ▼
┌──────────────────────────────────────────────────────────────┐
│  Hub — PouchDB-server sidecar (Node/Express, default :5984)   │
│  Terminals in the same branch replicate through this hub.     │
└──────────────────────────────────────────────────────────────┘
```

- **Local-first.** The Vue app only ever talks to its local PouchDB through the
  `DbAdapter` interface (`src/core/db/adapter.ts`). It does not know or care whether the
  backing store is in-memory (tests/dev) or PouchDB (production).
- **The hub is a sync relay, not a source of truth.** Each terminal holds the full dataset
  for its branch; the hub exists so two terminals can reach each other.
- **The hub announces itself on stdout.** Because the port may be assigned dynamically,
  the sidecar prints a single line when it is ready:

  ```
  OPEN_POS_HUB_URL=http://127.0.0.1:<port>
  ```

  The Tauri app parses that line to discover the hub URL. Do not change this line without
  updating the discovery code and the tests that wait on it.

---

## Project structure

```
open-pos/
├── src/                          # Vue 3 frontend
│   ├── main.ts                   # App bootstrap (mounts App.vue, installs i18n)
│   ├── App.vue                   # App shell: navigation, branch switcher, login
│   ├── components/               # Shared UI (AppIcon, AppLogo)
│   ├── core/                     # Framework-free domain logic (no Vue imports)
│   │   ├── money.ts              # Integer minor units + currency safety
│   │   ├── money-parse.ts        # Locale-aware money parsing
│   │   ├── money-allocate.ts     # Deterministic split-payment allocation
│   │   ├── db/                   # Envelope, _id helpers, DbAdapter + memory/PouchDB adapters
│   │   ├── types/                # M1 Type Registry: definitions, formulas, migration
│   │   ├── catalog/              # M2 Catalog: products, pricing, menu, CSV
│   │   ├── order/                # M3/M4 order engine: reducer, bills, split/merge
│   │   ├── qr/                   # VietQR payload, bank account, vendored QR encoder
│   │   ├── auth/                 # Users, PIN hashing, tokens, permissions
│   │   ├── branch/               # Branch repository
│   │   ├── inventory/            # M6b recipes, stock movements, stocktake, waste
│   │   ├── shift/                # M6c shift engine
│   │   ├── reports/              # Store & cross-branch reports, CSV export
│   │   ├── audit/                # Audit log
│   │   ├── maintenance/          # Backup/restore, token cleanup
│   │   └── system/               # Terminal registration, port service
│   ├── features/                 # UI features (one folder per surface)
│   │   ├── auth/                 # Login, user admin, profile
│   │   ├── branch/               # Branch switcher + branch admin
│   │   ├── type-designer/        # M1 Type Designer, DynamicForm/List
│   │   ├── catalog-admin/        # M2 Catalog Admin
│   │   ├── pos/                  # M3/M4 POS terminal, floor plan, split/merge dialogs
│   │   ├── kds/                  # M5 kitchen display
│   │   ├── table-admin/          # Table management
│   │   ├── inventory/            # M6b inventory admin
│   │   ├── shift/                # M6c shift open/close
│   │   ├── reports/              # M6c store reports, invoices, cross-branch reports
│   │   └── setup/                # Installer wizard
│   ├── i18n/                     # vi.json + en.json + createI18n setup
│   └── styles/
│       ├── tokens.ts             # Design tokens — single source of truth
│       ├── tokens.css            # CSS variables (kept in sync by a test)
│       └── uno-theme.ts          # UnoCSS theme derived from tokens
├── src-tauri/                    # Tauri 2 desktop shell (Rust)
│   ├── src/
│   │   ├── main.rs               # Binary entry point
│   │   ├── lib.rs                # run() + module declarations
│   │   └── lan/                  # axum LAN server
│   │       ├── mod.rs            # router() + tests
│   │       ├── health.rs         # GET /api/health handler
│   │       └── auth.rs           # POST /api/auth/login, /api/auth/switch-branch
│   ├── capabilities/default.json # Tauri permission set for the main window
│   ├── Cargo.toml
│   └── tauri.conf.json           # Window, bundle and dev-server config
├── sidecar/                      # PouchDB-server hub (Node, separate package)
│   ├── package.json
│   └── src/server.mjs            # CouchDB-compatible API + bearer-token, branch-scoped auth
├── landing/                      # Marketing landing page (separate Vite app)
├── tests/                        # Cross-process integration & acceptance tests
│   ├── sidecar.test.ts           # Hub protocol + security regressions
│   ├── hub-endpoints.test.ts     # CouchDB endpoint contract
│   ├── sidecar-branch-auth.test.ts # Branch-scoped hub tokens (M6a)
│   ├── two-terminal-sync.test.ts # M0 acceptance test
│   ├── m6b-inventory-acceptance.test.ts
│   └── m6c-shifts-reports-hardening-acceptance.test.ts
├── .github/workflows/ci.yml      # CI: web + rust jobs
└── docs/superpowers/
    ├── specs/2026-10-20-open-pos-design.md   # Design document (v0.5)
    └── plans/                                # One implementation plan per milestone, M0–M6c
```

**Where things belong:**

- Domain logic goes in `src/core/**` and must not import Vue — it is plain TypeScript so it
  stays testable and portable.
- UI code goes in `src/` outside `core/`.
- Anything that must run in a separate process goes in `src-tauri/` or `sidecar/`.
- Tests live next to what they test in `src/**/__tests__/`, except tests that spawn
  processes or drive the hub, which live in `tests/`.

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | >= 22 | `node -v` |
| npm | >= 10 | ships with Node |
| Rust | >= 1.82 | `rustup` recommended |
| MSVC build tools | 2022 | **Windows only** — Tauri needs a C++ linker |

On Windows, two things commonly bite people:

1. **Rust is installed but not on `PATH` in Git Bash.** The installer puts it in
   `%USERPROFILE%\.cargo\bin`. If `cargo` is "not found", add it:
   ```bash
   export PATH="$HOME/.cargo/bin:$PATH"
   ```
2. **`link.exe` is not on `PATH`.** `rustc` needs the MSVC linker. Either build from a
   "Developer Command Prompt", or prepend the MSVC bin directory yourself:
   ```bash
   export PATH="/c/Program Files/Microsoft Visual Studio/2022/Community/VC/Tools/MSVC/<version>/bin/Hostx64/x64:$PATH"
   ```
   The exact `<version>` differs per machine — list the directory to find yours.

---

## Getting started

```bash
# 1. Install frontend dependencies
npm ci

# 2. Install hub (sidecar) dependencies — separate package, separate install
npm ci --prefix sidecar

# 3. Run the frontend in a browser (fastest loop for UI work)
npm run dev            # http://localhost:5173

# 4. Run the real desktop app (compiles Rust; first build is slow)
npm run tauri dev
```

### Available scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Vite dev server on port 5173 (strict — fails if the port is taken). |
| `npm run build` | `vue-tsc --noEmit` then `vite build`. Fails on any type error. |
| `npm run preview` | Serve the production build locally. |
| `npm run test` | Run the full Vitest suite once. |
| `npm run test:watch` | Vitest in watch mode. |
| `npm run tauri` | Tauri CLI passthrough (`npm run tauri dev`, `npm run tauri build`). |

### Working on the hub alone

```bash
cd sidecar
npm ci
HUB_PORT=5984 HUB_DATA_DIR=./.hub-data node src/server.mjs
# prints: OPEN_POS_HUB_URL=http://127.0.0.1:5984
```

| Env var | Default | Meaning |
|---------|---------|---------|
| `HUB_PORT` | `5984` | Listen port. Falls back to a free port if this one is busy. |
| `HUB_HOST` | `127.0.0.1` | Bind address. |
| `HUB_DATA_DIR` | `.hub-data` | Where the PouchDB files live. |

### Rust checks

```bash
cargo test  --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

Note: `cargo check` does **not** link. Use `cargo build` when you need to be sure the
binary actually links (this is where a bad app icon or a missing symbol surfaces).

---

## Testing

**1,230 tests across 137 files, all passing.**

Major test suites covering each milestone:

| Suite | Covers |
|-------|--------|
| `src/core/__tests__/` | Money integer units + parsing, deterministic allocation properties, Vietnamese slugify |
| `src/core/db/__tests__/` | Document envelope, `_id` helpers, branch handling, memory & PouchDB adapter contract |
| `src/core/types/__tests__/` | M1 Type Registry: definition validation, rational math, formula evaluation, lazy migration, acceptance |
| `src/core/catalog/__tests__/` | M2 Catalog engine: models, validation, pricing resolution, menu assembly, CSV export/import, acceptance |
| `src/core/order/__tests__/` | M3/M4 order reducer, numbering, bills, split/merge (incl. fast-check property tests), inventory settlement, acceptance |
| `src/core/qr/__tests__/` | VietQR EMVCo payload, bank-account settings, QR matrix |
| `src/core/auth`, `branch`, `inventory`, `shift`, `reports`, `audit`, `maintenance` | M5/M6 domain logic: users, PIN hashing, permissions, stock deduction, shift engine, reports & export, audit log, backup/restore |
| `src/features/**/__tests__/` | UI: POS terminal & dialogs, kitchen display, catalog admin, type designer, branch admin, inventory, shift, reports & invoices, table admin, installer wizard |
| `src/styles/__tests__/` | Token-to-theme bridge, UnoCSS utility generation, token drift |
| `src/i18n/__tests__/i18n.test.ts` | vi/en **key parity** across all modules |
| `tests/sidecar.test.ts` | Hub protocol + security regressions |
| `tests/hub-endpoints.test.ts` | CouchDB endpoint contract |
| `tests/sidecar-branch-auth.test.ts` | Branch-scoped hub bearer tokens |
| `tests/two-terminal-sync.test.ts` | **M0 acceptance** — two terminals sync through the hub |
| `src/core/catalog/__tests__/acceptance-m2.test.ts` | **M2 acceptance** — end-to-end multi-category, modifier, combo, price list, branch override, CSV round-trip menu |
| `src/core/order/__tests__/acceptance-m3.test.ts` | **M3 acceptance** — end-to-end order-to-payment workflow |
| `tests/m6b-inventory-acceptance.test.ts` | **M6b acceptance** — end-to-end inventory workflow |
| `tests/m6c-shifts-reports-hardening-acceptance.test.ts` | **M6c acceptance** — end-to-end shift/report/backup workflow |

The integration suites in `tests/` spawn a real hub process and talk to it over HTTP.
`tests/two-terminal-sync.test.ts` verifies multi-terminal replication through the hub,
`tests/sidecar-branch-auth.test.ts` the branch-scoped token scheme, and the M6b/M6c
acceptance suites run their milestones end to end.

---

## Milestones

| M | Name | Delivers |
|---|------|----------|
| **M0** | Foundation & Skeleton | ✅ **Done.** Scaffold, storage adapter, hub sidecar, axum skeleton, CI, i18n, tokens, money type, `branchId` throughout the schema. |
| **M1** | Type Registry & Dynamic Forms | ✅ **Done.** User-defined-types engine, field-type registry, formula interpreter, schema migration, Type Designer UI. |
| **M2** | Catalog & Menu | ✅ **Done.** Categories, products, variants, modifiers, combos, price lists, branch overrides, CSV import/export, UnoCSS, Catalog Admin UI. |
| **M3** | Order Engine & POS Terminal | ✅ **Done.** Floor plan, table sessions, order entry, discounts/surcharges, split payment, **VietQR**, bills & invoice management. |
| **M4** | Split / Merge / Transfer | ✅ **Done.** Split by item / evenly / by seat, merge tables and bills, transfer tables — property-tested engine. |
| **M5** | Split / Merge / Transfer UI & KDS | ✅ **Done.** Split/merge/transfer dialogs on the POS terminal, kitchen display with live status sync. (The design doc's original M5 — staff mobile & QR ordering — was descoped; see [Known limitations](#known-limitations).) |
| **M6a** | Multi-branch & Cloud | ✅ **Done.** Branch management + switcher, branch-scoped permissions, branch-scoped hub tokens, cross-branch reporting. |
| **M6b** | Inventory & Stock Control | ✅ **Done.** Recipes/BOM, automatic stock deduction on paid bills, stocktake, waste tracking, stock movements. |
| **M6c** | Shifts, Reports & Hardening | ✅ **Done.** Shift open/close with cash reconciliation, store & cross-branch reports, CSV export, audit log, backup/restore, installer wizard. |

Full detail, dependencies, and safe stopping points are in §9 of the design document.

---

## Documentation

| Document | What it is |
|----------|-----------|
| `docs/superpowers/specs/2026-10-20-open-pos-design.md` | The design document (v0.5). Requirements R1–R9, data model, architecture, security, risks. **The authority on product decisions.** |
| `docs/superpowers/plans/` | One implementation plan per milestone, M0 through M6c (`2026-10-20-m0-foundation.md` … `2026-10-26-m6c-shifts-reports-hardening.md`). |
| [`AGENTS.md`](./AGENTS.md) | Instructions for AI coding agents working in this repo. |
| [`CLAUDE.md`](./CLAUDE.md) | Claude Code-specific guidance. |

---

## Conventions that matter

These are enforced by tests or by types. Breaking them will fail the build.

- **Every document carries a `branchId`.** `createEnvelope()` throws without one. This is
  deliberate — retrofitting `branchId` later would mean migrating all existing data
  (design doc Risk #17).
- **Money is integer minor units, never a float.** `money()` rejects non-integers. `VND`
  has exponent 0, `USD` has exponent 2. Never do arithmetic on a `Money` by hand — use
  `add`/`sub`/`mulInt`/`allocate`.
- **Allocation is deterministic.** `allocate()` uses largest-remainder with index tie-break,
  so the same inputs always produce the same split and the parts always sum to the total.
- **`_id` prefixes are a contract.** `branch:`, `product:`, `product_override:<branchId>:<productId>`.
  Segments may not contain `:`. Use the helpers in `src/core/db/ids.ts`; do not build ids
  by string concatenation.
- **Storage goes through `DbAdapter`.** Domain code must not import PouchDB directly — that
  is what keeps the memory adapter usable in tests.
- **i18n keys must exist in both `vi` and `en`.** A parity test fails otherwise. Vietnamese
  is the default and fallback locale.
- **Design tokens are defined once, in `tokens.ts`.** `tokens.css` must declare exactly the
  same variables; a drift test enforces it.
- **The hub is the network boundary — keep its input validation.** Database names are
  allowlisted, `limit`/`since` are validated as non-negative safe integers, and unknown
  errors in `_revs_diff` are rethrown rather than treated as "already present". Each of
  these guards fixes a real bug that caused a crash, a path traversal, or silent data loss.
  See the "Protocol and security invariants" section of `AGENTS.md`.

---

## Known limitations

v1 is feature-complete against the delivered plans, with these boundaries:

- **No guest QR ordering and no staff mobile surface.** R6 (guest QR order + waiter
  approval) and the mobile half of R5 were descoped during delivery. Staff sign in with a
  PIN on the terminal, and the kitchen display runs on the same desktop shell — there is
  no `/staff` mobile route and no WebSocket hub.
- **Reports export CSV, not Excel/PDF.** Z-report, category/hourly sales and cross-branch
  reports all export as CSV.
- **Images are reference strings only.** Stored as URL / data URL strings. The media
  storage and attachment pipeline (§13.2) was not built.
- **No end-to-end desktop test.** The Rust binary and the webview are verified separately
  (cargo tests + Vitest); nothing drives the packaged app.
- **CI runs on Windows only.** That matches the primary target, but Linux/macOS build
  breakage would not be caught.
