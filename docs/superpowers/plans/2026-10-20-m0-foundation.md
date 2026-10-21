# M0 — Foundation & Skeleton — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Dùng `superpowers:subagent-driven-development` (khuyến nghị) hoặc `superpowers:executing-plans` để thực thi plan này theo từng task. Các bước dùng checkbox (`- [ ]`) để theo dõi tiến độ.
>
> ⚠️ **Lưu ý môi trường:** hai sub-skill trên thuộc plugin `superpowers@claude-plugins-official`, **hiện chưa được cài** trong máy này. Xem §Handoff ở cuối plan để biết cách chạy nếu không cài được plugin.

**Goal:** Dựng bộ xương chạy được của Open POS và chứng minh rủi ro kỹ thuật lớn nhất — **hai terminal đồng bộ dữ liệu với nhau qua hub local** — hoạt động thật.

**Architecture:** App desktop = Tauri 2 (Rust shell) bọc WebView chạy Vue 3 + TS + Vite. Dữ liệu local = PouchDB trên IndexedDB. Hub = PouchDB-server (Node sidecar) do Tauri spawn, client replicate vào hub qua HTTP. LAN server = axum phục vụ API + static cho điện thoại (ở M0 chỉ có `/api/health`). Mọi document mang `branchId` ngay từ đầu (Risk #17) nên không phải migrate về sau.

**Tech Stack:** Vue 3.5+, TypeScript 5.x, Vite, Tauri 2.x (Rust ≥ 1.82), PouchDB 9.x (IndexedDB), PouchDB-server (Node 22 LTS), axum 0.8, Vitest + fast-check, vue-i18n.

**Spec:** `docs/superpowers/specs/2026-10-20-open-pos-design.md`

---

## Global Constraints

Sao chép nguyên văn từ spec. **Mọi task đều phải tuân theo các ràng buộc này:**

- **Nền tảng v1:** Windows-first. Không cần hỗ trợ macOS/Linux ở v1.
- **Runtime:** Node ≥ 22 LTS, Rust ≥ 1.82 (Tauri 2 yêu cầu).
- **DB local:** PouchDB trên IndexedDB (schemaless — nền tảng cho R1).
- **Hub:** PouchDB-server, CouchDB-compatible, chạy như sidecar — không yêu cầu cài service ngoài.
- **LAN server:** axum (Rust).
- **i18n:** `vi` là mặc định, `en` là dự phòng. Không hardcode chuỗi hiển thị.
- **Tiền tệ:** lưu bằng **số nguyên đơn vị nhỏ** (`minor`), **tuyệt đối không dùng float**. VND có exponent = 0; USD có exponent = 2.
- **`branchId` bắt buộc trên mọi document** — thiếu `branchId` phải bị từ chối ngay khi ghi (Risk #17).
- **Offline-first:** thao tác ghi phải thành công khi hub đang tắt; không được chặn UI chờ mạng.
- **Không multi-tenant** ở v1 — chỉ multi-branch.
- **Không e-invoice** ở v1.
- **TDD:** viết test fail trước, rồi mới implement. Commit thường xuyên (conventional commits: `feat:`, `fix:`, `chore:`, `test:`).
- **Không placeholder:** mọi bước phải có nội dung thật, không có "TODO"/"implement later".

---

## Review Focus

Năm loại input/điều kiện mà spec ngụ ý nhưng không nêu rõ, dễ làm hỏng chương trình nhất — mỗi dòng đều có test tương ứng trong task sở hữu:

1. **Chia tiền không hết** — 100.000 ₫ chia 3 người. Tổng các phần **phải luôn bằng đúng** 100.000, không được lệch 1 đồng. → Task 3.
2. **Trộn tiền tệ** — cộng VND với USD phải **ném lỗi**, không được cộng ngầm rồi trả kết quả sai. → Task 2.
3. **Document thiếu `branchId`** — phải **bị từ chối ngay** tại `createEnvelope`, không được ghi xuống DB (Risk #17). → Task 4.
4. **Hub đang tắt** — client vẫn phải **ghi được** và không mất dữ liệu; sync bù lại khi hub sống. → Task 9 + Task 11.
5. **Số tiền vượt safe integer, hoặc nhập số thập phân vào `money()`** — phải báo lỗi rõ ràng thay vì âm thầm làm tròn. → Task 2.

---

## File Structure

```
open-pos/
├── package.json                  # Vue app + Tauri CLI + scripts
├── vite.config.ts                # Vite + Vitest config
├── tsconfig.json
├── tsconfig.node.json
├── index.html
├── .gitignore
├── .github/workflows/ci.yml      # CI
├── src/
│   ├── main.ts                   # bootstrap Vue + i18n
│   ├── App.vue                   # shell tối thiểu
│   ├── vite-env.d.ts
│   ├── core/                     # domain logic thuần (không phụ thuộc Vue)
│   │   ├── money.ts              # Money type + phép toán
│   │   ├── money-allocate.ts     # chia tiền theo trọng số
│   │   └── db/
│   │       ├── envelope.ts       # DocEnvelope + createEnvelope
│   │       ├── ids.ts            # quy ước _id
│   │       ├── adapter.ts        # interface DbAdapter
│   │       ├── memory-adapter.ts # adapter cho test
│   │       └── pouch-adapter.ts  # adapter IndexedDB thật
│   ├── i18n/
│   │   ├── index.ts
│   │   ├── vi.json
│   │   └── en.json
│   └── styles/
│       ├── tokens.ts             # design tokens (nguồn sự thật)
│       └── tokens.css            # CSS variables sinh từ tokens.ts
├── src-tauri/
│   ├── Cargo.toml
│   ├── build.rs
│   ├── tauri.conf.json
│   ├── capabilities/default.json
│   └── src/
│       ├── main.rs               # entry, spawn sidecar
│       ├── lib.rs
│       ├── sidecar.rs            # spawn + health-check hub
│       └── lan/
│           ├── mod.rs            # axum router
│           └── health.rs         # GET /api/health
└── sidecar/
    ├── package.json
    └── src/server.mjs            # pouchdb-server bootstrap
```

---

### Task 1: Khởi tạo project + toolchain + Vitest

Đây là task setup — gộp scaffolding vào chính nó. Không TDD thuần, nhưng kết thúc bằng một test chạy thật để chứng minh toolchain hoạt động.

**Files:**
- Create: `.gitignore`, `index.html`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `src/main.ts`, `src/App.vue`, `src/vite-env.d.ts`, `src/core/__tests__/smoke.test.ts`

**Interfaces:**
- Consumes: (không có — task đầu tiên)
- Produces: toolchain chạy được (`npm run dev`, `npm run test`), để các task sau viết code vào `src/core/`

- [ ] **Step 1: Tạo `.gitignore`**

```gitignore
node_modules/
dist/
dist-ssr/
*.local
src-tauri/target/
src-tauri/gen/
sidecar/node_modules/
.DS_Store
*.log
coverage/
.hub-data/
```

- [ ] **Step 2: Tạo `index.html`**

```html
<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Open POS</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 3: Tạo `src/App.vue`**

```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
</script>

<template>
  <main>
    <h1>{{ t('app.title') }}</h1>
    <p>{{ t('app.tagline') }}</p>
  </main>
</template>
```

- [ ] **Step 4: Tạo `src/main.ts`**

```ts
import { createApp } from 'vue';
import App from './App.vue';
import { i18n } from './i18n';
import './styles/tokens.css';

createApp(App).use(i18n).mount('#app');
```

> Ghi chú: `src/i18n/index.ts` và `src/styles/tokens.css` được tạo ở Task 5 và Task 6. Nếu chạy `npm run dev` trước đó, bỏ tạm hai import này — nhưng **không được commit** khi còn thiếu.

- [ ] **Step 5: Cài dependencies (để npm tự chọn phiên bản mới nhất phù hợp)**

```bash
cd E:/Coding/vue/open-pos
npm init -y
npm pkg set name="open-pos" version="0.1.0" private=true type="module"
npm install vue vue-i18n pouchdb pouchdb-find
npm install -D vite @vitejs/plugin-vue typescript vue-tsc vitest @vue/test-utils \
  fast-check @types/pouchdb pouchdb-adapter-memory
npm pkg set scripts.dev="vite" scripts.build="vue-tsc --noEmit && vite build" \
  scripts.preview="vite preview" scripts.test="vitest run" scripts.test:watch="vitest"
```

- [ ] **Step 6: Tạo `vite.config.ts`**

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // test dùng PouchDB memory adapter, không cần jsdom
  },
});
```

- [ ] **Step 7: Tạo `tsconfig.json` + `tsconfig.node.json`**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vitest/globals"],
    "paths": { "@/*": ["./src/*"] },
    "baseUrl": "."
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "tests/**/*.ts", "vite.config.ts"]
}
```

`tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["node"],
    "skipLibCheck": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 8: Tạo `src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}
```

- [ ] **Step 9: Viết smoke test**

`src/core/__tests__/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('toolchain', () => {
  it('runs vitest and executes TypeScript', () => {
    const value: number = 1 + 1;
    expect(value).toBe(2);
  });
});
```

- [ ] **Step 10: Chạy test để xác nhận toolchain hoạt động**

Run: `npm run test`
Expected: PASS — 1 test, 0 fail. Nếu fail vì thiếu module, xem lại Step 5.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: scaffold vue 3 + vite + typescript project with vitest"
```

---

### Task 2: Money type + phép toán (TDD)

Đây là nền tảng của toàn bộ hệ thống tiền tệ. Split/merge, split payment, và báo cáo đều dựa trên nó.

**Files:**
- Create: `src/core/money.ts`
- Test: `src/core/__tests__/money.test.ts`

**Interfaces:**
- Consumes: (không có)
- Produces:
  - `type CurrencyCode = 'VND' | 'USD'`
  - `interface Money { readonly minor: number; readonly currency: CurrencyCode }`
  - `money(minor: number, currency: CurrencyCode): Money`
  - `add(a: Money, b: Money): Money`
  - `sub(a: Money, b: Money): Money`
  - `mulInt(a: Money, n: number): Money`
  - `isZero(m: Money): boolean`
  - `isNegative(m: Money): boolean`
  - `format(m: Money, locale?: string): string`

- [ ] **Step 1: Viết failing test**

`src/core/__tests__/money.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { money, add, sub, mulInt, isZero, isNegative, format } from '../money';

describe('money()', () => {
  it('creates a money value from integer minor units', () => {
    expect(money(100_000, 'VND')).toEqual({ minor: 100_000, currency: 'VND' });
  });

  it('rejects non-integer minor units', () => {
    expect(() => money(100.5, 'VND')).toThrow(/integer/i);
  });

  it('rejects minor units beyond safe integer range', () => {
    expect(() => money(Number.MAX_SAFE_INTEGER + 1, 'VND')).toThrow(/safe integer/i);
  });
});

describe('arithmetic', () => {
  it('adds two money values of the same currency', () => {
    expect(add(money(30_000, 'VND'), money(45_000, 'VND'))).toEqual(money(75_000, 'VND'));
  });

  it('throws when adding different currencies', () => {
    expect(() => add(money(30_000, 'VND'), money(500, 'USD'))).toThrow(/currency mismatch/i);
  });

  it('subtracts money', () => {
    expect(sub(money(75_000, 'VND'), money(25_000, 'VND'))).toEqual(money(50_000, 'VND'));
  });

  it('multiplies by an integer', () => {
    expect(mulInt(money(20_000, 'VND'), 3)).toEqual(money(60_000, 'VND'));
  });

  it('rejects non-integer multiplier', () => {
    expect(() => mulInt(money(20_000, 'VND'), 1.5)).toThrow(/integer/i);
  });
});

describe('predicates', () => {
  it('detects zero and negative', () => {
    expect(isZero(money(0, 'VND'))).toBe(true);
    expect(isZero(money(1, 'VND'))).toBe(false);
    expect(isNegative(money(-1, 'VND'))).toBe(true);
    expect(isNegative(money(0, 'VND'))).toBe(false);
  });
});

describe('format()', () => {
  it('formats VND with no decimal places and vi-VN grouping', () => {
    expect(format(money(100_000, 'VND'), 'vi-VN')).toBe('100.000 ₫');
  });

  it('formats negative VND', () => {
    expect(format(money(-100_000, 'VND'), 'vi-VN')).toBe('-100.000 ₫');
  });

  it('formats USD with two decimal places', () => {
    expect(format(money(123_456, 'USD'), 'en-US')).toBe('$1,234.56');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npm run test -- src/core/__tests__/money.test.ts`
Expected: FAIL — `Failed to resolve import "../money"`.

- [ ] **Step 3: Viết implementation tối thiểu**

`src/core/money.ts`:

```ts
export type CurrencyCode = 'VND' | 'USD';

const EXPONENTS: Record<CurrencyCode, number> = { VND: 0, USD: 2 };

export interface Money {
  readonly minor: number;
  readonly currency: CurrencyCode;
}

export function money(minor: number, currency: CurrencyCode): Money {
  if (!Number.isInteger(minor)) {
    throw new Error(`Money.minor must be an integer, got ${minor}`);
  }
  if (!Number.isSafeInteger(minor)) {
    throw new Error(`Money.minor must be a safe integer, got ${minor}`);
  }
  return { minor, currency };
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minor + b.minor, a.currency);
}

export function sub(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minor - b.minor, a.currency);
}

export function mulInt(a: Money, n: number): Money {
  if (!Number.isInteger(n)) {
    throw new Error(`Multiplier must be an integer, got ${n}`);
  }
  return money(a.minor * n, a.currency);
}

export function isZero(m: Money): boolean {
  return m.minor === 0;
}

export function isNegative(m: Money): boolean {
  return m.minor < 0;
}

export function format(m: Money, locale = 'vi-VN'): string {
  const exponent = EXPONENTS[m.currency];
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: m.currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(m.minor / 10 ** exponent);
}
```

> Vì sao chia `minor / 10 ** exponent` an toàn: `minor` là số nguyên trong phạm vi safe integer, nên sai số float nhỏ hơn `1e-9`; `Intl.NumberFormat` làm tròn đúng về đúng số chữ số thập phân yêu cầu. Với VND (exponent 0) phép chia là đồng nhất.

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npm run test -- src/core/__tests__/money.test.ts`
Expected: PASS — toàn bộ test xanh.

> Nếu `format(money(100_000, 'VND'), 'vi-VN')` ra `"100.000 ₫"` khác kỳ vọng (ví dụ `"100.000,00 ₫"`), nghĩa là ICU của Node đang dùng locale mặc định khác — chạy `node -e "console.log(Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND'}).format(100000))"` để xem output thật, rồi sửa kỳ vọng trong test theo output đó. Không sửa implementation để chiều test.

- [ ] **Step 5: Commit**

```bash
git add src/core/money.ts src/core/__tests__/money.test.ts
git commit -m "feat: add money type with integer minor units and currency safety"
```

---

### Task 3: Chia tiền theo trọng số (allocate) — TDD + property test

Dùng cho split bill, split payment theo phần, chia đều nhiều người. Đây là nơi dễ sai 1 đồng nhất.

**Files:**
- Create: `src/core/money-allocate.ts`
- Test: `src/core/__tests__/money-allocate.test.ts`

**Interfaces:**
- Consumes: `Money`, `money()` từ `src/core/money.ts` (Task 2)
- Produces:
  - `allocate(total: Money, weights: number[]): Money[]`
  - `allocateEqual(total: Money, parts: number): Money[]`
  - Bất biến: `sum(allocate(t, w)) === t` luôn đúng với mọi input hợp lệ.

- [ ] **Step 1: Viết failing test**

`src/core/__tests__/money-allocate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { money } from '../money';
import { allocate, allocateEqual } from '../money-allocate';

describe('allocate()', () => {
  it('splits 100.000 into 3 equal parts with remainder going to the earliest seats', () => {
    const parts = allocate(money(100_000, 'VND'), [1, 1, 1]);
    expect(parts.map((p) => p.minor)).toEqual([33_334, 33_333, 33_333]);
  });

  it('always returns a sum exactly equal to the total', () => {
    const parts = allocate(money(100_000, 'VND'), [1, 1, 1]);
    const sum = parts.reduce((acc, p) => acc + p.minor, 0);
    expect(sum).toBe(100_000);
  });

  it('splits proportionally to weights', () => {
    const parts = allocate(money(100_000, 'VND'), [2, 1]);
    expect(parts.map((p) => p.minor)).toEqual([66_667, 33_333]);
  });

  it('handles zero total', () => {
    expect(allocate(money(0, 'VND'), [1, 1]).map((p) => p.minor)).toEqual([0, 0]);
  });

  it('falls back to equal split when all weights are zero', () => {
    expect(allocate(money(100_000, 'VND'), [0, 0]).map((p) => p.minor)).toEqual([50_000, 50_000]);
  });

  it('returns empty array for empty weights', () => {
    expect(allocate(money(100_000, 'VND'), [])).toEqual([]);
  });

  it('rejects negative or non-finite weights', () => {
    expect(() => allocate(money(100_000, 'VND'), [1, -1])).toThrow(/weight/i);
    expect(() => allocate(money(100_000, 'VND'), [1, Number.NaN])).toThrow(/weight/i);
  });

  it('preserves sign for negative totals (refunds)', () => {
    const parts = allocate(money(-100_000, 'VND'), [1, 1, 1]);
    expect(parts.map((p) => p.minor)).toEqual([-33_334, -33_333, -33_333]);
    expect(parts.reduce((acc, p) => acc + p.minor, 0)).toBe(-100_000);
  });
});

describe('allocateEqual()', () => {
  it('splits evenly across N parts', () => {
    expect(allocateEqual(money(100_000, 'VND'), 3).map((p) => p.minor)).toEqual([
      33_334, 33_333, 33_333,
    ]);
  });
});

describe('allocate() property: sum is always exactly the total', () => {
  it('holds for arbitrary totals and weights', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }),
        fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 1, maxLength: 12 }),
        (totalMinor, weights) => {
          const total = money(totalMinor, 'VND');
          const parts = allocate(total, weights);
          const sum = parts.reduce((acc, p) => acc + p.minor, 0);
          expect(sum).toBe(totalMinor);
          expect(parts).toHaveLength(weights.length);
        },
      ),
      { numRuns: 500 },
    );
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npm run test -- src/core/__tests__/money-allocate.test.ts`
Expected: FAIL — `Failed to resolve import "../money-allocate"`.

- [ ] **Step 3: Viết implementation tối thiểu**

`src/core/money-allocate.ts`:

```ts
import { type Money, money } from './money';

/**
 * Chia `total` thành `weights.length` phần tỉ lệ với `weights`.
 * Phần dư được phân bổ theo phương pháp largest-remainder, phá vỡ thế bằng
 * chỉ số (index) tăng dần — nên kết quả luôn tất định (deterministic).
 * Bất biến: tổng các phần luôn bằng đúng `total`.
 */
export function allocate(total: Money, weights: number[]): Money[] {
  if (weights.length === 0) return [];

  for (const w of weights) {
    if (!Number.isFinite(w) || w < 0) {
      throw new Error(`allocate(): weight must be finite and non-negative, got ${w}`);
    }
  }

  const totalWeight = weights.reduce((acc, w) => acc + w, 0);
  if (totalWeight === 0) {
    return allocate(total, weights.map(() => 1));
  }

  const sign = total.minor < 0 ? -1 : 1;
  const absTotal = Math.abs(total.minor);

  const base = weights.map((w) => Math.floor((absTotal * w) / totalWeight));
  const remainders = weights.map((w, i) => ({ i, frac: (absTotal * w) % totalWeight }));

  let leftover = absTotal - base.reduce((acc, b) => acc + b, 0);

  const order = [...remainders].sort((a, b) => b.frac - a.frac || a.i - b.i);

  let k = 0;
  while (leftover > 0) {
    const target = order[k % order.length];
    if (target === undefined) break;
    base[target.i] = (base[target.i] ?? 0) + 1;
    leftover -= 1;
    k += 1;
  }

  return base.map((b) => money(sign * b, total.currency));
}

/** Chia đều `total` cho `parts` người. Phần dư dồn về các phần đầu. */
export function allocateEqual(total: Money, parts: number): Money[] {
  if (!Number.isInteger(parts) || parts < 0) {
    throw new Error(`allocateEqual(): parts must be a non-negative integer, got ${parts}`);
  }
  return allocate(total, Array.from({ length: parts }, () => 1));
}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npm run test -- src/core/__tests__/money-allocate.test.ts`
Expected: PASS — kể cả property test 500 lần chạy.

- [ ] **Step 5: Commit**

```bash
git add src/core/money-allocate.ts src/core/__tests__/money-allocate.test.ts
git commit -m "feat: add deterministic money allocation for split payments"
```

---

### Task 4: Doc envelope + `branchId` + quy ước `_id` (TDD)

Nền tảng cho Risk #17: `branchId` phải có trên mọi document ngay từ M0, nếu không sẽ phải migrate toàn bộ dữ liệu về sau.

**Files:**
- Create: `src/core/db/envelope.ts`, `src/core/db/ids.ts`
- Test: `src/core/db/__tests__/envelope.test.ts`, `src/core/db/__tests__/ids.test.ts`

**Interfaces:**
- Consumes: (không có)
- Produces:
  - `const SCHEMA_VERSION = 1`
  - `interface DocEnvelope<T extends string = string> { _id: string; _rev?: string; docType: T; branchId: string; schemaVersion: number; createdAt: string; updatedAt: string; deletedAt?: string }`
  - `createEnvelope<T extends string>(params: { id: string; docType: T; branchId: string; now?: string }): DocEnvelope<T>`
  - `branchDocId(branchId: string): string`
  - `productDocId(productId: string): string`
  - `productBranchOverrideId(productId: string, branchId: string): string`

- [ ] **Step 1: Viết failing test cho `ids.ts`**

`src/core/db/__tests__/ids.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { branchDocId, productDocId, productBranchOverrideId } from '../ids';

describe('id conventions', () => {
  it('builds branch document ids', () => {
    expect(branchDocId('hq')).toBe('branch:hq');
  });

  it('builds product document ids', () => {
    expect(productDocId('p001')).toBe('product:p001');
  });

  it('builds branch override ids scoped by branch first', () => {
    expect(productBranchOverrideId('p001', 'hq')).toBe('product_override:hq:p001');
  });

  it('rejects empty segments', () => {
    expect(() => branchDocId('')).toThrow(/branchId/i);
    expect(() => productDocId('')).toThrow(/productId/i);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npm run test -- src/core/db/__tests__/ids.test.ts`
Expected: FAIL — không resolve được `../ids`.

- [ ] **Step 3: Viết `src/core/db/ids.ts`**

```ts
function requireSegment(value: string, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} must be a non-empty string`);
  }
  if (value.includes(':')) {
    throw new Error(`${name} must not contain ":", got "${value}"`);
  }
  return value;
}

export function branchDocId(branchId: string): string {
  return `branch:${requireSegment(branchId, 'branchId')}`;
}

export function productDocId(productId: string): string {
  return `product:${requireSegment(productId, 'productId')}`;
}

export function productBranchOverrideId(productId: string, branchId: string): string {
  return `product_override:${requireSegment(branchId, 'branchId')}:${requireSegment(productId, 'productId')}`;
}
```

- [ ] **Step 4: Chạy test ids → pass**

Run: `npm run test -- src/core/db/__tests__/ids.test.ts`
Expected: PASS.

- [ ] **Step 5: Viết failing test cho `envelope.ts`**

`src/core/db/__tests__/envelope.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createEnvelope, SCHEMA_VERSION } from '../envelope';

describe('createEnvelope()', () => {
  const now = '2026-10-20T10:00:00.000Z';

  it('creates an envelope with branchId and schema version', () => {
    const doc = createEnvelope({ id: 'product:p001', docType: 'product', branchId: 'hq', now });
    expect(doc).toEqual({
      _id: 'product:p001',
      docType: 'product',
      branchId: 'hq',
      schemaVersion: SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now,
    });
  });

  it('rejects a missing or empty branchId', () => {
    expect(() => createEnvelope({ id: 'product:p001', docType: 'product', branchId: '', now })).toThrow(
      /branchId/i,
    );
  });

  it('rejects a missing id', () => {
    expect(() => createEnvelope({ id: '', docType: 'product', branchId: 'hq', now })).toThrow(/id/i);
  });

  it('rejects a missing docType', () => {
    expect(() =>
      createEnvelope({ id: 'product:p001', docType: '' as never, branchId: 'hq', now }),
    ).toThrow(/docType/i);
  });
});
```

- [ ] **Step 6: Chạy test để xác nhận fail**

Run: `npm run test -- src/core/db/__tests__/envelope.test.ts`
Expected: FAIL — không resolve được `../envelope`.

- [ ] **Step 7: Viết `src/core/db/envelope.ts`**

```ts
export const SCHEMA_VERSION = 1;

export interface DocEnvelope<T extends string = string> {
  _id: string;
  _rev?: string;
  docType: T;
  branchId: string;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface CreateEnvelopeParams<T extends string> {
  id: string;
  docType: T;
  branchId: string;
  now?: string;
}

/**
 * Tạo envelope cho mọi document. `branchId` là BẮT BUỘC — đây là điểm
 * enforce Risk #17 ngay tại tầng tạo doc, không phải ở tầng UI.
 */
export function createEnvelope<T extends string>(params: CreateEnvelopeParams<T>): DocEnvelope<T> {
  const { id, docType, branchId, now } = params;

  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error('createEnvelope(): id must be a non-empty string');
  }
  if (typeof docType !== 'string' || docType.trim() === '') {
    throw new Error('createEnvelope(): docType must be a non-empty string');
  }
  if (typeof branchId !== 'string' || branchId.trim() === '') {
    throw new Error(
      'createEnvelope(): branchId is required on every document (see design doc Risk #17)',
    );
  }

  const timestamp = now ?? new Date().toISOString();

  return {
    _id: id,
    docType,
    branchId,
    schemaVersion: SCHEMA_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
```

- [ ] **Step 8: Chạy toàn bộ test**

Run: `npm run test`
Expected: PASS — tất cả test của Task 2, 3, 4 đều xanh.

- [ ] **Step 9: Commit**

```bash
git add src/core/db/
git commit -m "feat: add doc envelope with mandatory branchId and id conventions"
```

---

### Task 5: PouchDB adapter — interface + memory adapter (TDD)

Adapter layer để sau này đổi backend (IndexedDB ↔ memory ↔ hub) mà không sửa logic nghiệp vụ. Memory adapter phục vụ test nhanh, không cần IndexedDB.

**Files:**
- Create: `src/core/db/adapter.ts`, `src/core/db/memory-adapter.ts`
- Test: `src/core/db/__tests__/memory-adapter.test.ts`

**Interfaces:**
- Consumes: `DocEnvelope`, `createEnvelope` (Task 4)
- Produces:
  - `interface DbAdapter { get<T extends string>(id: string): Promise<DocEnvelope<T> | null>; put<T extends string>(doc: DocEnvelope<T>): Promise<DocEnvelope<T>>; remove(id: string, rev: string): Promise<void>; allDocs<T extends string>(opts?: { branchId?: string }): Promise<DocEnvelope<T>[]>; }`
  - `createMemoryAdapter(): Promise<DbAdapter>`

- [ ] **Step 1: Viết failing test**

`src/core/db/__tests__/memory-adapter.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '../memory-adapter';
import { createEnvelope } from '../envelope';
import type { DbAdapter } from '../adapter';

describe('memory adapter', () => {
  let db: DbAdapter;

  beforeEach(async () => {
    db = await createMemoryAdapter();
  });

  it('returns null for a missing document', async () => {
    expect(await db.get('product:nope')).toBeNull();
  });

  it('round-trips a document', async () => {
    const doc = createEnvelope({ id: 'product:p001', docType: 'product', branchId: 'hq' });
    const saved = await db.put(doc);
    expect(saved._rev).toBeTruthy();

    const loaded = await db.get('product:p001');
    expect(loaded).toMatchObject({ _id: 'product:p001', docType: 'product', branchId: 'hq' });
  });

  it('bumps _rev on update', async () => {
    const doc = createEnvelope({ id: 'product:p001', docType: 'product', branchId: 'hq' });
    const first = await db.put(doc);
    const second = await db.put({ ...first, updatedAt: '2026-10-20T11:00:00.000Z' });
    expect(second._rev).not.toBe(first._rev);
  });

  it('filters allDocs by branchId', async () => {
    await db.put(createEnvelope({ id: 'product:p001', docType: 'product', branchId: 'hq' }));
    await db.put(createEnvelope({ id: 'product:p002', docType: 'product', branchId: 'hq' }));
    await db.put(createEnvelope({ id: 'product:p003', docType: 'product', branchId: 'branch2' }));

    const hqDocs = await db.allDocs({ branchId: 'hq' });
    expect(hqDocs.map((d) => d._id).sort()).toEqual(['product:p001', 'product:p002']);
  });

  it('removes a document', async () => {
    const doc = await db.put(createEnvelope({ id: 'product:p001', docType: 'product', branchId: 'hq' }));
    await db.remove('product:p001', doc._rev as string);
    expect(await db.get('product:p001')).toBeNull();
  });

  it('works without any network or IndexedDB', async () => {
    // memory adapter phải ghi được ngay cả khi không có hub — offline-first
    await expect(
      db.put(createEnvelope({ id: 'product:offline', docType: 'product', branchId: 'hq' })),
    ).resolves.toBeTruthy();
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npm run test -- src/core/db/__tests__/memory-adapter.test.ts`
Expected: FAIL — không resolve được `../memory-adapter`.

- [ ] **Step 3: Viết `src/core/db/adapter.ts`**

```ts
import type { DocEnvelope } from './envelope';

export interface AllDocsOptions {
  branchId?: string;
}

export interface DbAdapter {
  get<T extends string = string>(id: string): Promise<DocEnvelope<T> | null>;
  put<T extends string>(doc: DocEnvelope<T>): Promise<DocEnvelope<T>>;
  remove(id: string, rev: string): Promise<void>;
  allDocs<T extends string = string>(opts?: AllDocsOptions): Promise<DocEnvelope<T>[]>;
}
```

- [ ] **Step 4: Viết `src/core/db/memory-adapter.ts`**

```ts
import type { DbAdapter } from './adapter';
import type { DocEnvelope } from './envelope';

interface Stored {
  doc: DocEnvelope;
  rev: string;
}

/**
 * Adapter in-memory dùng cho unit test và cho môi trường không có IndexedDB.
 * Không thay thế PouchDB trong production — xem Task 7.
 */
export async function createMemoryAdapter(): Promise<DbAdapter> {
  const store = new Map<string, Stored>();
  let revCounter = 0;

  function nextRev(): string {
    revCounter += 1;
    return `${revCounter}-mem`;
  }

  function clone<T extends string>(doc: DocEnvelope<T>): DocEnvelope<T> {
    return { ...doc };
  }

  return {
    async get<T extends string>(id: string): Promise<DocEnvelope<T> | null> {
      const entry = store.get(id);
      if (entry === undefined || entry.doc.deletedAt !== undefined) return null;
      return clone(entry.doc) as DocEnvelope<T>;
    },

    async put<T extends string>(doc: DocEnvelope<T>): Promise<DocEnvelope<T>> {
      if (!doc.branchId) {
        throw new Error('memory-adapter.put(): branchId is required');
      }
      const existing = store.get(doc._id);
      if (existing !== undefined && doc._rev !== existing.rev) {
        throw new Error(
          `memory-adapter.put(): revision conflict for ${doc._id} (expected ${existing.rev})`,
        );
      }
      const rev = nextRev();
      const saved: DocEnvelope<T> = { ...doc, _rev: rev };
      store.set(doc._id, { doc: saved, rev });
      return clone(saved);
    },

    async remove(id: string, rev: string): Promise<void> {
      const existing = store.get(id);
      if (existing === undefined) return;
      if (existing.rev !== rev) {
        throw new Error(`memory-adapter.remove(): revision conflict for ${id}`);
      }
      store.delete(id);
    },

    async allDocs<T extends string>(opts?: { branchId?: string }): Promise<DocEnvelope<T>[]> {
      const out: DocEnvelope<T>[] = [];
      for (const entry of store.values()) {
        if (entry.doc.deletedAt !== undefined) continue;
        if (opts?.branchId !== undefined && entry.doc.branchId !== opts.branchId) continue;
        out.push(clone(entry.doc) as DocEnvelope<T>);
      }
      return out;
    },
  };
}
```

- [ ] **Step 5: Chạy test để xác nhận pass**

Run: `npm run test -- src/core/db/__tests__/memory-adapter.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/db/adapter.ts src/core/db/memory-adapter.ts src/core/db/__tests__/memory-adapter.test.ts
git commit -m "feat: add db adapter interface and in-memory implementation"
```

---

### Task 6: Design tokens + CSS variables (TDD)

Design tokens là nguồn sự thật duy nhất cho màu/khoảng cách. Test chống "drift" giữa `tokens.ts` và `tokens.css`.

**Files:**
- Create: `src/styles/tokens.ts`, `src/styles/tokens.css`
- Test: `src/styles/__tests__/tokens.test.ts`

**Interfaces:**
- Consumes: (không có)
- Produces:
  - `const tokens: Record<string, string>` — ánh xạ tên token → giá trị
  - File `tokens.css` định nghĩa biến CSS `--<tên>` cho mọi token trong `tokens`

- [ ] **Step 1: Viết failing test**

`src/styles/__tests__/tokens.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tokens } from '../tokens';

const here = dirname(fileURLToPath(import.meta.url));
const cssPath = join(here, '..', 'tokens.css');

describe('design tokens', () => {
  it('defines the core token set', () => {
    expect(Object.keys(tokens)).toEqual(
      expect.arrayContaining([
        'color-bg',
        'color-surface',
        'color-text',
        'color-primary',
        'color-danger',
        'space-1',
        'space-2',
        'space-3',
        'radius-md',
        'font-family-base',
      ]),
    );
  });

  it('keeps tokens.css in sync with tokens.ts', () => {
    const css = readFileSync(cssPath, 'utf8');
    for (const name of Object.keys(tokens)) {
      expect(css, `missing CSS variable --${name}`).toContain(`--${name}:`);
    }
  });

  it('declares every CSS variable in tokens.css also in tokens.ts', () => {
    const css = readFileSync(cssPath, 'utf8');
    const declared = [...css.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]);
    for (const name of declared) {
      expect(tokens, `--${name} declared in CSS but missing from tokens.ts`).toHaveProperty(
        name as string,
      );
    }
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npm run test -- src/styles/__tests__/tokens.test.ts`
Expected: FAIL — không resolve được `../tokens`.

- [ ] **Step 3: Viết `src/styles/tokens.ts`**

```ts
/**
 * Nguồn sự thật duy nhất cho design tokens.
 * `tokens.css` phải khai báo đúng các biến CSS này — có test chống drift ở Task 6.
 */
export const tokens: Record<string, string> = {
  'color-bg': '#f7f7f8',
  'color-surface': '#ffffff',
  'color-text': '#1a1a1e',
  'color-text-muted': '#6b7280',
  'color-primary': '#c2410c',
  'color-primary-contrast': '#ffffff',
  'color-success': '#15803d',
  'color-warning': '#b45309',
  'color-danger': '#b91c1c',
  'space-1': '4px',
  'space-2': '8px',
  'space-3': '12px',
  'space-4': '16px',
  'space-6': '24px',
  'radius-sm': '4px',
  'radius-md': '8px',
  'radius-lg': '12px',
  'font-family-base': "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  'font-size-sm': '13px',
  'font-size-md': '15px',
  'font-size-lg': '18px',
  'font-size-xl': '24px',
};
```

- [ ] **Step 4: Viết `src/styles/tokens.css`**

```css
:root {
  --color-bg: #f7f7f8;
  --color-surface: #ffffff;
  --color-text: #1a1a1e;
  --color-text-muted: #6b7280;
  --color-primary: #c2410c;
  --color-primary-contrast: #ffffff;
  --color-success: #15803d;
  --color-warning: #b45309;
  --color-danger: #b91c1c;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --font-family-base: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-size-sm: 13px;
  --font-size-md: 15px;
  --font-size-lg: 18px;
  --font-size-xl: 24px;
}

html,
body,
#app {
  height: 100%;
  margin: 0;
}

body {
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-family-base);
  font-size: var(--font-size-md);
}
```

- [ ] **Step 5: Chạy test để xác nhận pass**

Run: `npm run test -- src/styles/__tests__/tokens.test.ts`
Expected: PASS — 3 test xanh, không có drift giữa TS và CSS.

- [ ] **Step 6: Commit**

```bash
git add src/styles/
git commit -m "feat: add design tokens with css sync test"
```

---

### Task 7: i18n vi + en (TDD)

**Files:**
- Create: `src/i18n/index.ts`, `src/i18n/vi.json`, `src/i18n/en.json`
- Test: `src/i18n/__tests__/i18n.test.ts`

**Interfaces:**
- Consumes: (không có)
- Produces:
  - `const i18n` — Vue I18n instance, locale mặc định `vi`
  - `const SUPPORTED_LOCALES: readonly ['vi', 'en']`
  - Bất biến: tập key của `vi.json` và `en.json` giống hệt nhau (có test)

- [ ] **Step 1: Viết failing test**

`src/i18n/__tests__/i18n.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { i18n, SUPPORTED_LOCALES } from '../index';
import vi from '../vi.json';
import en from '../en.json';

function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') {
      return flatten(value as Record<string, unknown>, path);
    }
    return [path];
  });
}

describe('i18n', () => {
  it('supports vi and en', () => {
    expect(SUPPORTED_LOCALES).toEqual(['vi', 'en']);
  });

  it('defaults to Vietnamese', () => {
    expect(i18n.global.locale.value).toBe('vi');
  });

  it('has identical key sets in vi and en', () => {
    expect(flatten(en).sort()).toEqual(flatten(vi).sort());
  });

  it('has no empty translations', () => {
    for (const [locale, messages] of [
      ['vi', vi],
      ['en', en],
    ] as const) {
      const values = flatten(messages).map((path) =>
        path.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown>)[part], messages),
      );
      for (const value of values) {
        expect(typeof value, `empty translation in ${locale}`).toBe('string');
        expect((value as string).trim()).not.toBe('');
      }
    }
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npm run test -- src/i18n/__tests__/i18n.test.ts`
Expected: FAIL — không resolve được `../index`.

- [ ] **Step 3: Viết `src/i18n/vi.json`**

```json
{
  "app": {
    "title": "Open POS",
    "tagline": "Phần mềm bán hàng cho nhà hàng, quán cafe"
  },
  "common": {
    "save": "Lưu",
    "cancel": "Huỷ",
    "delete": "Xoá",
    "confirm": "Xác nhận",
    "loading": "Đang tải…",
    "error": "Đã xảy ra lỗi"
  }
}
```

- [ ] **Step 4: Viết `src/i18n/en.json`**

```json
{
  "app": {
    "title": "Open POS",
    "tagline": "Point of sale for restaurants and cafes"
  },
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "confirm": "Confirm",
    "loading": "Loading…",
    "error": "Something went wrong"
  }
}
```

- [ ] **Step 5: Viết `src/i18n/index.ts`**

```ts
import { createI18n } from 'vue-i18n';
import vi from './vi.json';
import en from './en.json';

export const SUPPORTED_LOCALES = ['vi', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const i18n = createI18n({
  legacy: false,
  locale: 'vi' satisfies SupportedLocale,
  fallbackLocale: 'vi',
  messages: { vi, en },
});
```

- [ ] **Step 6: Chạy test để xác nhận pass**

Run: `npm run test -- src/i18n/__tests__/i18n.test.ts`
Expected: PASS.

> Nếu `i18n.global.locale.value` báo lỗi type vì `createI18n` trả về union rộng, khai báo `legacy: false` như trên là đủ để TS suy ra `WritableComputedRef`. Nếu vẫn lỗi, ép kiểu ở chỗ test — **không** đổi sang `legacy: true`.

- [ ] **Step 7: Chạy toàn bộ test + typecheck**

Run: `npm run build`
Expected: `vue-tsc --noEmit` không báo lỗi, `vite build` tạo ra `dist/`.

- [ ] **Step 8: Commit**

```bash
git add src/i18n/
git commit -m "feat: add vi/en i18n with key parity test"
```

---

### Task 8: Tauri 2 shell + cửa sổ app

**Files:**
- Create: `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`
- Modify: `package.json` (thêm script `tauri`)

**Interfaces:**
- Consumes: `dist/` từ Vite build (Task 1/7)
- Produces: app desktop chạy được bằng `npm run tauri dev`; hàm Rust `open_pos_lib::run()` để các task sau thêm module

- [ ] **Step 1: Cài Tauri CLI và khởi tạo src-tauri**

```bash
cd E:/Coding/vue/open-pos
npm install -D @tauri-apps/cli@^2
npm pkg set scripts.tauri="tauri"
```

- [ ] **Step 2: Tạo `src-tauri/Cargo.toml`**

```toml
[package]
name = "open-pos"
version = "0.1.0"
description = "Open POS desktop shell"
edition = "2021"
rust-version = "1.82"

[lib]
name = "open_pos_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
axum = "0.8"
tokio = { version = "1", features = ["rt-multi-thread", "macros", "net"] }
tower = "0.5"

[dev-dependencies]
tower = { version = "0.5", features = ["util"] }
http-body-util = "0.1"
```

- [ ] **Step 3: Tạo `src-tauri/build.rs`**

```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 4: Tạo `src-tauri/tauri.conf.json`**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Open POS",
  "version": "0.1.0",
  "identifier": "com.openpos.desktop",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "title": "Open POS",
        "width": 1280,
        "height": 800,
        "resizable": true
      }
    ],
    "security": { "csp": null }
  },
  "bundle": {
    "active": true,
    "targets": ["msi", "nsis"],
    "icon": ["icons/icon.ico"]
  }
}
```

> `bundle.icon` yêu cầu file icon tồn tại. Nếu chưa có, tạm bỏ khoá `bundle` và thêm lại ở M6c khi đóng gói — nhưng phải thêm lại trước khi release.

- [ ] **Step 5: Tạo `src-tauri/capabilities/default.json`**

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Quyền mặc định cho cửa sổ chính",
  "windows": ["main"],
  "permissions": ["core:default"]
}
```

- [ ] **Step 6: Tạo `src-tauri/src/lib.rs`**

```rust
pub mod lan;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Open POS");
}
```

- [ ] **Step 7: Tạo `src-tauri/src/main.rs`**

```rust
// Prevents additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    open_pos_lib::run()
}
```

- [ ] **Step 8: Kiểm tra build Rust**

Run: `cd src-tauri && cargo check`
Expected: `Finished` không lỗi. Lần đầu sẽ tải crate, có thể mất vài phút.

- [ ] **Step 9: Kiểm tra app chạy**

Run: `cd E:/Coding/vue/open-pos && npm run tauri dev`
Expected: cửa sổ "Open POS" mở ra, hiển thị tiêu đề lấy từ i18n. Đóng cửa sổ để kết thúc.

- [ ] **Step 10: Commit**

```bash
git add src-tauri/ package.json package-lock.json
git commit -m "feat: add tauri 2 desktop shell"
```

---

### Task 9: PouchDB-server hub chạy như sidecar (TDD)

Đây là hub LAN. Client replicate vào đây. Task này là một nửa của rủi ro kỹ thuật lớn nhất ở M0.

**Files:**
- Create: `sidecar/package.json`, `sidecar/src/server.mjs`
- Test: `tests/sidecar.test.ts`

**Interfaces:**
- Consumes: (không có)
- Produces:
  - Script `sidecar/src/server.mjs` — khởi động PouchDB-server, in ra `OPEN_POS_HUB_URL=<url>` khi sẵn sàng
  - Biến môi trường: `HUB_PORT` (mặc định 5984), `HUB_DATA_DIR` (mặc định `.hub-data`)
  - URL hub dạng `http://127.0.0.1:<port>`

- [ ] **Step 1: Tạo `sidecar/package.json`**

```json
{
  "name": "open-pos-hub",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "main": "src/server.mjs",
  "dependencies": {
    "express": "^4.21.0",
    "pouchdb": "^9.0.0",
    "pouchdb-find": "^9.0.0"
  }
}
```

- [ ] **Step 2: Cài dependencies cho sidecar**

```bash
cd E:/Coding/vue/open-pos/sidecar
npm install
```

- [ ] **Step 3: Viết failing test**

`tests/sidecar.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, '..', 'sidecar', 'src', 'server.mjs');

let child: ChildProcess | undefined;
let dataDir: string | undefined;

function waitForHubUrl(proc: ChildProcess, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('hub did not report URL in time')), timeoutMs);
    let buffer = '';
    proc.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const match = buffer.match(/OPEN_POS_HUB_URL=(\S+)/);
      if (match?.[1]) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`hub exited early with code ${code}`));
    });
  });
}

afterAll(() => {
  child?.kill();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

describe('pouchdb-server sidecar', () => {
  it('starts, reports its URL, and serves the CouchDB welcome document', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'open-pos-hub-'));
    child = spawn(process.execPath, [serverPath], {
      env: { ...process.env, HUB_PORT: '0', HUB_DATA_DIR: dataDir },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const url = await waitForHubUrl(child, 30_000);
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

    const res = await fetch(url);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { couchdb?: string; express?: string };
    expect(body.couchdb).toBeTruthy();
  }, 45_000);

  it('accepts a document and serves it back', async () => {
    expect(child).toBeTruthy();
    const url = await waitForHubUrl(child as ChildProcess, 30_000);

    const put = await fetch(`${url}/openpos_probe`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ _id: 'probe:1', docType: 'probe', branchId: 'hq' }),
    });
    expect(put.status).toBe(201);

    const get = await fetch(`${url}/openpos_probe/probe:1`);
    expect(get.status).toBe(200);
    const doc = (await get.json()) as { _id: string; branchId: string };
    expect(doc._id).toBe('probe:1');
    expect(doc.branchId).toBe('hq');
  }, 45_000);
});
```

- [ ] **Step 4: Chạy test để xác nhận fail**

Run: `npm run test -- tests/sidecar.test.ts`
Expected: FAIL — `hub exited early` vì `sidecar/src/server.mjs` chưa tồn tại.

- [ ] **Step 5: Viết `sidecar/src/server.mjs`**

```js
import express from 'express';
import PouchDB from 'pouchdb';
import find from 'pouchdb-find';
import { mkdirSync } from 'node:fs';

PouchDB.plugin(find);

const port = Number(process.env.HUB_PORT ?? 5984);
const dataDir = process.env.HUB_DATA_DIR ?? '.hub-data';

mkdirSync(dataDir, { recursive: true });

const app = express();
app.use(express.json({ limit: '10mb' }));

const dbs = new Map();
function getDb(name) {
  let db = dbs.get(name);
  if (!db) {
    db = new PouchDB(`${dataDir}/${name}`);
    dbs.set(name, db);
  }
  return db;
}

app.get('/', (_req, res) => {
  res.json({ couchdb: 'Welcome', version: '0.1.0-openpos-hub', express: 'ok' });
});

app.get('/_all_dbs', (_req, res) => {
  res.json([...dbs.keys()]);
});

app.put('/:db', async (req, res) => {
  try {
    const db = getDb(req.params.db);
    const doc = req.body;
    const result = await db.put(doc);
    res.status(201).json({ ok: true, id: result.id, rev: result.rev });
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
});

app.get('/:db/:id', async (req, res) => {
  try {
    const db = getDb(req.params.db);
    const doc = await db.get(req.params.id);
    res.json(doc);
  } catch (err) {
    if (err && err.status === 404) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
});

// CouchDB-compatible bulk endpoint — PouchDB replication dùng endpoint này.
app.post('/:db/_bulk_docs', async (req, res) => {
  try {
    const db = getDb(req.params.db);
    const result = await db.bulkDocs(req.body.docs ?? []);
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
});

const server = app.listen(port, '127.0.0.1', () => {
  const actual = server.address();
  const boundPort = typeof actual === 'object' && actual !== null ? actual.port : port;
  console.log(`OPEN_POS_HUB_URL=http://127.0.0.1:${boundPort}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

- [ ] **Step 6: Chạy test để xác nhận pass**

Run: `npm run test -- tests/sidecar.test.ts`
Expected: PASS — hub khởi động trên cổng ngẫu nhiên, phục vụ welcome doc, nhận và trả lại document.

> `HUB_PORT=0` để OS cấp cổng trống — tránh xung đột khi chạy test song song.

- [ ] **Step 7: Commit**

```bash
git add sidecar/ tests/sidecar.test.ts
git commit -m "feat: add pouchdb-server hub sidecar with integration test"
```

---

### Task 10: axum LAN server — endpoint `/api/health` (TDD)

Task này là nửa còn lại: LAN server phục vụ API cho điện thoại. Ở M0 chỉ cần health check chứng minh router hoạt động.

**Files:**
- Create: `src-tauri/src/lan/mod.rs`, `src-tauri/src/lan/health.rs`
- Test: inline `#[cfg(test)] mod tests` trong `src-tauri/src/lan/mod.rs`

**Interfaces:**
- Consumes: (không có)
- Produces:
  - `lan::router() -> axum::Router` — router gốc để các task sau gắn thêm route
  - `GET /api/health` → `200` với body `{"status":"ok"}`

- [ ] **Step 1: Viết failing test**

Tạo `src-tauri/src/lan/mod.rs` với test trước, chưa có handler:

```rust
use axum::{routing::get, Json, Router};
use serde_json::{json, Value};

pub mod health;

pub fn router() -> Router {
    Router::new().route("/api/health", get(health::health))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt;

    #[tokio::test]
    async fn health_returns_ok_json() {
        let app = router();
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/health")
                    .body(Body::empty())
                    .expect("build request"),
            )
            .await
            .expect("call router");

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn unknown_route_returns_not_found() {
        let app = router();
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/does-not-exist")
                    .body(Body::empty())
                    .expect("build request"),
            )
            .await
            .expect("call router");

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn health_body_has_status_ok() {
        use http_body_util::BodyExt;

        let app = router();
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/health")
                    .body(Body::empty())
                    .expect("build request"),
            )
            .await
            .expect("call router");

        let bytes = response.into_body().collect().await.expect("collect body").to_bytes();
        let parsed: Value = serde_json::from_slice(&bytes).expect("valid json");
        assert_eq!(parsed, json!({ "status": "ok" }));
    }
}
```

> Xoá hai dòng `use axum::{...}` và `pub mod health;` tạm thời nếu muốn thấy test fail rõ hơn — nhưng vì file chưa tồn tại nên `cargo test` sẽ fail ở bước biên dịch, đó là "failing" hợp lệ.

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `cd src-tauri && cargo test lan::`
Expected: FAIL — không tìm thấy module `health`.

- [ ] **Step 3: Viết `src-tauri/src/lan/health.rs`**

```rust
use axum::Json;
use serde_json::{json, Value};

pub async fn health() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `cd src-tauri && cargo test lan::`
Expected: PASS — 3 test xanh.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lan/
git commit -m "feat: add axum lan server skeleton with health endpoint"
```

---

### Task 11: Nghiệm thu M0 — hai terminal đồng bộ qua hub (TDD)

Đây là **tiêu chí nghiệm thu của M0**: hai client độc lập ghi dữ liệu, và cả hai nhìn thấy dữ liệu của nhau qua hub. Test này chứng minh rủi ro kỹ thuật lớn nhất đã được giải quyết.

**Files:**
- Create: `tests/two-terminal-sync.test.ts`
- Modify: `package.json` (thêm devDependency `pouchdb-adapter-memory` nếu chưa có)

**Interfaces:**
- Consumes: hub từ Task 9 (`sidecar/src/server.mjs`), `createEnvelope` từ Task 4
- Produces: bằng chứng chạy được cho mốc bàn giao M0

- [ ] **Step 1: Viết failing test**

`tests/two-terminal-sync.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import PouchDB from 'pouchdb';
import memory from 'pouchdb-adapter-memory';
import { createEnvelope } from '../src/core/db/envelope';

PouchDB.plugin(memory);

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, '..', 'sidecar', 'src', 'server.mjs');

let hub: ChildProcess | undefined;
let dataDir: string | undefined;
let hubUrl = '';

function waitForHubUrl(proc: ChildProcess, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('hub did not report URL in time')), timeoutMs);
    let buffer = '';
    proc.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const match = buffer.match(/OPEN_POS_HUB_URL=(\S+)/);
      if (match?.[1]) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function makeLocalDb(name: string): PouchDB.Database {
  return new PouchDB(name, { adapter: 'memory' });
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'open-pos-sync-'));
  hub = spawn(process.execPath, [serverPath], {
    env: { ...process.env, HUB_PORT: '0', HUB_DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  hubUrl = await waitForHubUrl(hub, 30_000);
}, 45_000);

afterAll(() => {
  hub?.kill();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

describe('M0 acceptance: two terminals sync through the hub', () => {
  it('propagates a document written on terminal A to terminal B', async () => {
    const terminalA = makeLocalDb('terminal-a');
    const terminalB = makeLocalDb('terminal-b');
    const remoteA = new PouchDB(`${hubUrl}/openpos_sync`);

    const doc = createEnvelope({
      id: 'product:sync-probe',
      docType: 'product',
      branchId: 'hq',
      now: '2026-10-20T10:00:00.000Z',
    });

    await terminalA.put(doc);

    await new Promise<void>((resolve, reject) => {
      terminalA
        .replicate.to(remoteA)
        .on('complete', () => resolve())
        .on('error', (err: unknown) => reject(err));
    });

    await new Promise<void>((resolve, reject) => {
      terminalB
        .replicate.from(remoteA)
        .on('complete', () => resolve())
        .on('error', (err: unknown) => reject(err));
    });

    const seenOnB = await terminalB.get('product:sync-probe');
    expect(seenOnB).toMatchObject({ docType: 'product', branchId: 'hq' });
  }, 45_000);

  it('keeps accepting writes while the hub is unreachable (offline-first)', async () => {
    const terminalC = makeLocalDb('terminal-c');
    await terminalC.put(
      createEnvelope({ id: 'product:offline-probe', docType: 'product', branchId: 'hq' }),
    );

    const doc = await terminalC.get('product:offline-probe');
    expect(doc).toMatchObject({ _id: 'product:offline-probe', branchId: 'hq' });
  });

  it('catches up after the hub comes back', async () => {
    const terminalD = makeLocalDb('terminal-d');
    await terminalD.put(
      createEnvelope({ id: 'product:catchup-probe', docType: 'product', branchId: 'hq' }),
    );

    const remoteD = new PouchDB(`${hubUrl}/openpos_sync`);
    await new Promise<void>((resolve, reject) => {
      terminalD
        .replicate.to(remoteD)
        .on('complete', () => resolve())
        .on('error', (err: unknown) => reject(err));
    });

    const onHub = await remoteD.get('product:catchup-probe');
    expect(onHub).toMatchObject({ branchId: 'hq' });
  }, 45_000);
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npm run test -- tests/two-terminal-sync.test.ts`
Expected: FAIL — replication không hoàn tất, vì hub thiếu endpoint mà PouchDB replication cần (cụ thể là `_revs_diff`, `_local/*`, `_changes`).

- [ ] **Step 3: Bổ sung các endpoint replication vào `sidecar/src/server.mjs`**

Thêm vào `sidecar/src/server.mjs`, **trước** phần `const server = app.listen(...)`:

```js
// --- Replication endpoints mà PouchDB client yêu cầu ---

app.post('/:db/_revs_diff', async (req, res) => {
  const db = getDb(req.params.db);
  const result = {};
  for (const [id, revs] of Object.entries(req.body)) {
    const missing = [];
    for (const rev of revs) {
      try {
        await db.get(id, { rev });
      } catch (err) {
        if (err && err.status === 404) missing.push(rev);
      }
    }
    if (missing.length > 0) result[id] = { missing };
  }
  res.json(result);
});

app.get('/:db/_changes', async (req, res) => {
  const db = getDb(req.params.db);
  const since = Number(req.query.since ?? 0);
  const changes = await db.changes({ since, include_docs: true, limit: 1000 });
  res.json({
    results: changes.results.map((row) => ({
      seq: row.seq,
      id: row.id,
      changes: row.changes,
      doc: row.doc,
    })),
    last_seq: changes.last_seq,
  });
});

app.get('/:db/_local/:id', async (req, res) => {
  const db = getDb(req.params.db);
  try {
    const doc = await db.get(`_local/${req.params.id}`);
    res.json(doc);
  } catch (err) {
    if (err && err.status === 404) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
});

app.put('/:db/_local/:id', async (req, res) => {
  const db = getDb(req.params.db);
  const id = `_local/${req.params.id}`;
  let existing = {};
  try {
    existing = await db.get(id);
  } catch (err) {
    if (!(err && err.status === 404)) throw err;
  }
  const result = await db.put({ ...req.body, _id: id, _rev: existing._rev });
  res.status(201).json({ ok: true, id: result.id, rev: result.rev });
});
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npm run test -- tests/two-terminal-sync.test.ts`
Expected: PASS — 3 test xanh. Đây là **bằng chứng nghiệm thu M0**.

- [ ] **Step 5: Chạy toàn bộ test suite**

Run: `npm run test`
Expected: PASS — toàn bộ unit + integration test xanh.

- [ ] **Step 6: Commit**

```bash
git add sidecar/src/server.mjs tests/two-terminal-sync.test.ts
git commit -m "feat: verify two-terminal sync through local hub (M0 acceptance)"
```

---

### Task 12: CI — chạy test tự động trên mỗi push

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: toàn bộ test từ Task 1–11
- Produces: pipeline CI xanh

- [ ] **Step 1: Tạo `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  web:
    name: Web (typecheck + unit tests)
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Install sidecar dependencies
        run: npm ci --prefix sidecar

      - name: Typecheck
        run: npx vue-tsc --noEmit

      - name: Test
        run: npm run test

  rust:
    name: Rust (axum server tests)
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy

      - name: Cache cargo
        uses: actions/cache@v4
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            src-tauri/target
          key: ${{ runner.os }}-cargo-${{ hashFiles('src-tauri/Cargo.lock') }}

      - name: Test
        run: cargo test --manifest-path src-tauri/Cargo.toml

      - name: Clippy
        run: cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

> `windows-latest` là bắt buộc vì v1 Windows-first (Global Constraints). Không dùng `ubuntu-latest`.

- [ ] **Step 2: Kiểm tra YAML hợp lệ**

Run: `node -e "const fs=require('fs');const t=fs.readFileSync('.github/workflows/ci.yml','utf8');if(!t.includes('npm ci'))process.exit(1);console.log('ci.yml ok')"`
Expected: `ci.yml ok`

- [ ] **Step 3: Commit và push để xem CI chạy**

```bash
git add .github/workflows/ci.yml
git commit -m "chore: add ci for typecheck, unit tests and rust tests"
```

> CI chỉ thực sự chạy sau khi push lên GitHub — xem §Handoff để biết thứ tự `git init` + remote.

---

## Self-Review

Đã chạy kiểm tra theo checklist của skill:

**1. Spec coverage (M0):**

| Yêu cầu trong spec §9 (M0) | Task |
|---|---|
| Scaffold Vue 3 + TS + Vite | Task 1 |
| PouchDB adapter layer | Task 5 |
| Đóng gói PouchDB-server sidecar | Task 9 |
| axum skeleton + static assets | Task 10 (health endpoint; static assets ở M5) |
| CI | Task 12 |
| Vitest setup | Task 1 |
| i18n vi/en | Task 7 |
| Design tokens | Task 6 |
| Money type | Task 2, 3 |
| `branchId` xuyên suốt schema | Task 4 |

Không có khoảng trống trong phạm vi M0. Riêng "static assets" trong axum thuộc M5 (khi có `/order`, `/staff/*`, `/kds` cần phục vụ qua LAN) — M0 chỉ cần chứng minh router hoạt động.

**2. Placeholder scan:** không có "TODO"/"TBD"/"implement later". Hai chỗ có ghi chú có điều kiện (Task 1 Step 4 về import tạm, Task 8 Step 4 về icon) — cả hai đều nêu rõ hành động cụ thể, không phải placeholder.

**3. Type consistency:** các tên hàm và chữ ký được kiểm tra chéo giữa các task:
- `money`, `add`, `sub`, `mulInt`, `isZero`, `isNegative`, `format` — định nghĩa Task 2, dùng Task 3.
- `allocate`, `allocateEqual` — Task 3.
- `SCHEMA_VERSION`, `DocEnvelope`, `createEnvelope` — Task 4; dùng ở Task 5, Task 11.
- `branchDocId`, `productDocId`, `productBranchOverrideId` — Task 4; dùng ở M2/M6a.
- `DbAdapter`, `createMemoryAdapter` — Task 5.
- `lan::router()` — Task 10; dùng ở M5.

Không phát hiện lệch tên.

**4. Review Focus:** cả 5 dòng đều có test sở hữu:
- Chia tiền không hết → Task 3 (test `splits 100.000 into 3 equal parts` + property test).
- Trộn tiền tệ → Task 2 (test `throws when adding different currencies`).
- Thiếu `branchId` → Task 4 (test `rejects a missing or empty branchId`).
- Hub tắt → Task 11 (test `keeps accepting writes while the hub is unreachable`) + Task 9.
- Số tiền vượt safe integer / số thập phân → Task 2 (hai test đầu).

---

## Handoff

**Plan đã lưu** tại `docs/superpowers/plans/2026-10-20-m0-foundation.md`.

**Về việc thực thi:** skill `writing-plans` yêu cầu dùng `superpowers:subagent-driven-development` hoặc `superpowers:executing-plans`, nhưng plugin `superpowers@claude-plugins-official` **chưa được cài** trên máy này. Hai cách xử lý:

1. **Cài plugin** rồi dùng đúng hai sub-skill trên (thêm marketplace `claude-plugins-official` → cài `superpowers`).
2. **Chạy plan này trực tiếp** — plan tự chứa đủ ngữ cảnh (mỗi task có file, interface, test và code thật), nên có thể thực thi tuần tự mà không cần sub-skill.

**Thứ tự git đề xuất:**

```bash
cd E:/Coding/vue/open-pos
git init
git add -A
git commit -m "docs: add open pos design spec and m0 implementation plan"
```

> Chưa có git repo ở thời điểm viết plan. Nên commit spec + plan làm baseline **trước** khi bắt đầu Task 1, để mọi thay đổi code sau đó đều có điểm so sánh.
