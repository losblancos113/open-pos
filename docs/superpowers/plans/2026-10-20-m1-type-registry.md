# M1 — Type Registry & Dynamic Forms — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Dùng `superpowers:subagent-driven-development` (khuyến nghị) hoặc `superpowers:executing-plans` để thực thi plan này theo từng task. Các bước dùng checkbox (`- [ ]`) để theo dõi tiến độ.
>
> ⚠️ **Lưu ý môi trường:** hai sub-skill trên thuộc plugin `superpowers@claude-plugins-official`, **hiện chưa được cài** trong máy này. Xem §Handoff ở cuối plan để biết cách chạy nếu không cài được plugin.

**Goal:** Chứng minh **R1 — "data type vô hạn"** hoạt động thật: admin tạo/sửa type ngay lúc chạy (thêm field tuỳ chỉnh vào type có sẵn, hoặc định nghĩa entity type mới), và UI tự sinh form + list view từ định nghĩa đó — không cần viết code cho từng type.

**Architecture:** Định nghĩa type lưu trong collection `meta_types` (một document/type). Một **field-type registry** ánh xạ mỗi `dataType` tới `{ validator, formatter, defaultWidget, widgetOptions, formulaSupport }`. **Validation engine** và **formula interpreter** là TypeScript thuần, chạy cả ở client lẫn (về sau) ở Rust. **Schema versioning** cho phép sửa type mà không phá dữ liệu cũ: document mang `schemaVersion`, migration **lazy khi đọc** + transform **khai báo** (không code tuỳ ý). UI là các SFC mỏng nằm trên một **form model** thuần đã được unit test.

**Tech Stack:** Vue 3.5+, TypeScript 5.x (strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`), Vitest, fast-check, vue-i18n, `@vue/test-utils` + `happy-dom` (component test).

**Spec:** `docs/superpowers/specs/2026-10-20-open-pos-design.md` (§4.1 Type Registry, §R1, §8 Testing, §9 M1, Risk #11, #12)

**Plan trước:** `docs/superpowers/plans/2026-10-20-m0-foundation.md` (M0 — đã xong, 89 test pass)

---

## Global Constraints

Sao chép nguyên văn từ spec. **Mọi task đều phải tuân theo các ràng buộc này:**

- **Nền tảng v1:** Windows-first. Không cần hỗ trợ macOS/Linux ở v1.
- **Runtime:** Node ≥ 22 LTS.
- **DB local:** PouchDB trên IndexedDB (schemaless — nền tảng cho R1).
- **i18n:** `vi` là mặc định, `en` là dự phòng. Không hardcode chuỗi hiển thị.
- **Tiền tệ:** lưu bằng **số nguyên đơn vị nhỏ** (`minor`), **tuyệt đối không dùng float**. VND có exponent = 0; USD có exponent = 2.
- **`branchId` bắt buộc trên mọi document** — thiếu `branchId` phải bị từ chối ngay khi ghi (Risk #17).
- **Offline-first:** thao tác ghi phải thành công khi hub đang tắt; không được chặn UI chờ mạng.
- **TDD:** viết test fail trước, rồi mới implement. Commit thường xuyên (conventional commits: `feat:`, `fix:`, `chore:`, `test:`).
- **Không placeholder:** mọi bước phải có nội dung thật, không có "TODO"/"implement later".

**Ràng buộc riêng của M1:**

- **Không dùng `eval`, không `new Function`.** Formula interpreter phải là AST interpreter tự viết, không truy cập global scope (spec §4.1).
- **`src/core/**` không được import Vue hoặc PouchDB** (AGENTS.md §2). Toàn bộ engine type registry là TypeScript thuần, chỉ phụ thuộc `src/core/db/adapter.ts` (interface) và `src/core/money.ts`.
- **Reserved keys:** field tuỳ chỉnh **không** được bắt đầu bằng `_` và **không** được trùng tên field hệ thống (spec §4.1).
- **Migration phải khai báo** (rename / add default / map value), **không phải code tuỳ ý** (Risk #11).
- **Giới hạn số index/type** để chống index explosion (Risk #12).
- **Kết quả formula không lưu cứng vào document** — tính lại khi đọc (spec §4.1).
- **Giữ YAGNI:** entity type mới chỉ hỗ trợ **generic CRUD** (tên + field + list view). Không custom workflow, custom permission, custom report (spec §R1).

---

## Review Focus

Những chỗ dễ sai nhất — mỗi dòng đều có test tương ứng trong task sở hữu:

1. **`price * 0.6` khi `price` là `money`** — 0.6 không phải số nguyên nên `mulInt()` **không dùng được**. Nếu implement bằng float (`price.minor * 0.6`) sẽ sai tiền với số lớn. Phải dùng số học số nguyên + làm tròn xác định. → Task 1.
2. **Formula trỏ tới field không tồn tại** — phải **bị từ chối lúc lưu type definition**, không phải lặng lẽ trả `null` lúc chạy. Người dùng sẽ không bao giờ phát hiện ra. → Task 4.
3. **Formula vòng lặp** — `a = b + 1`, `b = a + 1` phải **bị phát hiện** và báo lỗi, không được treo UI hoặc tràn stack. → Task 4.
4. **Field key trùng hệ thống hoặc bắt đầu bằng `_`** — phải bị từ chối. `_rev`, `branchId`, `docType` là field hệ thống; `_anything` là reserved cho PouchDB. → Task 2.
5. **Migration chạy lại trên document đã đúng version** — phải **không làm gì** (idempotent). Và document có `schemaVersion` cũ hơn 2 bậc phải đi **từng bậc một**, không nhảy cóc. → Task 10.

---

## File Structure

```
open-pos/
├── src/
│   ├── core/
│   │   ├── money.ts                     # (M0) — thêm mulRational ở Task 1
│   │   ├── money-allocate.ts            # (M0)
│   │   ├── db/
│   │   │   ├── ids.ts                   # (M0) — thêm typeDocId ở Task 2
│   │   │   ├── adapter.ts               # (M0) — interface DbAdapter
│   │   │   ├── memory-adapter.ts        # (M0)
│   │   │   ├── pouch-adapter.ts         # (M0)
│   │   │   └── __tests__/adapter-contract.ts  # (M0)
│   │   └── types/                       # ★ MỚI — toàn bộ engine M1, TypeScript thuần
│   │       ├── definition.ts            # DataType, FieldDefinition, TypeDefinition
│   │       ├── field-registry.ts        # FIELD_TYPES: validator + formatter + widget
│   │       ├── definition-validation.ts # validateTypeDefinition (reserved key, index limit…)
│   │       ├── rational.ts              # số hữu tỉ chính xác cho formula
│   │       ├── formula.ts               # tokenizer + parser → AST
│   │       ├── formula-eval.ts          # interpreter + hàm dựng sẵn
│   │       ├── migration.ts             # transform khai báo + chạy migration
│   │       ├── type-registry.ts         # engine CRUD trên DbAdapter
│   │       ├── read-model.ts            # form model + list model + computed field
│   │       └── __tests__/
│   │           ├── field-registry.test.ts
│   │           ├── definition-validation.test.ts
│   │           ├── rational.test.ts
│   │           ├── formula.test.ts
│   │           ├── formula-eval.test.ts
│   │           ├── migration.test.ts
│   │           ├── type-registry.test.ts
│   │           └── read-model.test.ts
│   ├── app/
│   │   └── shell.ts                     # ★ MỚI — view switch tối thiểu (không router)
│   ├── features/
│   │   └── type-designer/               # ★ MỚI — UI
│   │       ├── FieldWidgets.vue         # widget registry (text, number, select…)
│   │       ├── DynamicForm.vue          # renderer form tự sinh
│   │       ├── DynamicList.vue          # renderer list view tự sinh
│   │       ├── TypeDesigner.vue         # màn hình tạo/sửa type
│   │       └── __tests__/
│   │           ├── DynamicForm.test.ts
│   │           └── DynamicList.test.ts
│   ├── i18n/
│   │   ├── vi.json                      # thêm key type.*
│   │   └── en.json                      # thêm key type.*
│   └── styles/                          # (M0)
└── package.json                         # thêm happy-dom (devDependency)
```

**Ghi chú layout:** spec §3.3 vẽ `core/types/` và `features/type-designer/` — plan này theo đúng hai đường dẫn đó. Spec cũng vẽ `src/app/` có router; M1 **chưa thêm router** (xem §Decisions cần xác nhận), chỉ có `shell.ts` chuyển view bằng `ref`. Repo thực tế đặt money ở `src/core/money.ts` (không phải `core/money/`) — theo repo, không theo sketch.

---

## Decisions cần xác nhận

Plan này tự quyết mấy điểm mà spec để mở. Ghi rõ ở đây để review trước khi thực thi:

| # | Quyết định | Lý do | Ai chịu ảnh hưởng |
|---|-----------|-------|-------------------|
| D1 | `decimal` lưu bằng **số nguyên đã scale** + option `scale` (mặc định 2), không lưu float | Giữ số học chính xác trong formula, đồng nhất với invariant "no float" của money. `12.34` → `1234`. | Task 2, 3 |
| D2 | Làm tròn `money * phân số` theo **half away from zero** | `allocate()` dùng largest-remainder cho phép chia; phép nhân một lần cần một quy tắc làm tròn rõ ràng. Tránh "ngân hàng làm tròn" gây bất ngờ. | Task 1 |
| D3 | `meta_types` là **metadata toàn hệ thống**, không thuộc riêng branch | Spec §4.2 xếp `meta_types` sync lên cloud; §5.4 dùng `global:{entity}:{key}` cho doc dùng chung. | Task 2, 12 |
| D4 | Formula chỉ nhận toán hạng **number / money / boolean**; text/date/select **không** tham gia được | Giữ interpreter nhỏ và kiểm chứng được; spec chỉ nêu ví dụ số học. | Task 6, 7 |
| D5 | Chưa thêm `vue-router` ở M1 | YAGNI (spec §R1 nhấn mạnh). Router đúng chỗ khi có nhiều route thật (M2/M3). | Task 13 |

> Nếu D1/D2/D3 sai ý, sửa ở đây **trước** khi code — cả ba đều ảnh hưởng schema hoặc tiền.

---

### Task 1: `mulRational()` — nhân money với phân số chính xác (TDD)

**Vì sao:** `cost = price * 0.6` (ví dụ trong spec §4.1) không dùng được `mulInt()` vì 0.6 không phải số nguyên. Nhân bằng float sẽ sai tiền. Đây là Review Focus #1.

**Files:**
- Modify: `src/core/money.ts`
- Test: `src/core/__tests__/money.test.ts` (thêm case)

**Interfaces:**
- Consumes: `Money`, `money` (M0)
- Produces: `mulRational(m: Money, numerator: number, denominator: number): Money`

- [ ] **Step 1: Viết failing test**

Thêm vào `src/core/__tests__/money.test.ts`:

```ts
import { money, mulRational } from '../money';

describe('mulRational', () => {
  it('multiplies exactly when the fraction divides evenly', () => {
    expect(mulRational(money(100000, 'VND'), 6, 10)).toEqual(money(60000, 'VND'));
  });

  it('rounds half away from zero', () => {
    // 1 * 5/10 = 0.5 -> 1 (không phải 0 như banker's rounding)
    expect(mulRational(money(1, 'VND'), 5, 10)).toEqual(money(1, 'VND'));
    expect(mulRational(money(3, 'VND'), 5, 10)).toEqual(money(2, 'VND')); // 1.5 -> 2
  });

  it('rounds negative values away from zero', () => {
    expect(mulRational(money(-1, 'VND'), 5, 10)).toEqual(money(-1, 'VND'));
    expect(mulRational(money(-3, 'VND'), 5, 10)).toEqual(money(-2, 'VND'));
  });

  it('handles USD minor units (exponent 2)', () => {
    // 1.99 USD * 1/2 = 0.995 -> 1.00 USD = 100 minor
    expect(mulRational(money(199, 'USD'), 1, 2)).toEqual(money(100, 'USD'));
  });

  it('is exact for large amounts where float would drift', () => {
    // 9_007_199_254_740_991 * 1/3 — float sẽ sai ở đây
    expect(mulRational(money(9007199254740990, 'VND'), 1, 3)).toEqual(
      money(3002399751580330, 'VND'),
    );
  });

  it('rejects a zero denominator', () => {
    expect(() => mulRational(money(100, 'VND'), 1, 0)).toThrow(/denominator/i);
  });

  it('rejects non-integer numerator or denominator', () => {
    expect(() => mulRational(money(100, 'VND'), 0.5, 1)).toThrow(/integer/i);
    expect(() => mulRational(money(100, 'VND'), 1, 2.5)).toThrow(/integer/i);
  });

  it('throws instead of silently overflowing the safe integer range', () => {
    expect(() => mulRational(money(Number.MAX_SAFE_INTEGER, 'VND'), 3, 1)).toThrow(/safe integer/i);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npm run test -- src/core/__tests__/money.test.ts`
Expected: FAIL — `mulRational` is not exported.

- [ ] **Step 3: Implement `mulRational` trong `src/core/money.ts`**

Quy tắc: kết quả = `round_half_away(minor * numerator / denominator)`, toàn bộ bằng số nguyên.
Làm tròn half away from zero trên số nguyên âm/dương:

```ts
/**
 * Nhân money với một phân số `numerator / denominator` bằng số học số nguyên.
 *
 * Cần thiết cho formula (ví dụ `cost = price * 0.6`): `mulInt` chỉ nhận số nguyên.
 * Làm tròn **half away from zero** — 0.5 làm tròn ra xa 0, nhất quán cho cả số âm.
 * Ném lỗi nếu tích trung gian vượt safe integer, thay vì trả về số sai.
 */
export function mulRational(m: Money, numerator: number, denominator: number): Money {
  if (!Number.isInteger(numerator)) {
    throw new Error(`mulRational(): numerator must be an integer, got ${numerator}`);
  }
  if (!Number.isInteger(denominator)) {
    throw new Error(`mulRational(): denominator must be an integer, got ${denominator}`);
  }
  if (denominator === 0) {
    throw new Error('mulRational(): denominator must not be zero');
  }
  if (denominator < 0) {
    return mulRational(m, -numerator, -denominator);
  }

  const product = m.minor * numerator;
  if (!Number.isSafeInteger(product)) {
    throw new Error(
      `mulRational(): minor * numerator exceeds the safe integer range ` +
        `(minor=${m.minor}, numerator=${numerator})`,
    );
  }

  const quotient = Math.trunc(product / denominator);
  const remainder = product % denominator;
  const twiceRemainder = Math.abs(remainder) * 2;

  if (twiceRemainder < denominator) return money(quotient, m.currency);
  if (twiceRemainder > denominator) return money(quotient + Math.sign(product), m.currency);
  // Đúng 0.5 → làm tròn ra xa 0
  return money(quotient + Math.sign(product), m.currency);
}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npm run test -- src/core/__tests__/money.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/money.ts src/core/__tests__/money.test.ts
git commit -m "feat(money): add mulRational for exact fraction multiplication"
```

---

### Task 2: Model định nghĩa type + helper `typeDocId` (TDD)

**Files:**
- Create: `src/core/types/definition.ts`
- Modify: `src/core/db/ids.ts`
- Test: `src/core/db/__tests__/ids.test.ts` (thêm case), `src/core/types/__tests__/definition.test.ts`

**Interfaces:**
- Consumes: `DocEnvelope`, `createEnvelope` (M0)
- Produces:
  - `DATA_TYPES: readonly DataType[]`
  - `type DataType`
  - `interface LocalizedText { vi: string; en: string }`
  - `interface FieldOption { value: string; label: LocalizedText }`
  - `interface FieldDefinition`
  - `interface TypeDefinition`
  - `type TypeDefinitionDoc`
  - `createTypeDefinitionDoc(input): TypeDefinitionDoc`
  - `SYSTEM_FIELD_KEYS: readonly string[]`
  - `typeDocId(typeKey: string): string`

**Quyết định áp dụng:** D1 (`decimal` scale), D3 (`meta_types` toàn hệ thống).

- [ ] **Step 1: Viết failing test cho `typeDocId`**

Thêm vào `src/core/db/__tests__/ids.test.ts`:

```ts
import { typeDocId } from '../ids';

describe('typeDocId', () => {
  it('builds a type document id', () => {
    expect(typeDocId('product')).toBe('type:product');
  });

  it('rejects an empty or colon-containing key', () => {
    expect(() => typeDocId('')).toThrow(/typeKey/);
    expect(() => typeDocId('a:b')).toThrow(/colon/i);
  });
});
```

- [ ] **Step 2: Viết failing test cho model định nghĩa**

`src/core/types/__tests__/definition.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DATA_TYPES, SYSTEM_FIELD_KEYS, createTypeDefinitionDoc } from '../definition';

describe('DATA_TYPES', () => {
  it('covers exactly the data types promised in the spec', () => {
    expect([...DATA_TYPES].sort()).toEqual(
      [
        'boolean', 'color', 'date', 'datetime', 'decimal', 'formula',
        'image', 'money', 'multiselect', 'number', 'reference',
        'select', 'text', 'textarea',
      ].sort(),
    );
  });
});

describe('SYSTEM_FIELD_KEYS', () => {
  it('lists the envelope keys a custom field may not shadow', () => {
    expect([...SYSTEM_FIELD_KEYS]).toEqual(
      expect.arrayContaining(['_id', '_rev', 'docType', 'branchId', 'schemaVersion', 'createdAt', 'updatedAt', 'deletedAt']),
    );
  });
});

describe('createTypeDefinitionDoc', () => {
  it('creates a type document carrying branchId and a version', () => {
    const doc = createTypeDefinitionDoc({
      key: 'product',
      kind: 'builtin_ext',
      baseType: 'product',
      name: { vi: 'Sản phẩm', en: 'Product' },
      branchId: 'hq',
    });

    expect(doc).toMatchObject({
      _id: 'type:product',
      docType: 'meta_type',
      branchId: 'hq',
      kind: 'builtin_ext',
      baseType: 'product',
      version: 1,
      fields: [],
      listView: [],
    });
    expect(doc.createdAt).toBeTruthy();
  });

  it('rejects an entity type that still carries a baseType', () => {
    expect(() =>
      createTypeDefinitionDoc({
        key: 'supplier',
        kind: 'entity',
        baseType: 'product',
        name: { vi: 'Nhà cung cấp', en: 'Supplier' },
        branchId: 'hq',
      }),
    ).toThrow(/baseType/i);
  });

  it('requires a baseType for a builtin_ext type', () => {
    expect(() =>
      createTypeDefinitionDoc({
        key: 'product',
        kind: 'builtin_ext',
        baseType: null,
        name: { vi: 'Sản phẩm', en: 'Product' },
        branchId: 'hq',
      }),
    ).toThrow(/baseType/i);
  });
});
```

- [ ] **Step 3: Chạy test để xác nhận fail**

Run: `npm run test -- src/core/db/__tests__/ids.test.ts src/core/types/__tests__/definition.test.ts`
Expected: FAIL — module `../definition` chưa tồn tại.

- [ ] **Step 4: Thêm `typeDocId` vào `src/core/db/ids.ts`**

```ts
/** `_id` của một type definition trong collection `meta_types`. */
export function typeDocId(typeKey: string): string {
  return `type:${requireSegment(typeKey, 'typeKey')}`;
}
```

`requireSegment()` đã có sẵn và đã từ chối ký tự `:` — dùng lại, đừng viết lại.

- [ ] **Step 5: Viết `src/core/types/definition.ts`**

```ts
import type { DocEnvelope } from '../db/envelope';
import { createEnvelope } from '../db/envelope';
import { typeDocId } from '../db/ids';

/** Kiểu dữ liệu field được hỗ trợ ở v1 — spec §R1. */
export const DATA_TYPES = [
  'text', 'textarea', 'number', 'decimal', 'money', 'boolean',
  'date', 'datetime', 'select', 'multiselect', 'reference',
  'image', 'color', 'formula',
] as const;

export type DataType = (typeof DATA_TYPES)[number];

/** Nhãn song ngữ. `vi` là mặc định. */
export interface LocalizedText {
  readonly vi: string;
  readonly en: string;
}

export interface FieldOption {
  readonly value: string;
  readonly label: LocalizedText;
}

/**
 * Field tuỳ chỉnh trên một type.
 * `key` không được trùng SYSTEM_FIELD_KEYS và không được bắt đầu bằng `_` — xem Task 4.
 */
export interface FieldDefinition {
  readonly key: string;
  readonly label: LocalizedText;
  readonly dataType: DataType;
  readonly required: boolean;
  readonly defaultValue?: unknown;
  /** Chỉ dùng cho `select` / `multiselect`. */
  readonly options?: readonly FieldOption[];
  /** Chỉ dùng cho `decimal` — số chữ số thập phân (mặc định 2). */
  readonly scale?: number;
  /** Chỉ dùng cho `reference` — key của type được trỏ tới. */
  readonly referenceType?: string;
  /** Chỉ dùng cho `formula` — biểu thức nguồn, ví dụ `price * 0.6`. */
  readonly formula?: string;
  /** Chỉ dùng cho `number` / `decimal` / `money`. */
  readonly min?: number;
  readonly max?: number;
  /** Admin chủ động bật index — Risk #12 giới hạn tổng số. */
  readonly indexed?: boolean;
  readonly ui?: {
    readonly widget?: string;
    readonly group?: string;
  };
}

export type TypeKind = 'builtin_ext' | 'entity';

export interface TypeDefinition {
  readonly key: string;
  readonly kind: TypeKind;
  readonly baseType: string | null;
  readonly name: LocalizedText;
  readonly version: number;
  readonly fields: readonly FieldDefinition[];
  readonly listView: readonly string[];
}

/** Document thật trong collection `meta_types`. */
export type TypeDefinitionDoc = DocEnvelope<'meta_type'> & TypeDefinition;

/** Field hệ thống của envelope — field tuỳ chỉnh không được trùng tên. */
export const SYSTEM_FIELD_KEYS = [
  '_id', '_rev', 'docType', 'branchId', 'schemaVersion',
  'createdAt', 'updatedAt', 'deletedAt',
] as const;

export interface CreateTypeDefinitionInput {
  readonly key: string;
  readonly kind: TypeKind;
  readonly baseType: string | null;
  readonly name: LocalizedText;
  readonly branchId: string;
}

export function createTypeDefinitionDoc(input: CreateTypeDefinitionInput): TypeDefinitionDoc {
  if (input.kind === 'entity' && input.baseType !== null) {
    throw new Error(`createTypeDefinitionDoc(): entity type must have baseType null, got ${input.baseType}`);
  }
  if (input.kind === 'builtin_ext' && (input.baseType === null || input.baseType.trim() === '')) {
    throw new Error('createTypeDefinitionDoc(): builtin_ext type requires a baseType');
  }

  return {
    ...createEnvelope({
      id: typeDocId(input.key),
      docType: 'meta_type',
      branchId: input.branchId,
    }),
    key: input.key,
    kind: input.kind,
    baseType: input.baseType,
    name: input.name,
    version: 1,
    fields: [],
    listView: [],
  };
}
```

- [ ] **Step 6: Chạy test để xác nhận pass**

Run: `npm run test -- src/core/db/__tests__/ids.test.ts src/core/types/__tests__/definition.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/db/ids.ts src/core/types/definition.ts src/core/db/__tests__/ids.test.ts src/core/types/__tests__/definition.test.ts
git commit -m "feat(types): add type definition model and typeDocId helper"
```

---

### Task 3: Field-type registry — validator + formatter cho 14 data type (TDD)

**Files:**
- Create: `src/core/types/field-registry.ts`
- Test: `src/core/types/__tests__/field-registry.test.ts`

**Interfaces:**
- Consumes: `DataType`, `FieldDefinition` (Task 2), `Money`, `money` (M0)
- Produces:
  - `interface ValidationIssue { readonly path: string; readonly code: ValidationCode; readonly message: string }`
  - `type ValidationCode = 'required' | 'type' | 'range' | 'length' | 'option' | 'scale' | 'reference'`
  - `interface FieldTypeDefinition { dataType; validate(value, field): ValidationIssue[]; format(value, field, locale): string; defaultWidget: string; widgetOptions: readonly string[]; formulaSupport: boolean }`
  - `const FIELD_TYPES: Record<DataType, FieldTypeDefinition>`
  - `function fieldType(dataType: DataType): FieldTypeDefinition`
  - `function defaultValueFor(field: FieldDefinition): unknown`
  - `function formatFieldValue(value: unknown, field: FieldDefinition, locale: SupportedLocale): string`

**Quyết định áp dụng:** D1 (`decimal` = số nguyên đã scale).

- [ ] **Step 1: Viết failing test**

`src/core/types/__tests__/field-registry.test.ts` — bảng dưới là **hợp đồng**, mỗi dòng phải có một case:

```ts
import { describe, it, expect } from 'vitest';
import { DATA_TYPES, type FieldDefinition } from '../definition';
import { FIELD_TYPES, fieldType, defaultValueFor, formatFieldValue } from '../field-registry';

function field(over: Partial<FieldDefinition> & Pick<FieldDefinition, 'dataType'>): FieldDefinition {
  return { key: 'f', label: { vi: 'F', en: 'F' }, required: false, ...over };
}

/** [dataType, value, số issue mong đợi] */
const VALID_CASES: [FieldDefinition['dataType'], unknown, number][] = [
  ['text', 'Phở bò', 0],
  ['text', 42, 1],                    // sai kiểu
  ['textarea', 'nhiều\ndòng', 0],
  ['number', 42, 0],
  ['number', 42.5, 1],                // number là số nguyên
  ['decimal', 1234, 0],               // 12.34 với scale 2
  ['decimal', 12.34, 1],              // float bị từ chối
  ['money', { minor: 69000, currency: 'VND' }, 0],
  ['money', 69000, 1],                // phải là Money, không phải number
  ['boolean', true, 0],
  ['boolean', 'true', 1],
  ['date', '2026-10-20', 0],
  ['date', '20/10/2026', 1],          // phải là ISO
  ['datetime', '2026-10-20T10:00:00.000Z', 0],
  ['datetime', '2026-10-20', 1],
  ['select', 'mild', 0],
  ['select', 'khong-co-trong-options', 1],
  ['multiselect', ['mild', 'hot'], 0],
  ['multiselect', ['mild', 'khong-co-trong-options'], 1],
  ['multiselect', 'mild', 1],         // phải là mảng
  ['reference', 'product:p001', 0],
  ['reference', '', 1],
  ['image', 'data:image/png;base64,AAA', 0],
  ['image', 12345, 1],
  ['color', '#b45309', 0],
  ['color', 'do', 1],                 // phải là hex
  ['formula', null, 0],               // formula không nhận input trực tiếp
];

describe('FIELD_TYPES registry', () => {
  it('has an entry for every declared data type', () => {
    expect(Object.keys(FIELD_TYPES).sort()).toEqual([...DATA_TYPES].sort());
  });

  it('fieldType() throws for an unknown data type', () => {
    expect(() => fieldType('nope' as never)).toThrow(/unknown data type/i);
  });

  it.each(VALID_CASES)('validates %s with value %o -> %i issue(s)', (dataType, value, expected) => {
    expect(fieldType(dataType).validate(value, field({ dataType }))).toHaveLength(expected);
  });
});

describe('defaultValueFor', () => {
  it('returns the declared default when present', () => {
    expect(defaultValueFor(field({ dataType: 'text', defaultValue: 'abc' }))).toBe('abc');
  });

  it.each([
    ['text', ''],
    ['number', null],
    ['boolean', false],
    ['multiselect', []],
  ] as const)('falls back to an empty value for %s', (dataType, expected) => {
    expect(defaultValueFor(field({ dataType }))).toEqual(expected);
  });
});

describe('formatFieldValue', () => {
  it('formats money using the money formatter', () => {
    expect(formatFieldValue({ minor: 69000, currency: 'VND' }, field({ dataType: 'money' }), 'vi')).toContain('69');
  });

  it('formats decimal using its scale', () => {
    expect(formatFieldValue(1234, field({ dataType: 'decimal', scale: 2 }), 'vi')).toBe('12.34');
  });

  it('formats a boolean through i18n-neutral words', () => {
    expect(formatFieldValue(true, field({ dataType: 'boolean' }), 'vi')).toBe('true');
  });

  it('renders a dash for an empty value', () => {
    expect(formatFieldValue(null, field({ dataType: 'text' }), 'vi')).toBe('—');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npm run test -- src/core/types/__tests__/field-registry.test.ts`
Expected: FAIL — `../field-registry` chưa tồn tại.

- [ ] **Step 3: Viết `src/core/types/field-registry.ts`**

Yêu cầu:
- Một entry cho **mỗi** `DataType` trong `DATA_TYPES`. `fieldType()` ném lỗi rõ ràng cho type lạ.
- `money` validate phải kiểm tra shape `Money` (dùng `Number.isSafeInteger` trên `minor`) — **không** chấp nhận number thô.
- `decimal` validate từ chối số không nguyên (float) và kiểm tra `scale`.
- `date` / `datetime` validate theo ISO 8601 (`YYYY-MM-DD` và dạng đầy đủ có `T`).
- `select` / `multiselect` đối chiếu với `field.options`.
- `image` v1 chỉ chấp nhận data URL hoặc id tham chiếu dạng chuỗi (spec §13.2 — ảnh không nhét thẳng vào document; xem §Decisions).
- `formula` có `formulaSupport: true` nhưng `validate()` **luôn trả về rỗng** — giá trị do interpreter sinh, không phải người dùng nhập.
- `formulaSupport: true` cho `number`, `decimal`, `money`, `boolean`, `formula`; `false` cho phần còn lại (quyết định D4).
- `formatFieldValue` với giá trị rỗng (`null`/`undefined`/`''`) trả về `'—'`.
- `defaultWidget` / `widgetOptions` là chuỗi tên widget — **không** import Vue ở file này.

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npm run test -- src/core/types/__tests__/field-registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/types/field-registry.ts src/core/types/__tests__/field-registry.test.ts
git commit -m "feat(types): add field-type registry with validators and formatters"
```

---

### Task 4: Validation engine cho type definition (TDD)

**Vì sao:** Review Focus #2 và #4 — formula trỏ tới field không tồn tại, và field key trùng hệ thống. Cả hai phải bị chặn **lúc lưu type**, không phải lúc chạy.

**Files:**
- Create: `src/core/types/definition-validation.ts`
- Test: `src/core/types/__tests__/definition-validation.test.ts`

**Interfaces:**
- Consumes: `TypeDefinition`, `FieldDefinition`, `DATA_TYPES`, `SYSTEM_FIELD_KEYS` (Task 2); `parseFormula` (Task 6)
- Produces:
  - `const MAX_INDEXED_FIELDS = 5`
  - `function validateTypeDefinition(def: TypeDefinition): ValidationIssue[]`
  - `function assertValidTypeDefinition(def: TypeDefinition): void` — ném lỗi gộp mọi issue

**Thứ tự phụ thuộc:** Task này cần `parseFormula` (Task 6) để trích dependency. Thứ tự chạy đề xuất là **1 → 2 → 3 → 5 → 6 → 7 → 4**: làm Task 5, 6, 7 trước rồi mới quay lại Task 4.

- [ ] **Step 1: Viết failing test**

`src/core/types/__tests__/definition-validation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { FieldDefinition, TypeDefinition } from '../definition';
import { MAX_INDEXED_FIELDS, validateTypeDefinition } from '../definition-validation';

function f(over: Partial<FieldDefinition> & Pick<FieldDefinition, 'key' | 'dataType'>): FieldDefinition {
  return { label: { vi: over.key, en: over.key }, required: false, ...over };
}

function typeOf(fields: FieldDefinition[], listView: string[] = []): TypeDefinition {
  return { key: 'product', kind: 'builtin_ext', baseType: 'product', name: { vi: 'SP', en: 'Product' }, version: 1, fields, listView };
}

function codes(def: TypeDefinition): string[] {
  return validateTypeDefinition(def).map((i) => i.code).sort();
}

describe('validateTypeDefinition', () => {
  it('accepts a well-formed definition', () => {
    expect(validateTypeDefinition(typeOf([f({ key: 'spicy_level', dataType: 'select', options: [{ value: 'none', label: { vi: 'Không', en: 'None' } }] })], ['spicy_level']))).toEqual([]);
  });

  it('rejects a field key starting with an underscore', () => {
    expect(codes(typeOf([f({ key: '_secret', dataType: 'text' })]))).toContain('reserved_key');
  });

  it('rejects a field key that shadows a system field', () => {
    expect(codes(typeOf([f({ key: 'branchId', dataType: 'text' })]))).toContain('reserved_key');
    expect(codes(typeOf([f({ key: 'schemaVersion', dataType: 'number' })]))).toContain('reserved_key');
  });

  it('rejects duplicate field keys', () => {
    expect(codes(typeOf([f({ key: 'dup', dataType: 'text' }), f({ key: 'dup', dataType: 'number' })]))).toContain('duplicate_key');
  });

  it('rejects a select field with no options', () => {
    expect(codes(typeOf([f({ key: 'sel', dataType: 'select' })]))).toContain('missing_options');
  });

  it('rejects duplicate option values', () => {
    expect(codes(typeOf([f({ key: 'sel', dataType: 'select', options: [
      { value: 'a', label: { vi: 'A', en: 'A' } },
      { value: 'a', label: { vi: 'B', en: 'B' } },
    ] })]))).toContain('duplicate_option');
  });

  it('rejects a formula field that references an unknown field', () => {
    expect(codes(typeOf([f({ key: 'cost', dataType: 'formula', formula: 'price * 0.6' })]))).toContain('unknown_field');
  });

  it('accepts a formula field whose dependencies all exist', () => {
    expect(validateTypeDefinition(typeOf([
      f({ key: 'price', dataType: 'money' }),
      f({ key: 'cost', dataType: 'formula', formula: 'price * 0.6' }),
    ]))).toEqual([]);
  });

  it('detects a formula cycle', () => {
    expect(codes(typeOf([
      f({ key: 'a', dataType: 'formula', formula: 'b + 1' }),
      f({ key: 'b', dataType: 'formula', formula: 'a + 1' }),
    ]))).toContain('formula_cycle');
  });

  it('detects a longer formula cycle', () => {
    expect(codes(typeOf([
      f({ key: 'a', dataType: 'formula', formula: 'b + 1' }),
      f({ key: 'b', dataType: 'formula', formula: 'c + 1' }),
      f({ key: 'c', dataType: 'formula', formula: 'a + 1' }),
    ]))).toContain('formula_cycle');
  });

  it('rejects a formula referencing a field that cannot be used in formulas', () => {
    expect(codes(typeOf([
      f({ key: 'note', dataType: 'textarea' }),
      f({ key: 'cost', dataType: 'formula', formula: 'note + 1' }),
    ]))).toContain('formula_unsupported_type');
  });

  it('rejects more than MAX_INDEXED_FIELDS indexed fields', () => {
    const fields = Array.from({ length: MAX_INDEXED_FIELDS + 1 }, (_, i) =>
      f({ key: `k${i}`, dataType: 'text', indexed: true }),
    );
    expect(codes(typeOf(fields))).toContain('too_many_indexed');
  });

  it('rejects a listView entry that is not a declared field', () => {
    expect(codes(typeOf([f({ key: 'name', dataType: 'text' })], ['name', 'ghost']))).toContain('unknown_list_field');
  });

  it('rejects a reference field with no referenceType', () => {
    expect(codes(typeOf([f({ key: 'ref', dataType: 'reference' })]))).toContain('missing_reference_type');
  });

  it('assertValidTypeDefinition throws with every issue in the message', () => {
    expect(() => assertValidTypeDefinition(typeOf([f({ key: '_bad', dataType: 'select' })]))).toThrow(/_bad/);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npm run test -- src/core/types/__tests__/definition-validation.test.ts`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết `src/core/types/definition-validation.ts`**

Yêu cầu:
- Trả về **mảng** issue (rỗng = hợp lệ), không ném lỗi — để Type Designer UI hiển thị cùng lúc nhiều lỗi.
- `assertValidTypeDefinition` mới ném, gộp message.
- Kiểm tra: `reserved_key`, `duplicate_key`, `unknown_data_type`, `missing_options`, `duplicate_option`, `missing_reference_type`, `too_many_indexed`, `unknown_list_field`, `unknown_field` (formula dep), `formula_cycle`, `formula_unsupported_type`, `formula_syntax`.
- `formula_cycle` phải dùng DFS có đánh dấu ba trạng thái (unvisited / in-progress / done) — phát hiện cả chu trình dài, không chỉ `a↔b`.
- Chỉ coi **field `formula`** là nút trong đồ thị phụ thuộc; field thường là lá.
- `MAX_INDEXED_FIELDS = 5` (Risk #12) — export để UI hiển thị và test tham chiếu.

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npm run test -- src/core/types/__tests__/definition-validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/types/definition-validation.ts src/core/types/__tests__/definition-validation.test.ts
git commit -m "feat(types): add type definition validation engine"
```

---

### Task 5: Số hữu tỉ chính xác cho formula (TDD)

**Vì sao:** Formula phải tính `price * 0.6 / 3` mà không dùng float và không mất chính xác giữa các bước. Số hữu tỉ cho phép **làm tròn một lần ở cuối** thay vì làm tròn sau mỗi phép.

**Files:**
- Create: `src/core/types/rational.ts`
- Test: `src/core/types/__tests__/rational.test.ts`

**Interfaces:**
- Produces:
  - `interface Rational { readonly n: number; readonly d: number }` — luôn tối giản, `d > 0`
  - `rat(n: number, d?: number): Rational`
  - `ratFromDecimal(text: string): Rational` — `'0.6'` → `3/5`
  - `ratAdd`, `ratSub`, `ratMul`, `ratDiv`
  - `ratCmp(a, b): -1 | 0 | 1`
  - `ratIsInteger(r): boolean`
  - `ratToNumber(r): number`
  - `ratRound(r): number` — half away from zero, trả về số nguyên

- [ ] **Step 1: Viết failing test**

`src/core/types/__tests__/rational.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { rat, ratFromDecimal, ratAdd, ratSub, ratMul, ratDiv, ratCmp, ratIsInteger, ratRound } from '../rational';

describe('rat', () => {
  it('reduces to lowest terms with a positive denominator', () => {
    expect(rat(6, 8)).toEqual({ n: 3, d: 4 });
    expect(rat(1, -2)).toEqual({ n: -1, d: 2 });
    expect(rat(0, 5)).toEqual({ n: 0, d: 1 });
  });

  it('rejects a zero denominator', () => {
    expect(() => rat(1, 0)).toThrow(/denominator/i);
  });
});

describe('ratFromDecimal', () => {
  it('parses decimal literals exactly', () => {
    expect(ratFromDecimal('0.6')).toEqual({ n: 3, d: 5 });
    expect(ratFromDecimal('1.25')).toEqual({ n: 5, d: 4 });
    expect(ratFromDecimal('3')).toEqual({ n: 3, d: 1 });
    expect(ratFromDecimal('-0.1')).toEqual({ n: -1, d: 10 });
  });

  it('rejects malformed literals', () => {
    expect(() => ratFromDecimal('1.2.3')).toThrow(/number/i);
    expect(() => ratFromDecimal('abc')).toThrow(/number/i);
  });
});

describe('arithmetic', () => {
  it('adds and subtracts exactly', () => {
    expect(ratAdd(rat(1, 3), rat(1, 6))).toEqual({ n: 1, d: 2 });
    expect(ratSub(rat(1, 2), rat(1, 3))).toEqual({ n: 1, d: 6 });
  });

  it('multiplies and divides exactly', () => {
    expect(ratMul(rat(2, 3), rat(3, 4))).toEqual({ n: 1, d: 2 });
    expect(ratDiv(rat(1, 2), rat(1, 4))).toEqual({ n: 2, d: 1 });
  });

  it('throws on division by zero', () => {
    expect(() => ratDiv(rat(1, 2), rat(0))).toThrow(/zero/i);
  });

  it('compares', () => {
    expect(ratCmp(rat(1, 3), rat(1, 2))).toBe(-1);
    expect(ratCmp(rat(1, 2), rat(1, 2))).toBe(0);
    expect(ratCmp(rat(2, 3), rat(1, 2))).toBe(1);
  });

  it('throws instead of silently overflowing the safe integer range', () => {
    expect(() => ratMul(rat(Number.MAX_SAFE_INTEGER), rat(Number.MAX_SAFE_INTEGER))).toThrow(/safe integer/i);
  });
});

describe('ratRound', () => {
  it('rounds half away from zero to an integer', () => {
    expect(ratRound(rat(5, 10))).toBe(1);
    expect(ratRound(rat(3, 10))).toBe(0);
    expect(ratRound(rat(15, 10))).toBe(2);
    expect(ratRound(rat(-5, 10))).toBe(-1);
    expect(ratRound(rat(-15, 10))).toBe(-2);
  });

  it('returns the integer unchanged when already whole', () => {
    expect(ratRound(rat(4))).toBe(4);
    expect(ratIsInteger(rat(4))).toBe(true);
    expect(ratIsInteger(rat(4, 3))).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npm run test -- src/core/types/__tests__/rational.test.ts`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết `src/core/types/rational.ts`**

Yêu cầu:
- Dùng `gcd` để tối giản sau **mỗi** phép toán; giữ `d > 0`.
- Mọi tích trung gian (`n * n`, `n * d`) phải kiểm tra `Number.isSafeInteger` và **ném lỗi** khi vượt — cùng phong cách với `allocate()` và `mulRational()`.
- `ratFromDecimal` parse chuỗi thập phân (`/^-?\d+(\.\d+)?$/`), đếm chữ số thập phân để dựng mẫu số `10^k`, rồi tối giản. **Không** đi qua `parseFloat`.
- `ratRound` = half away from zero: `Math.trunc(n/d)` rồi so `2*|remainder|` với `d` — giống quy tắc trong `mulRational`.

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npm run test -- src/core/types/__tests__/rational.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/types/rational.ts src/core/types/__tests__/rational.test.ts
git commit -m "feat(types): add exact rational arithmetic for formulas"
```

---

### Task 6: Tokenizer + parser cho formula → AST (TDD)

**Files:**
- Create: `src/core/types/formula.ts`
- Test: `src/core/types/__tests__/formula.test.ts`

**Interfaces:**
- Consumes: `Rational`, `ratFromDecimal` (Task 5)
- Produces:
  - `type FormulaNode` (union — xem dưới)
  - `type FormulaFunctionName = 'sum' | 'avg' | 'round' | 'if'`
  - `interface ParsedFormula { readonly source: string; readonly ast: FormulaNode; readonly dependencies: readonly string[] }`
  - `class FormulaError extends Error { readonly code: FormulaErrorCode }`
  - `type FormulaErrorCode = 'syntax' | 'unknown_function' | 'arity'`
  - `function parseFormula(source: string): ParsedFormula`

```ts
export type FormulaNode =
  | { readonly kind: 'number'; readonly value: Rational }
  | { readonly kind: 'field'; readonly key: string }
  | { readonly kind: 'unary'; readonly op: '-' | '!'; readonly operand: FormulaNode }
  | { readonly kind: 'binary'; readonly op: '+' | '-' | '*' | '/' | '%'; readonly left: FormulaNode; readonly right: FormulaNode }
  | { readonly kind: 'compare'; readonly op: '<' | '<=' | '>' | '>=' | '==' | '!='; readonly left: FormulaNode; readonly right: FormulaNode }
  | { readonly kind: 'logical'; readonly op: '&&' | '||'; readonly left: FormulaNode; readonly right: FormulaNode }
  | { readonly kind: 'call'; readonly name: FormulaFunctionName; readonly args: readonly FormulaNode[] };
```

- [ ] **Step 1: Viết failing test**

`src/core/types/__tests__/formula.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseFormula } from '../formula';

describe('parseFormula', () => {
  it('parses a money multiplication from the spec example', () => {
    const { ast, dependencies } = parseFormula('price * 0.6');
    expect(ast).toEqual({
      kind: 'binary', op: '*',
      left: { kind: 'field', key: 'price' },
      right: { kind: 'number', value: { n: 3, d: 5 } },
    });
    expect(dependencies).toEqual(['price']);
  });

  it('respects operator precedence', () => {
    const { ast } = parseFormula('a + b * c');
    expect(ast).toEqual({
      kind: 'binary', op: '+',
      left: { kind: 'field', key: 'a' },
      right: { kind: 'binary', op: '*', left: { kind: 'field', key: 'b' }, right: { kind: 'field', key: 'c' } },
    });
  });

  it('honours parentheses', () => {
    const { ast } = parseFormula('(a + b) * c');
    expect(ast).toMatchObject({ kind: 'binary', op: '*', left: { kind: 'binary', op: '+' } });
  });

  it('parses comparisons and logical operators', () => {
    expect(parseFormula('a >= 10 && b != 0').ast).toMatchObject({ kind: 'logical', op: '&&' });
    expect(parseFormula('a < b').ast).toMatchObject({ kind: 'compare', op: '<' });
  });

  it('parses calls and collects dependencies from arguments', () => {
    const { ast, dependencies } = parseFormula('sum(price, tax, discount)');
    expect(ast).toMatchObject({ kind: 'call', name: 'sum' });
    expect([...dependencies].sort()).toEqual(['discount', 'price', 'tax']);
  });

  it('parses the spec whitelist of functions only', () => {
    expect(() => parseFormula('sum(1, 2)')).not.toThrow();
    expect(() => parseFormula('avg(1, 2)')).not.toThrow();
    expect(() => parseFormula('round(1.5)')).not.toThrow();
    expect(() => parseFormula('if(1, 2, 3)')).not.toThrow();
    expect(() => parseFormula('eval("1+1")')).toThrow(/unknown function/i);
    expect(() => parseFormula('max(1, 2)')).toThrow(/unknown function/i);
  });

  it('parses nested calls', () => {
    const { dependencies } = parseFormula('round(price * 0.6, 2)');
    expect(dependencies).toEqual(['price']);
  });

  it('reports arity errors', () => {
    expect(() => parseFormula('if(1, 2)')).toThrow(/expects/i);
    expect(() => parseFormula('round()')).toThrow(/expects/i);
  });

  it('rejects syntax errors', () => {
    expect(() => parseFormula('a +')).toThrow(/syntax/i);
    expect(() => parseFormula('(a + b')).toThrow(/syntax/i);
    expect(() => parseFormula('a b')).toThrow(/syntax/i);
    expect(() => parseFormula('')).toThrow(/syntax/i);
  });

  it('never touches the global scope', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).secret = 42;
    expect(() => parseFormula('secret')).not.toThrow(); // parse được…
    // …nhưng là field reference, không phải global. Evaluation mới là nơi từ chối — Task 7.
    expect(parseFormula('secret').ast).toEqual({ kind: 'field', key: 'secret' });
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npm run test -- src/core/types/__tests__/formula.test.ts`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết `src/core/types/formula.ts`**

Yêu cầu:
- **Không** dùng `eval`, `new Function`, hay `Function` constructor. Parser viết tay (recursive descent hoặc Pratt).
- Thứ tự ưu tiên: `||` < `&&` < so sánh < `+ -` < `* / %` < unary < call/primary.
- Tokenizer nhận: số (nguyên + thập phân), identifier (`[A-Za-z_][A-Za-z0-9_]*`), toán tử, dấu ngoặc, dấu phẩy.
- Hàm ngoài whitelist → `FormulaError` code `unknown_function`. Sai số tham số → code `arity`.
- `dependencies` = các `kind: 'field'` **duy nhất**, giữ thứ tự xuất hiện đầu tiên.
- `FormulaError` phải có `code` để Task 4 phân loại issue.

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npm run test -- src/core/types/__tests__/formula.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/types/formula.ts src/core/types/__tests__/formula.test.ts
git commit -m "feat(types): add formula tokenizer and parser"
```

---

### Task 7: Formula interpreter (TDD)

**Files:**
- Create: `src/core/types/formula-eval.ts`
- Test: `src/core/types/__tests__/formula-eval.test.ts`

**Interfaces:**
- Consumes: `FormulaNode`, `ParsedFormula`, `FormulaError` (Task 6); `Rational`, `ratAdd`, `ratSub`, `ratMul`, `ratDiv`, `ratCmp`, `ratRound` (Task 5); `Money`, `money`, `mulRational` (Task 1)
- Produces:
  - `type FormulaValue = { readonly kind: 'number'; readonly value: Rational } | { readonly kind: 'money'; readonly money: Money } | { readonly kind: 'boolean'; readonly value: boolean }`
  - `function evaluateFormula(parsed: ParsedFormula, values: Readonly<Record<string, FormulaValue>>): FormulaValue`
  - `function formulaValueOf(field: FieldDefinition, raw: unknown): FormulaValue | null`

**Quyết định áp dụng:** D4 — chỉ number/money/boolean tham gia formula.

- [ ] **Step 1: Viết failing test**

`src/core/types/__tests__/formula-eval.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseFormula } from '../formula';
import { evaluateFormula, type FormulaValue } from '../formula-eval';
import { money } from '../../money';

const num = (n: number, d = 1): FormulaValue => ({ kind: 'number', value: { n, d } });
const usd = (minor: number): FormulaValue => ({ kind: 'money', money: money(minor, 'USD') });
const vnd = (minor: number): FormulaValue => ({ kind: 'money', money: money(minor, 'VND') });
const bool = (value: boolean): FormulaValue => ({ kind: 'boolean', value });

function evalSrc(src: string, values: Record<string, FormulaValue>): FormulaValue {
  return evaluateFormula(parseFormula(src), values);
}

describe('evaluateFormula — arithmetic', () => {
  it('evaluates the spec example exactly', () => {
    expect(evalSrc('price * 0.6', { price: vnd(100000) })).toEqual(vnd(60000));
  });

  it('keeps full precision through a chain and rounds once', () => {
    // 100000 * 0.6 / 3 = 20000, không bị lỗi làm tròn trung gian
    expect(evalSrc('price * 0.6 / 3', { price: vnd(100000) })).toEqual(vnd(20000));
  });

  it('multiplies money by money only through a scalar', () => {
    expect(evalSrc('price * qty', { price: vnd(69000), qty: num(3) })).toEqual(vnd(207000));
  });

  it('rejects adding two different currencies', () => {
    expect(() => evalSrc('a + b', { a: vnd(100), b: usd(100) })).toThrow(/currency/i);
  });

  it('rejects arithmetic between money and boolean', () => {
    expect(() => evalSrc('a + b', { a: vnd(100), b: bool(true) })).toThrow(/type/i);
  });

  it('rounds money results half away from zero', () => {
    expect(evalSrc('price * 0.5', { price: vnd(1) })).toEqual(vnd(1));
    expect(evalSrc('price * 0.5', { price: vnd(-1) })).toEqual(vnd(-1));
  });
});

describe('evaluateFormula — comparisons and logic', () => {
  it('compares money and numbers', () => {
    expect(evalSrc('price >= 100', { price: vnd(100) })).toEqual(bool(true));
    expect(evalSrc('price > 100', { price: vnd(100) })).toEqual(bool(false));
  });

  it('evaluates logical operators', () => {
    expect(evalSrc('a && b', { a: bool(true), b: bool(false) })).toEqual(bool(false));
    expect(evalSrc('a || b', { a: bool(true), b: bool(false) })).toEqual(bool(true));
    expect(evalSrc('!a', { a: bool(false) })).toEqual(bool(true));
  });
});

describe('evaluateFormula — functions', () => {
  it('sum() adds every argument', () => {
    expect(evalSrc('sum(1, 2, 3)', {})).toEqual(num(6));
  });

  it('sum() over money keeps the currency', () => {
    expect(evalSrc('sum(a, b)', { a: vnd(100), b: vnd(250) })).toEqual(vnd(350));
  });

  it('avg() divides by the argument count', () => {
    expect(evalSrc('avg(1, 2, 4)', {})).toEqual(num(7, 3));
  });

  it('round() rounds to the given number of digits', () => {
    expect(evalSrc('round(1.2345, 2)', {})).toEqual(num(123, 100));
    expect(evalSrc('round(1.235, 2)', {})).toEqual(num(124, 100));
  });

  it('if() picks a branch', () => {
    expect(evalSrc('if(1 < 2, 10, 20)', {})).toEqual(num(10));
    expect(evalSrc('if(1 > 2, 10, 20)', {})).toEqual(num(20));
  });

  it('if() requires a boolean condition', () => {
    expect(() => evalSrc('if(1, 10, 20)', {})).toThrow(/boolean/i);
  });
});

describe('evaluateFormula — errors', () => {
  it('rejects a field that is not in the value map', () => {
    expect(() => evalSrc('ghost + 1', {})).toThrow(/unknown field/i);
  });

  it('rejects division by zero', () => {
    expect(() => evalSrc('a / b', { a: num(1), b: num(0) })).toThrow(/zero/i);
  });
});

describe('formulaValueOf', () => {
  it('converts a money field value', () => {
    expect(formulaValueOf({ key: 'p', dataType: 'money', label: { vi: 'P', en: 'P' }, required: false }, money(100, 'VND')))
      .toEqual({ kind: 'money', money: money(100, 'VND') });
  });

  it('converts a decimal field value using its scale', () => {
    expect(formulaValueOf({ key: 'd', dataType: 'decimal', scale: 2, label: { vi: 'D', en: 'D' }, required: false }, 1234))
      .toEqual({ kind: 'number', value: { n: 617, d: 50 } });
  });

  it('returns null for a type that cannot participate in formulas', () => {
    expect(formulaValueOf({ key: 'n', dataType: 'textarea', label: { vi: 'N', en: 'N' }, required: false }, 'abc')).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npm run test -- src/core/types/__tests__/formula-eval.test.ts`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết `src/core/types/formula-eval.ts`**

Yêu cầu:
- Interpreter là `switch` trên `node.kind`, **không** đệ quy qua `eval`.
- `money ± money` → `money`, giữ nguyên currency; lệch currency → ném lỗi (dùng lại `add`/`sub` của M0 để thông điệp nhất quán).
- `money * number` và `money / number` → `mulRational(money, r.n, r.d)` rồi bọc `money` (Task 1). Đây là chỗ **duy nhất** money gặp số hữu tỉ.
- `number` thuần → số học `Rational` chính xác.
- `%` chỉ cho `number` (money lấy dư không có nghĩa nghiệp vụ ở v1).
- So sánh: `number`↔`number` và `money`↔`money` (cùng currency). So sánh khác kiểu → ném lỗi.
- `&& || !` chỉ cho `boolean`.
- `round(x, digits)`: `digits` mặc định 0; làm tròn half away from zero trên `Rational`.
- `if(cond, then, else)`: `cond` phải `boolean`; chỉ **một** nhánh được tính (lazy) để tránh chia cho 0 ở nhánh không chọn.
- Field không có trong `values` → ném lỗi `unknown field` (không trả `null`).

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npm run test -- src/core/types/__tests__/formula-eval.test.ts`
Expected: PASS.

- [ ] **Step 5: Quay lại Task 4** (nếu chưa làm) để nối `parseFormula` + `dependencies` vào validation engine. Chạy lại toàn bộ `src/core/types/__tests__/`.

- [ ] **Step 6: Commit**

```bash
git add src/core/types/formula-eval.ts src/core/types/__tests__/formula-eval.test.ts
git commit -m "feat(types): add formula interpreter with money-aware arithmetic"
```

---

### Task 8: Migration transform khai báo (TDD)

**Vì sao:** Risk #11 — sửa type có thể phá dữ liệu đang có. Spec §4.1 chốt: transform phải **khai báo** (rename, add default, map value), **không phải code tuỳ ý** ở v1. Task này là tầng thực thi transform.

**Files:**
- Create: `src/core/types/migration.ts`
- Test: `src/core/types/__tests__/migration.test.ts`

**Interfaces:**
- Produces:
  - `type MigrationTransform` (union — xem dưới)
  - `interface TypeMigration { readonly fromVersion: number; readonly toVersion: number; readonly transforms: readonly MigrationTransform[] }`
  - `interface TransformResult { readonly data: Readonly<Record<string, unknown>>; readonly applied: readonly string[] }`
  - `class MigrationError extends Error { readonly code: MigrationErrorCode }`
  - `function applyTransforms(data, transforms): TransformResult`

```ts
export type MigrationTransform =
  | { readonly kind: 'rename'; readonly from: string; readonly to: string }
  | { readonly kind: 'addDefault'; readonly field: string; readonly value: unknown }
  | { readonly kind: 'mapValue'; readonly field: string; readonly map: Readonly<Record<string, unknown>>; readonly fallback?: unknown }
  | { readonly kind: 'removeField'; readonly field: string };

export type MigrationErrorCode =
  | 'rename_target_exists'
  | 'unmapped_value'
  | 'reserved_field'
  | 'unknown_transform';
```

- [ ] **Step 1: Viết failing test**

`src/core/types/__tests__/migration.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyTransforms, MigrationError } from '../migration';

describe('applyTransforms — rename', () => {
  it('moves the value to the new key and drops the old one', () => {
    const { data } = applyTransforms({ spicy: 'mild', name: 'Phở' }, [
      { kind: 'rename', from: 'spicy', to: 'spicy_level' },
    ]);
    expect(data).toEqual({ spicy_level: 'mild', name: 'Phở' });
    expect('spicy' in data).toBe(false);
  });

  it('is a no-op when the source field is absent', () => {
    const { data } = applyTransforms({ name: 'Phở' }, [
      { kind: 'rename', from: 'spicy', to: 'spicy_level' },
    ]);
    expect(data).toEqual({ name: 'Phở' });
  });

  it('refuses to overwrite an existing target key', () => {
    expect(() =>
      applyTransforms({ a: 1, b: 2 }, [{ kind: 'rename', from: 'a', to: 'b' }]),
    ).toThrow(MigrationError);
    try {
      applyTransforms({ a: 1, b: 2 }, [{ kind: 'rename', from: 'a', to: 'b' }]);
    } catch (error) {
      expect((error as MigrationError).code).toBe('rename_target_exists');
    }
  });

  it('refuses to touch a reserved system field', () => {
    expect(() =>
      applyTransforms({ branchId: 'hq' }, [{ kind: 'rename', from: 'branchId', to: 'b' }]),
    ).toThrow(/reserved/i);
  });
});

describe('applyTransforms — addDefault', () => {
  it('fills a field that is missing', () => {
    const { data } = applyTransforms({ name: 'Phở' }, [
      { kind: 'addDefault', field: 'spicy_level', value: 'none' },
    ]);
    expect(data).toEqual({ name: 'Phở', spicy_level: 'none' });
  });

  it('never overwrites an existing value', () => {
    const { data } = applyTransforms({ spicy_level: 'hot' }, [
      { kind: 'addDefault', field: 'spicy_level', value: 'none' },
    ]);
    expect(data).toEqual({ spicy_level: 'hot' });
  });
});

describe('applyTransforms — mapValue', () => {
  it('maps known values', () => {
    const { data } = applyTransforms({ level: 'mild' }, [
      { kind: 'mapValue', field: 'level', map: { mild: 1, hot: 2 } },
    ]);
    expect(data).toEqual({ level: 1 });
  });

  it('uses the fallback for an unmapped value', () => {
    const { data } = applyTransforms({ level: 'unknown' }, [
      { kind: 'mapValue', field: 'level', map: { mild: 1 }, fallback: 0 },
    ]);
    expect(data).toEqual({ level: 0 });
  });

  it('throws for an unmapped value when no fallback is declared', () => {
    try {
      applyTransforms({ level: 'unknown' }, [
        { kind: 'mapValue', field: 'level', map: { mild: 1 } },
      ]);
      throw new Error('expected applyTransforms to throw');
    } catch (error) {
      expect((error as MigrationError).code).toBe('unmapped_value');
      expect((error as MigrationError).message).toContain('unknown');
    }
  });

  it('leaves an absent field absent', () => {
    const { data } = applyTransforms({}, [
      { kind: 'mapValue', field: 'level', map: { mild: 1 } },
    ]);
    expect(data).toEqual({});
  });
});

describe('applyTransforms — removeField', () => {
  it('drops the key', () => {
    const { data } = applyTransforms({ old: 1, keep: 2 }, [{ kind: 'removeField', field: 'old' }]);
    expect(data).toEqual({ keep: 2 });
  });
});

describe('applyTransforms — pipeline', () => {
  it('applies transforms in declaration order', () => {
    const { data, applied } = applyTransforms({ a: 1 }, [
      { kind: 'rename', from: 'a', to: 'b' },
      { kind: 'mapValue', field: 'b', map: { 1: 'one' } },
    ]);
    expect(data).toEqual({ b: 'one' });
    expect(applied).toEqual(['rename:a->b', 'mapValue:b']);
  });

  it('does not mutate the input object', () => {
    const input = { a: 1 };
    applyTransforms(input, [{ kind: 'rename', from: 'a', to: 'b' }]);
    expect(input).toEqual({ a: 1 });
  });

  it('reports every transform it ran', () => {
    const { applied } = applyTransforms({ a: 1, b: 2 }, [
      { kind: 'addDefault', field: 'c', value: 3 },
      { kind: 'removeField', field: 'b' },
    ]);
    expect(applied).toEqual(['addDefault:c', 'removeField:b']);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npm run test -- src/core/types/__tests__/migration.test.ts`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết phần transform trong `src/core/types/migration.ts`**

Yêu cầu:
- `applyTransforms` là **hàm thuần**: trả object mới, không sửa input.
- `rename`: nếu `from` không có → bỏ qua; nếu `to` đã có → `MigrationError('rename_target_exists')`; nếu `from` hoặc `to` nằm trong `SYSTEM_FIELD_KEYS` (Task 2) → `reserved_field`.
- `addDefault`: chỉ điền khi key **chưa tồn tại** (`'field' in data === false`).
- `mapValue`: tra `map` bằng giá trị hiện tại; không có trong map thì dùng `fallback` nếu có, ngược lại ném `unmapped_value` **kèm giá trị gặp phải trong message**.
- `removeField`: xoá key nếu có.
- Không nhánh nào dùng `eval`.

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npm run test -- src/core/types/__tests__/migration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/types/migration.ts src/core/types/__tests__/migration.test.ts
git commit -m "feat(types): add declarative migration transforms"
```

---

### Task 9: Migration runner — lazy khi đọc + chạy nền (TDD)

**Vì sao:** Spec §4.1: document lưu `schemaVersion`; **lazy migration khi đọc** + **background migration** cho toàn collection có tiến độ. Đây là chỗ dễ sai: document tụt 2 bậc phải đi **từng bậc**, và chạy lại phải **không làm gì** (idempotent). Review Focus #5.

**Files:**
- Modify: `src/core/types/migration.ts`
- Test: `src/core/types/__tests__/migration.test.ts` (thêm describe block)

**Interfaces:**
- Consumes: `applyTransforms`, `TypeMigration` (Task 8); `TypeDefinition` (Task 2); `DbAdapter`, `DocEnvelope` (M0)
- Produces:
  - `class MigrationChainError extends Error`
  - `function buildChain(registry: readonly TypeMigration[], from: number, to: number): readonly TypeMigration[]`
  - `function migrateData(data, registry, from, to): TransformResult & { readonly toVersion: number }`
  - `interface LazyMigrationOutcome<T> { readonly doc: DocEnvelope<T>; readonly migrated: boolean; readonly wrote: boolean }`
  - `function migrateRecordOnRead<T extends string>(doc: DocEnvelope<T>, definition: TypeDefinition, registry: readonly TypeMigration[], adapter: DbAdapter): Promise<LazyMigrationOutcome<T>>`
  - `interface BackgroundMigrationProgress { readonly scanned: number; readonly migrated: number; readonly failed: number; readonly total: number }`
  - `function migrateCollection<T extends string>(adapter: DbAdapter, definition: TypeDefinition, registry: readonly TypeMigration[], onProgress?: (p: BackgroundMigrationProgress) => void): Promise<BackgroundMigrationProgress>`

- [ ] **Step 1: Viết failing test**

Thêm vào `src/core/types/__tests__/migration.test.ts`:

```ts
import { createMemoryAdapter } from '../../db/memory-adapter';
import { createEnvelope } from '../../db/envelope';
import type { TypeDefinition } from '../definition';
import {
  buildChain, migrateData, migrateRecordOnRead, migrateCollection, MigrationChainError,
  type TypeMigration,
} from '../migration';

const V1: TypeDefinition = {
  key: 'product', kind: 'builtin_ext', baseType: 'product',
  name: { vi: 'SP', en: 'Product' }, version: 1, fields: [], listView: [],
};
const V3: TypeDefinition = { ...V1, version: 3 };

const CHAIN: TypeMigration[] = [
  { fromVersion: 1, toVersion: 2, transforms: [{ kind: 'rename', from: 'spicy', to: 'spicy_level' }] },
  { fromVersion: 2, toVersion: 3, transforms: [{ kind: 'mapValue', field: 'spicy_level', map: { mild: 1, hot: 2 }, fallback: 0 }] },
];

describe('buildChain', () => {
  it('returns the empty chain when already at the target version', () => {
    expect(buildChain(CHAIN, 3, 3)).toEqual([]);
  });

  it('returns the steps in ascending order', () => {
    expect(buildChain(CHAIN, 1, 3).map((m) => `${m.fromVersion}->${m.toVersion}`)).toEqual(['1->2', '2->3']);
  });

  it('throws when a step is missing from the registry', () => {
    expect(() => buildChain([CHAIN[0] as TypeMigration], 1, 3)).toThrow(MigrationChainError);
  });

  it('throws when the document is newer than the definition', () => {
    expect(() => buildChain(CHAIN, 4, 3)).toThrow(/newer/i);
  });
});

describe('migrateData', () => {
  it('runs every step in order for a document two versions behind', () => {
    const { data, toVersion } = migrateData({ spicy: 'mild', name: 'Phở' }, CHAIN, 1, 3);
    expect(data).toEqual({ spicy_level: 1, name: 'Phở' });
    expect(toVersion).toBe(3);
  });

  it('is idempotent — running the same chain again changes nothing', () => {
    const once = migrateData({ spicy: 'mild' }, CHAIN, 1, 3);
    const twice = migrateData({ ...once.data }, CHAIN, once.toVersion, 3);
    expect(twice.data).toEqual(once.data);
  });

  it('changes nothing when already current', () => {
    const { data, applied } = migrateData({ spicy_level: 1 }, CHAIN, 3, 3);
    expect(data).toEqual({ spicy_level: 1 });
    expect(applied).toEqual([]);
  });
});

describe('migrateRecordOnRead', () => {
  it('migrates a stale document and writes it back with the new version', async () => {
    const adapter = await createMemoryAdapter();
    await adapter.put({
      ...createEnvelope({ id: 'product:p001', docType: 'product', branchId: 'hq' }),
      schemaVersion: 1,
      spicy: 'mild',
    } as never);

    const before = await adapter.get('product:p001');
    const outcome = await migrateRecordOnRead(before!, V3, CHAIN, adapter);

    expect(outcome.migrated).toBe(true);
    expect(outcome.wrote).toBe(true);
    expect(outcome.doc.spicy_level).toBe(1);
    expect(outcome.doc.schemaVersion).toBe(3);

    const stored = await adapter.get('product:p001');
    expect(stored!.schemaVersion).toBe(3);
    expect(stored!.spicy_level).toBe(1);
  });

  it('leaves a current document untouched and does not write', async () => {
    const adapter = await createMemoryAdapter();
    await adapter.put({
      ...createEnvelope({ id: 'product:p002', docType: 'product', branchId: 'hq' }),
      schemaVersion: 3,
      spicy_level: 1,
    } as never);

    const doc = await adapter.get('product:p002');
    const outcome = await migrateRecordOnRead(doc!, V3, CHAIN, adapter);

    expect(outcome.migrated).toBe(false);
    expect(outcome.wrote).toBe(false);
    expect(outcome.doc).toEqual(doc);
  });

  it('does not write when a transform fails, and surfaces the error', async () => {
    const adapter = await createMemoryAdapter();
    await adapter.put({
      ...createEnvelope({ id: 'product:p003', docType: 'product', branchId: 'hq' }),
      schemaVersion: 2,
      spicy_level: 'not-in-the-map',
    } as never);

    const doc = await adapter.get('product:p003');
    await expect(migrateRecordOnRead(doc!, V3, CHAIN, adapter)).rejects.toThrow(/not-in-the-map/);

    const stored = await adapter.get('product:p003');
    expect(stored!.schemaVersion).toBe(2);
  });
});

describe('migrateCollection', () => {
  it('migrates only documents of the given type', async () => {
    const adapter = await createMemoryAdapter();
    await adapter.put({ ...createEnvelope({ id: 'product:p001', docType: 'product', branchId: 'hq' }), schemaVersion: 1, spicy: 'mild' } as never);
    await adapter.put({ ...createEnvelope({ id: 'order:o001', docType: 'order', branchId: 'hq' }), schemaVersion: 1, spicy: 'mild' } as never);

    const progress = await migrateCollection(adapter, V3, CHAIN);

    expect(progress.migrated).toBe(1);
    expect((await adapter.get('product:p001'))!.schemaVersion).toBe(3);
    expect((await adapter.get('order:o001'))!.schemaVersion).toBe(1);
  });

  it('reports progress as it scans', async () => {
    const adapter = await createMemoryAdapter();
    for (let i = 0; i < 3; i += 1) {
      await adapter.put({ ...createEnvelope({ id: `product:p00${i}`, docType: 'product', branchId: 'hq' }), schemaVersion: 1, spicy: 'mild' } as never);
    }

    const seen: number[] = [];
    await migrateCollection(adapter, V3, CHAIN, (p) => seen.push(p.migrated));

    expect(seen.at(-1)).toBe(3);
    expect(seen.length).toBeGreaterThan(1);
  });

  it('keeps going when one document fails, and counts it', async () => {
    const adapter = await createMemoryAdapter();
    await adapter.put({ ...createEnvelope({ id: 'product:good', docType: 'product', branchId: 'hq' }), schemaVersion: 2, spicy_level: 'mild' } as never);
    await adapter.put({ ...createEnvelope({ id: 'product:bad', docType: 'product', branchId: 'hq' }), schemaVersion: 2, spicy_level: 'nope' } as never);

    const progress = await migrateCollection(adapter, V3, CHAIN);

    expect(progress.migrated).toBe(1);
    expect(progress.failed).toBe(1);
    expect((await adapter.get('product:good'))!.schemaVersion).toBe(3);
    expect((await adapter.get('product:bad'))!.schemaVersion).toBe(2);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npm run test -- src/core/types/__tests__/migration.test.ts`
Expected: FAIL — `buildChain` chưa được export.

- [ ] **Step 3: Viết phần runner trong `src/core/types/migration.ts`**

Yêu cầu:
- `buildChain` đi **từng bậc một** (1→2→3), không nhảy cóc. Thiếu bậc → `MigrationChainError` nêu rõ bậc nào thiếu. `from > to` → lỗi "newer than definition".
- `migrateRecordOnRead` gọi `adapter.put` với `_rev` hiện có; **chỉ ghi khi thực sự có thay đổi** (`applied.length > 0`) để không tạo conflict vô ích giữa các terminal. Transform lỗi → **không ghi**, ném lỗi ra ngoài.
- `migrateCollection` dùng `adapter.allDocs()`, lọc theo `docType === definition.baseType` **hoặc** `docType === definition.key` (type có sẵn vs entity mới), bọc từng document trong `try/catch` để một document hỏng không giết cả job. Gọi `onProgress` sau mỗi document.
- `migrateCollection` cập nhật `total` = số document khớp, để UI hiển thị tiến độ thật.
- Bọc `schemaVersion` vào chính document; nhớ `updatedAt` phải được cập nhật khi ghi.

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npm run test -- src/core/types/__tests__/migration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/types/migration.ts src/core/types/__tests__/migration.test.ts
git commit -m "feat(types): add lazy and background migration runner"
```

---

### Task 10: Type Registry engine — CRUD + versioning (TDD)

**Files:**
- Create: `src/core/types/type-registry.ts`
- Test: `src/core/types/__tests__/type-registry.test.ts`

**Interfaces:**
- Consumes: `DbAdapter` (M0); `TypeDefinitionDoc`, `FieldDefinition`, `createTypeDefinitionDoc` (Task 2); `validateTypeDefinition`, `assertValidTypeDefinition` (Task 4); `TypeMigration` (Task 8); `typeDocId` (Task 2)
- Produces:
  - `interface UpdateTypeInput { readonly name?: LocalizedText; readonly fields?: readonly FieldDefinition[]; readonly listView?: readonly string[]; readonly migration?: readonly MigrationTransform[] }`
  - `interface TypeRegistry { createType, getType, listTypes, updateType, deleteType }`
  - `function createTypeRegistry(adapter: DbAdapter, clock?: () => string): TypeRegistry`

- [ ] **Step 1: Viết failing test**

`src/core/types/__tests__/type-registry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createMemoryAdapter } from '../../db/memory-adapter';
import { createTypeRegistry } from '../type-registry';
import type { FieldDefinition } from '../definition';

const spicyField: FieldDefinition = {
  key: 'spicy_level',
  label: { vi: 'Độ cay', en: 'Spicy level' },
  dataType: 'select',
  required: false,
  options: [
    { value: 'none', label: { vi: 'Không', en: 'None' } },
    { value: 'hot', label: { vi: 'Cay', en: 'Hot' } },
  ],
};

const validInput = {
  key: 'product',
  kind: 'builtin_ext' as const,
  baseType: 'product',
  name: { vi: 'Sản phẩm', en: 'Product' },
  branchId: 'hq',
};

async function registry() {
  const adapter = await createMemoryAdapter();
  return { adapter, registry: createTypeRegistry(adapter) };
}

describe('createType', () => {
  it('persists a new type definition', async () => {
    const { adapter, registry: r } = await registry();
    const doc = await r.createType({ ...validInput, fields: [spicyField] });

    expect(doc._id).toBe('type:product');
    expect(doc.version).toBe(1);
    expect((await adapter.get('type:product'))!.key).toBe('product');
  });

  it('rejects an invalid definition and does not write', async () => {
    const { adapter, registry: r } = await registry();
    await expect(
      r.createType({ ...validInput, fields: [{ ...spicyField, key: '_bad' }] }),
    ).rejects.toThrow(/_bad/);
    expect(await adapter.get('type:product')).toBeNull();
  });

  it('rejects a duplicate type key', async () => {
    const { registry: r } = await registry();
    await r.createType({ ...validInput, fields: [spicyField] });
    await expect(r.createType({ ...validInput, fields: [spicyField] })).rejects.toThrow(/already exists/i);
  });

  it('creates an entity type with baseType null', async () => {
    const { registry: r } = await registry();
    const doc = await r.createType({
      key: 'supplier', kind: 'entity', baseType: null,
      name: { vi: 'Nhà cung cấp', en: 'Supplier' }, branchId: 'hq',
    });
    expect(doc).toMatchObject({ key: 'supplier', kind: 'entity', baseType: null });
  });
});

describe('getType / listTypes', () => {
  it('returns null for an unknown key', async () => {
    const { registry: r } = await registry();
    expect(await r.getType('ghost')).toBeNull();
  });

  it('lists types and can filter by kind', async () => {
    const { registry: r } = await registry();
    await r.createType({ ...validInput, fields: [spicyField] });
    await r.createType({ key: 'supplier', kind: 'entity', baseType: null, name: { vi: 'NCC', en: 'Supplier' }, branchId: 'hq' });

    expect((await r.listTypes()).map((t) => t.key).sort()).toEqual(['product', 'supplier']);
    expect((await r.listTypes({ kind: 'entity' })).map((t) => t.key)).toEqual(['supplier']);
  });
});

describe('updateType', () => {
  it('bumps the version when fields change', async () => {
    const { registry: r } = await registry();
    await r.createType({ ...validInput, fields: [spicyField] });
    const updated = await r.updateType('product', { fields: [spicyField, { key: 'note', label: { vi: 'Ghi chú', en: 'Note' }, dataType: 'text', required: false }] });
    expect(updated.version).toBe(2);
  });

  it('keeps the version when only the label changes', async () => {
    const { registry: r } = await registry();
    await r.createType({ ...validInput, fields: [spicyField] });
    const updated = await r.updateType('product', { name: { vi: 'Món ăn', en: 'Dish' } });
    expect(updated.version).toBe(1);
  });

  it('validates the resulting definition before writing', async () => {
    const { registry: r } = await registry();
    await r.createType({ ...validInput, fields: [spicyField] });
    await expect(r.updateType('product', { fields: [{ ...spicyField, key: 'branchId' }] })).rejects.toThrow(/branchId/);
  });

  it('rejects an unknown type key', async () => {
    const { registry: r } = await registry();
    await expect(r.updateType('ghost', { name: { vi: 'X', en: 'X' } })).rejects.toThrow(/not found/i);
  });

  it('surfaces a concurrent modification instead of overwriting it', async () => {
    const { registry: r } = await registry();
    const created = await r.createType({ ...validInput, fields: [spicyField] });

    // Terminal khác ghi trước
    const { registry: other } = { registry: createTypeRegistry(await createMemoryAdapter()) };
    void other;
    await r.updateType('product', { name: { vi: 'A', en: 'A' } });

    // Bản sao cũ (thiếu _rev mới) phải bị từ chối, không im lặng ghi đè
    await expect(
      r.updateType('product', { name: { vi: 'B', en: 'B' } }, { expectedRev: created._rev as string }),
    ).rejects.toThrow(/conflict/i);
  });
});

describe('deleteType', () => {
  it('soft-deletes a type definition', async () => {
    const { registry: r } = await registry();
    await r.createType({ ...validInput, fields: [spicyField] });
    await r.deleteType('product');

    expect(await r.getType('product')).toBeNull();
    expect(await r.listTypes()).toEqual([]);
  });

  it('is a no-op for an unknown key', async () => {
    const { registry: r } = await registry();
    await expect(r.deleteType('ghost')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npm run test -- src/core/types/__tests__/type-registry.test.ts`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết `src/core/types/type-registry.ts`**

Yêu cầu:
- `createTypeRegistry(adapter, clock?)` — `clock` để test bơm thời gian (`now` của `createEnvelope`), mặc định `() => new Date().toISOString()`.
- `createType` gọi `assertValidTypeDefinition` **trước** khi ghi; key đã tồn tại → lỗi "already exists".
- `updateType(key, patch, options?)`: đọc bản mới nhất, áp patch, gọi `assertValidTypeDefinition`. Nếu `fields` hoặc `listView` đổi → `version + 1` và ghi kèm migration khai báo; nếu chỉ `name` đổi → giữ nguyên version. `options.expectedRev` (nếu có) dùng để phát hiện ghi đè: lệch `_rev` → lỗi `/conflict/i`.
- `deleteType` = soft-delete (`deletedAt`), **không** hard-delete: dữ liệu cũ vẫn tham chiếu type.
- Không import Vue/PouchDB. Chỉ dùng `DbAdapter`.
- Lỗi conflict phải khớp `/conflict/i` cho **cả hai** adapter (memory dùng `conflict: document …`, PouchDB adapter dùng `…: conflict for …`).

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npm run test -- src/core/types/__tests__/type-registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/types/type-registry.ts src/core/types/__tests__/type-registry.test.ts
git commit -m "feat(types): add type registry engine with versioning"
```

---

### Task 11: Read model — form model + field tính toán (TDD)

**Vì sao:** UI cần một object thuần mô tả "render gì", để phần khó (suy giá trị, chạy formula, quyết định readonly/required) được unit test mà không cần DOM.

**Files:**
- Create: `src/core/types/read-model.ts`
- Test: `src/core/types/__tests__/read-model.test.ts`

**Interfaces:**
- Consumes: `TypeDefinition`, `FieldDefinition` (Task 2); `FIELD_TYPES`, `defaultValueFor`, `formatFieldValue` (Task 3); `parseFormula`, `FormulaError` (Task 6); `evaluateFormula`, `formulaValueOf`, `FormulaValue` (Task 7)
- Produces:
  - `interface FormFieldModel { readonly field: FieldDefinition; readonly value: unknown; readonly computed: boolean; readonly widget: string; readonly error: string | null }`
  - `interface FormModel { readonly typeKey: string; readonly version: number; readonly fields: readonly FormFieldModel[]; readonly values: Readonly<Record<string, unknown>> }`
  - `function buildFormModel(definition: TypeDefinition, record: Readonly<Record<string, unknown>>): FormModel`
  - `interface ListCellModel { readonly key: string; readonly text: string }`
  - `function buildListModel(definition: TypeDefinition, record: Readonly<Record<string, unknown>>, locale: SupportedLocale): readonly ListCellModel[]`
  - `function computeFormulaFields(definition: TypeDefinition, record: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>>`

- [ ] **Step 1: Viết failing test**

`src/core/types/__tests__/read-model.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { TypeDefinition } from '../definition';
import { buildFormModel, buildListModel, computeFormulaFields } from '../read-model';
import { money } from '../../money';

const def: TypeDefinition = {
  key: 'product', kind: 'builtin_ext', baseType: 'product',
  name: { vi: 'Sản phẩm', en: 'Product' }, version: 1, listView: ['name', 'price', 'cost'],
  fields: [
    { key: 'name', label: { vi: 'Tên', en: 'Name' }, dataType: 'text', required: true },
    { key: 'price', label: { vi: 'Giá', en: 'Price' }, dataType: 'money', required: true },
    { key: 'cost', label: { vi: 'Vốn', en: 'Cost' }, dataType: 'formula', required: false, formula: 'price * 0.6' },
  ],
};

describe('computeFormulaFields', () => {
  it('computes a money formula without storing it', () => {
    expect(computeFormulaFields(def, { price: money(100000, 'VND') })).toEqual({ cost: money(60000, 'VND') });
  });

  it('returns null for a formula whose dependency is missing', () => {
    expect(computeFormulaFields(def, {})).toEqual({ cost: null });
  });

  it('chains formula fields', () => {
    const chained: TypeDefinition = {
      ...def,
      fields: [
        ...def.fields,
        { key: 'double_cost', label: { vi: 'x2', en: 'x2' }, dataType: 'formula', required: false, formula: 'cost * 2' },
      ],
    };
    expect(computeFormulaFields(chained, { price: money(100000, 'VND') })).toEqual({
      cost: money(60000, 'VND'),
      double_cost: money(120000, 'VND'),
    });
  });

  it('does not mutate the input record', () => {
    const record = { price: money(100000, 'VND') };
    computeFormulaFields(def, record);
    expect(record).toEqual({ price: money(100000, 'VND') });
  });
});

describe('buildFormModel', () => {
  it('marks formula fields as computed and readonly', () => {
    const model = buildFormModel(def, { name: 'Phở', price: money(100000, 'VND') });
    const cost = model.fields.find((f) => f.field.key === 'cost');
    expect(cost).toMatchObject({ computed: true, value: money(60000, 'VND') });
  });

  it('assigns the default widget from the field registry', () => {
    const model = buildFormModel(def, {});
    expect(model.fields.find((f) => f.field.key === 'name')!.widget).toBe('text');
  });

  it('falls back to the field default value when the record has none', () => {
    const withDefault: TypeDefinition = {
      ...def,
      fields: [{ key: 'name', label: { vi: 'Tên', en: 'Name' }, dataType: 'text', required: true, defaultValue: 'Chưa đặt tên' }],
      listView: ['name'],
    };
    expect(buildFormModel(withDefault, {}).values).toEqual({ name: 'Chưa đặt tên' });
  });

  it('exposes the computed values in the values map', () => {
    const model = buildFormModel(def, { name: 'Phở', price: money(100000, 'VND') });
    expect(model.values.cost).toEqual(money(60000, 'VND'));
  });

  it('reports a validation error for a required field that is empty', () => {
    const model = buildFormModel(def, { price: money(100000, 'VND') });
    expect(model.fields.find((f) => f.field.key === 'name')!.error).toMatch(/required/i);
  });
});

describe('buildListModel', () => {
  it('formats each listView cell in order', () => {
    const cells = buildListModel(def, { name: 'Phở', price: money(69000, 'VND') }, 'vi');
    expect(cells.map((c) => c.key)).toEqual(['name', 'price', 'cost']);
    expect(cells[1]!.text).toContain('69');
  });

  it('uses the computed value for a formula column', () => {
    const cells = buildListModel(def, { name: 'Phở', price: money(100000, 'VND') }, 'vi');
    expect(cells[2]!.text).toContain('60');
  });

  it('renders a dash for an empty cell', () => {
    const cells = buildListModel(def, { name: 'Phở' }, 'vi');
    expect(cells[1]!.text).toBe('—');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npm run test -- src/core/types/__tests__/read-model.test.ts`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết `src/core/types/read-model.ts`**

Yêu cầu:
- `computeFormulaFields` chạy formula theo **thứ tự phụ thuộc** (dùng lại DFS của Task 4 hoặc sắp xếp topo đơn giản). Field không phải formula giữ nguyên.
- Formula lỗi hoặc thiếu dependency → gán `null` cho field đó **thay vì ném lỗi** — form vẫn render được, ô tính toán hiện trống. Ghi lỗi vào `FormFieldModel.error`.
- `buildFormModel` áp `defaultValueFor` (Task 3) cho field thiếu, rồi chạy `FIELD_TYPES[dataType].validate` để điền `error`.
- `widget` = `field.ui?.widget ?? FIELD_TYPES[dataType].defaultWidget`.
- `buildListModel` dùng `formatFieldValue` (Task 3) với giá trị đã tính.
- Hàm thuần — không sửa input, không import Vue.

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npm run test -- src/core/types/__tests__/read-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/types/read-model.ts src/core/types/__tests__/read-model.test.ts
git commit -m "feat(types): add form and list read models"
```

---

### Task 12: Repository CRUD cho entity type mới (TDD)

**Vì sao:** Spec §R1: entity type mới chỉ cần **generic CRUD** (tên + field + list view). Đây là chỗ chứng minh "type mới = dữ liệu mới" không cần code riêng.

**Files:**
- Create: `src/core/types/record-repository.ts`
- Modify: `src/core/db/ids.ts` (thêm `recordDocId`)
- Test: `src/core/types/__tests__/record-repository.test.ts`, `src/core/db/__tests__/ids.test.ts`

**Interfaces:**
- Consumes: `DbAdapter` (M0); `TypeDefinition` (Task 2); `assertValidTypeDefinition` (Task 4); `FIELD_TYPES` (Task 3); `migrateRecordOnRead` (Task 9); `computeFormulaFields` (Task 11)
- Produces:
  - `function recordDocId(typeKey: string, id: string): string`
  - `interface CreateRecordInput { readonly typeKey: string; readonly branchId: string; readonly data: Readonly<Record<string, unknown>> }`
  - `interface RecordRepository { create, update, get, list, remove }`
  - `function createRecordRepository(adapter: DbAdapter): RecordRepository`

- [ ] **Step 1: Viết failing test cho `recordDocId`**

Thêm vào `src/core/db/__tests__/ids.test.ts`:

```ts
import { recordDocId } from '../ids';

describe('recordDocId', () => {
  it('builds a record id from the type key and the record id', () => {
    expect(recordDocId('supplier', 's001')).toBe('supplier:s001');
  });

  it('rejects colons in either segment', () => {
    expect(() => recordDocId('a:b', 'x')).toThrow(/colon/i);
    expect(() => recordDocId('a', 'x:y')).toThrow(/colon/i);
  });
});
```

- [ ] **Step 2: Viết failing test cho repository**

`src/core/types/__tests__/record-repository.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createMemoryAdapter } from '../../db/memory-adapter';
import { createTypeRegistry } from '../type-registry';
import { createRecordRepository } from '../record-repository';
import type { FieldDefinition } from '../definition';

const supplierFields: FieldDefinition[] = [
  { key: 'name', label: { vi: 'Tên', en: 'Name' }, dataType: 'text', required: true },
  { key: 'rating', label: { vi: 'Đánh giá', en: 'Rating' }, dataType: 'number', required: false },
];

async function setup() {
  const adapter = await createMemoryAdapter();
  const registry = createTypeRegistry(adapter);
  await registry.createType({
    key: 'supplier', kind: 'entity', baseType: null,
    name: { vi: 'Nhà cung cấp', en: 'Supplier' }, branchId: 'hq',
  });
  await registry.updateType('supplier', { fields: supplierFields });
  return { adapter, registry, repo: createRecordRepository(adapter) };
}

describe('create', () => {
  it('creates a record for a brand-new entity type', async () => {
    const { adapter, repo } = await setup();
    const doc = await repo.create({ typeKey: 'supplier', branchId: 'hq', data: { name: 'Mekong', rating: 4 } });

    expect(doc._id).toBe('supplier:s001');
    expect(doc.docType).toBe('supplier');
    expect(doc.branchId).toBe('hq');
    expect(doc.name).toBe('Mekong');
    expect((await adapter.get('supplier:s001'))!.docType).toBe('supplier');
  });

  it('rejects missing data for a required field', async () => {
    const { repo } = await setup();
    await expect(repo.create({ typeKey: 'supplier', branchId: 'hq', data: { rating: 4 } })).rejects.toThrow(/name/i);
  });

  it('rejects a wrong data type', async () => {
    const { repo } = await setup();
    await expect(repo.create({ typeKey: 'supplier', branchId: 'hq', data: { name: 'Mekong', rating: 'cao' } })).rejects.toThrow(/rating/i);
  });

  it('rejects an unknown type key', async () => {
    const { repo } = await setup();
    await expect(repo.create({ typeKey: 'ghost', branchId: 'hq', data: {} })).rejects.toThrow(/not found/i);
  });

  it('rejects a field that the type does not declare', async () => {
    const { repo } = await setup();
    await expect(repo.create({ typeKey: 'supplier', branchId: 'hq', data: { name: 'Mekong', ghost: 1 } })).rejects.toThrow(/ghost/i);
  });
});

describe('update / get / list / remove', () => {
  it('round-trips a record', async () => {
    const { repo } = await setup();
    const created = await repo.create({ typeKey: 'supplier', branchId: 'hq', data: { name: 'Mekong' } });
    const updated = await repo.update({ typeKey: 'supplier', id: 's001', data: { name: 'Mekong 2' }, expectedRev: created._rev as string });

    expect(updated.name).toBe('Mekong 2');
    expect((await repo.get('supplier', 's001'))!.name).toBe('Mekong 2');
  });

  it('lists only records of the given type', async () => {
    const { repo } = await setup();
    await repo.create({ typeKey: 'supplier', branchId: 'hq', data: { name: 'Mekong' } });
    await repo.create({ typeKey: 'supplier', branchId: 'hq', data: { name: 'Vina' } });

    expect((await repo.list('supplier')).map((d) => d.name).sort()).toEqual(['Mekong', 'Vina']);
    expect(await repo.list('ghost')).toEqual([]);
  });

  it('filters by branch', async () => {
    const { repo } = await setup();
    await repo.create({ typeKey: 'supplier', branchId: 'hq', data: { name: 'Mekong' } });
    await repo.create({ typeKey: 'supplier', branchId: 'branch-2', data: { name: 'Vina' } });

    expect((await repo.list('supplier', { branchId: 'hq' })).map((d) => d.name)).toEqual(['Mekong']);
  });

  it('soft-deletes a record', async () => {
    const { repo } = await setup();
    const created = await repo.create({ typeKey: 'supplier', branchId: 'hq', data: { name: 'Mekong' } });
    await repo.remove('supplier', 's001', created._rev as string);

    expect(await repo.get('supplier', 's001')).toBeNull();
    expect(await repo.list('supplier')).toEqual([]);
  });

  it('surfaces a concurrent modification as a conflict', async () => {
    const { repo } = await setup();
    const created = await repo.create({ typeKey: 'supplier', branchId: 'hq', data: { name: 'Mekong' } });
    await repo.update({ typeKey: 'supplier', id: 's001', data: { name: 'A' }, expectedRev: created._rev as string });

    await expect(
      repo.update({ typeKey: 'supplier', id: 's001', data: { name: 'B' }, expectedRev: created._rev as string }),
    ).rejects.toThrow(/conflict/i);
  });

  it('recomputes formula fields on read and never stores them', async () => {
    const { adapter, registry, repo } = await setup();
    await registry.updateType('supplier', {
      fields: [
        ...supplierFields,
        { key: 'score', label: { vi: 'Điểm', en: 'Score' }, dataType: 'formula', required: false, formula: 'rating * 10' },
      ],
    });

    const created = await repo.create({ typeKey: 'supplier', branchId: 'hq', data: { name: 'Mekong', rating: 4 } });
    expect(created.score).toBe(40);

    const raw = await adapter.get('supplier:s001');
    expect('score' in (raw as unknown as Record<string, unknown>)).toBe(false);
  });
});
```

- [ ] **Step 3: Chạy test để xác nhận fail**

Run: `npm run test -- src/core/types/__tests__/record-repository.test.ts src/core/db/__tests__/ids.test.ts`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 4: Implement `recordDocId` và repository**

Yêu cầu:
- `recordDocId(typeKey, id)` = `` `${segment(typeKey)}:${segment(id)}` `` — dùng `requireSegment` có sẵn trong `ids.ts` để từ chối dấu `:`.
- `create`: đọc type definition (lỗi "not found" nếu thiếu), validate từng field bằng `FIELD_TYPES[dataType].validate`, từ chối field không khai báo, sinh `_id` tuần tự `s001`, `s002`… (đếm từ `list()`), ghi qua `adapter.put`.
  - `docType` = `typeKey` (entity type mới) — giữ quy ước `recordDocId` ở trên.
  - Gán `schemaVersion` = version hiện tại của type.
- `update`: `expectedRev` lệch → lỗi `/conflict/i`. Validate y như `create`. Nếu definition đã tăng version → lưu `schemaVersion` mới.
- `get`/`list`: chạy `migrateRecordOnRead` (Task 9) rồi `computeFormulaFields` (Task 11) trên bản sao. **Không** ghi lại kết quả formula.
- `remove`: soft-delete qua `deletedAt`, không hard-delete.
- Sinh id tuần tự phải **không** trùng khi chạy song song trên 2 terminal: nếu `put` báo conflict → thử lại với số kế tiếp, tối đa 5 lần, rồi ném lỗi rõ ràng. (Không dùng UUID để id dễ đọc trong demo.)

- [ ] **Step 5: Chạy test để xác nhận pass**

Run: `npm run test -- src/core/types/__tests__/record-repository.test.ts src/core/db/__tests__/ids.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/types/record-repository.ts src/core/db/ids.ts src/core/types/__tests__/record-repository.test.ts src/core/db/__tests__/ids.test.ts
git commit -m "feat(types): add generic record repository for user-defined types"
```

---

### Task 13: i18n keys cho Type Designer

**Files:**
- Modify: `src/i18n/vi.json`, `src/i18n/en.json`
- Test: `src/i18n/__tests__/i18n.test.ts` (thêm case)

**Ràng buộc:** invariant #6 trong CLAUDE.md — **mọi key phải có ở cả `vi.json` và `en.json`**. Không hardcode chuỗi trong SFC.

- [ ] **Step 1: Viết failing test**

Thêm vào `src/i18n/__tests__/i18n.test.ts`:

```ts
import vi from '../vi.json';
import en from '../en.json';

const REQUIRED_TYPE_KEYS = [
  'type.designer.title',
  'type.designer.newType',
  'type.designer.editType',
  'type.designer.empty',
  'type.field.add',
  'type.field.remove',
  'type.field.key',
  'type.field.label',
  'type.field.dataType',
  'type.field.required',
  'type.field.options',
  'type.field.formula',
  'type.field.scale',
  'type.field.referenceType',
  'type.field.indexed',
  'type.field.computed',
  'type.error.reservedKey',
  'type.error.duplicateKey',
  'type.error.formulaCycle',
  'type.error.unknownField',
  'type.error.tooManyIndexed',
  'type.error.missingOptions',
  'type.error.unknownListField',
  'type.migration.running',
  'type.migration.done',
  'type.list.empty',
  'type.form.save',
  'type.form.cancel',
  'type.form.delete',
  'type.record.required',
];

describe('type designer i18n keys', () => {
  it.each(REQUIRED_TYPE_KEYS)('has %s in both locales', (key) => {
    expect(get(vi, key), `vi.json is missing ${key}`).toBeTruthy();
    expect(get(en, key), `en.json is missing ${key}`).toBeTruthy();
  });

  it('has a label for every data type', () => {
    for (const t of DATA_TYPES) {
      expect(get(vi, `type.dataType.${t}`), `vi.json is missing type.dataType.${t}`).toBeTruthy();
      expect(get(en, `type.dataType.${t}`), `en.json is missing type.dataType.${t}`).toBeTruthy();
    }
  });
});
```

Với `get()` là helper đọc key lồng nhau (thêm vào chính file test nếu chưa có):

```ts
function get(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => {
    if (typeof acc !== 'object' || acc === null) return undefined;
    return (acc as Record<string, unknown>)[part];
  }, obj);
}
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npm run test -- src/i18n/__tests__/i18n.test.ts`
Expected: FAIL — thiếu key.

- [ ] **Step 3: Thêm key vào cả hai file**

Bảng dưới là **nguồn sự thật** — điền đúng từng dòng, không bịa thêm:

| Key | `vi` | `en` |
|---|---|---|
| `type.designer.title` | Trình tạo type | Type Designer |
| `type.designer.newType` | Tạo type mới | New type |
| `type.designer.editType` | Sửa type | Edit type |
| `type.designer.empty` | Chưa có type nào | No types yet |
| `type.field.add` | Thêm field | Add field |
| `type.field.remove` | Xoá field | Remove field |
| `type.field.key` | Khoá | Key |
| `type.field.label` | Nhãn | Label |
| `type.field.dataType` | Kiểu dữ liệu | Data type |
| `type.field.required` | Bắt buộc | Required |
| `type.field.options` | Lựa chọn | Options |
| `type.field.formula` | Công thức | Formula |
| `type.field.scale` | Số thập phân | Decimal places |
| `type.field.referenceType` | Type được trỏ tới | Referenced type |
| `type.field.indexed` | Đánh index | Indexed |
| `type.field.computed` | Tự tính | Computed |
| `type.error.reservedKey` | Khoá này bị hệ thống giữ riêng | This key is reserved by the system |
| `type.error.duplicateKey` | Khoá bị trùng | Duplicate key |
| `type.error.formulaCycle` | Công thức tham chiếu vòng | Formula reference cycle |
| `type.error.unknownField` | Công thức trỏ tới field không tồn tại | Formula references an unknown field |
| `type.error.tooManyIndexed` | Quá nhiều field đánh index | Too many indexed fields |
| `type.error.missingOptions` | Field chọn cần ít nhất một lựa chọn | A select field needs at least one option |
| `type.error.unknownListField` | Cột list view không phải field đã khai báo | List view column is not a declared field |
| `type.migration.running` | Đang chuyển đổi dữ liệu… | Migrating data… |
| `type.migration.done` | Đã chuyển đổi xong | Migration complete |
| `type.list.empty` | Chưa có dữ liệu | No records |
| `type.form.save` | Lưu | Save |
| `type.form.cancel` | Huỷ | Cancel |
| `type.form.delete` | Xoá | Delete |
| `type.record.required` | Trường này là bắt buộc | This field is required |

Và 14 key `type.dataType.*`:

| Key | `vi` | `en` |
|---|---|---|
| `type.dataType.text` | Văn bản | Text |
| `type.dataType.textarea` | Văn bản dài | Long text |
| `type.dataType.number` | Số nguyên | Integer |
| `type.dataType.decimal` | Số thập phân | Decimal |
| `type.dataType.money` | Tiền | Money |
| `type.dataType.boolean` | Đúng/Sai | Yes/No |
| `type.dataType.date` | Ngày | Date |
| `type.dataType.datetime` | Ngày giờ | Date & time |
| `type.dataType.select` | Chọn một | Select |
| `type.dataType.multiselect` | Chọn nhiều | Multi-select |
| `type.dataType.reference` | Tham chiếu | Reference |
| `type.dataType.image` | Ảnh | Image |
| `type.dataType.color` | Màu | Color |
| `type.dataType.formula` | Công thức | Formula |

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npm run test -- src/i18n/__tests__/i18n.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/vi.json src/i18n/en.json src/i18n/__tests__/i18n.test.ts
git commit -m "feat(i18n): add type designer strings in vi and en"
```

---

### Task 14: Widget registry + `FieldWidgets.vue`

**Vì sao:** Cần ánh xạ `dataType` → widget thật. Registry đã có tên widget (`defaultWidget`, Task 3); task này là phía Vue.

**Files:**
- Modify: `package.json` (thêm `happy-dom`)
- Create: `src/features/type-designer/FieldWidgets.vue`
- Test: `src/features/type-designer/__tests__/FieldWidgets.test.ts`

**Interfaces:**
- Consumes: `FieldDefinition`, `DataType` (Task 2); `FIELD_TYPES` (Task 3)
- Produces: SFC `FieldWidgets.vue` với props `{ field: FieldDefinition; modelValue: unknown }`, emits `update:modelValue`

- [ ] **Step 1: Cài `happy-dom`**

```bash
npm install --save-dev happy-dom
```

`@vue/test-utils` đã có sẵn trong devDependencies. Không cần `jsdom`.

- [ ] **Step 2: Viết failing test**

`src/features/type-designer/__tests__/FieldWidgets.test.ts`:

```ts
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import FieldWidgets from '../FieldWidgets.vue';
import type { FieldDefinition } from '@/core/types/definition';

function field(over: Partial<FieldDefinition> & Pick<FieldDefinition, 'dataType'>): FieldDefinition {
  return { key: 'f', label: { vi: 'F', en: 'F' }, required: false, ...over };
}

/** [dataType, CSS selector mong đợi] */
const WIDGET_SELECTORS: [FieldDefinition['dataType'], string][] = [
  ['text', 'input[type="text"]'],
  ['textarea', 'textarea'],
  ['number', 'input[type="number"]'],
  ['decimal', 'input[type="number"]'],
  ['money', 'input[type="number"]'],
  ['boolean', 'input[type="checkbox"]'],
  ['date', 'input[type="date"]'],
  ['datetime', 'input[type="datetime-local"]'],
  ['select', 'select'],
  ['multiselect', 'input[type="checkbox"]'],
  ['color', 'input[type="color"]'],
  ['reference', 'input[type="text"]'],
  ['image', 'input[type="text"]'],
];

describe('FieldWidgets', () => {
  it.each(WIDGET_SELECTORS)('renders the right control for %s', (dataType, selector) => {
    const wrapper = mount(FieldWidgets, { props: { field: field({ dataType }), modelValue: null } });
    expect(wrapper.find(selector).exists()).toBe(true);
  });

  it('renders a computed formula field as read-only text', () => {
    const wrapper = mount(FieldWidgets, {
      props: { field: field({ dataType: 'formula', formula: 'price * 0.6' }), modelValue: '60000' },
    });
    expect(wrapper.find('input, textarea, select').exists()).toBe(false);
    expect(wrapper.text()).toContain('60000');
  });

  it('emits update:modelValue when the user types', async () => {
    const wrapper = mount(FieldWidgets, { props: { field: field({ dataType: 'text' }), modelValue: '' } });
    await wrapper.find('input').setValue('Phở bò');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['Phở bò']);
  });

  it('emits a number, not a string, for a number field', async () => {
    const wrapper = mount(FieldWidgets, { props: { field: field({ dataType: 'number' }), modelValue: null } });
    await wrapper.find('input').setValue('42');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([42]);
  });

  it('emits a boolean for a checkbox', async () => {
    const wrapper = mount(FieldWidgets, { props: { field: field({ dataType: 'boolean' }), modelValue: false } });
    await wrapper.find('input[type="checkbox"]').setValue(true);
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([true]);
  });

  it('renders one option per declared select option', () => {
    const wrapper = mount(FieldWidgets, {
      props: {
        field: field({
          dataType: 'select',
          options: [
            { value: 'none', label: { vi: 'Không', en: 'None' } },
            { value: 'hot', label: { vi: 'Cay', en: 'Hot' } },
          ],
        }),
        modelValue: null,
      },
      global: { plugins: [i18n] },
    });
    expect(wrapper.findAll('option')).toHaveLength(2);
  });
});
```

Với `i18n` là instance vue-i18n đã cấu hình sẵn trong test (`createI18n({ legacy: false, locale: 'vi', messages: { vi, en } })`) — xem `src/i18n/index.ts` để tái dùng cấu hình thay vì dựng lại.

- [ ] **Step 3: Chạy test để xác nhận fail**

Run: `npm run test -- src/features/type-designer/__tests__/FieldWidgets.test.ts`
Expected: FAIL — SFC chưa tồn tại.

- [ ] **Step 4: Viết `FieldWidgets.vue`**

Bảng ánh xạ — dùng đúng từng dòng:

| `dataType` | Widget | Ghi chú |
|---|---|---|
| `text` | `<input type="text">` | |
| `textarea` | `<textarea>` | |
| `number` | `<input type="number">` | emit `Number`, không emit string |
| `decimal` | `<input type="number">` | `:step` = `1 / 10 ** (scale ?? 2)`; emit số nguyên đã scale (D1) |
| `money` | `<input type="number">` | emit `money(Number(v), currency)` — currency từ prop `currency`, mặc định `VND` |
| `boolean` | `<input type="checkbox">` | |
| `date` | `<input type="date">` | |
| `datetime` | `<input type="datetime-local">` | đổi sang ISO có `Z` khi emit |
| `select` | `<select>` | một `<option>`/lựa chọn đã khai báo |
| `multiselect` | nhiều `<input type="checkbox">` | emit mảng giá trị |
| `reference` | `<input type="text">` | v1: nhập id trực tiếp (picker ở M2) |
| `image` | `<input type="text">` | v1: dán data URL / id ảnh (spec §13.2) |
| `color` | `<input type="color">` | |
| `formula` | text tĩnh | `readonly`; hiển thị giá trị đã tính |

- Dùng `<script setup lang="ts">` + `defineProps`/`defineEmits` có kiểu.
- `label` lấy từ `field.label[locale]` — **không** hardcode.
- `required` truyền xuống control để trình duyệt hỗ trợ.
- Nhãn tiếng Việt cho data type lấy từ `type.dataType.*` (Task 13).
- **Không** đặt logic nghiệp vụ trong SFC — chỉ chuyển đổi input ↔ giá trị đã kiểu hoá.

- [ ] **Step 5: Chạy test để xác nhận pass**

Run: `npm run test -- src/features/type-designer/__tests__/FieldWidgets.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/features/type-designer/FieldWidgets.vue src/features/type-designer/__tests__/FieldWidgets.test.ts
git commit -m "feat(ui): add field widget renderer for all data types"
```

---

### Task 15: `DynamicForm.vue`

**Files:**
- Create: `src/features/type-designer/DynamicForm.vue`
- Test: `src/features/type-designer/__tests__/DynamicForm.test.ts`

**Interfaces:**
- Consumes: `FormModel`, `buildFormModel` (Task 11); `FieldWidgets.vue` (Task 14)
- Produces: SFC `DynamicForm.vue` props `{ definition: TypeDefinition; modelValue: Record<string, unknown>; locale }`, emits `update:modelValue` và `submit`

- [ ] **Step 1: Viết failing test**

`src/features/type-designer/__tests__/DynamicForm.test.ts`:

```ts
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DynamicForm from '../DynamicForm.vue';
import type { TypeDefinition } from '@/core/types/definition';
import { money } from '@/core/money';

const def: TypeDefinition = {
  key: 'product', kind: 'builtin_ext', baseType: 'product',
  name: { vi: 'Sản phẩm', en: 'Product' }, version: 1, listView: ['name'],
  fields: [
    { key: 'name', label: { vi: 'Tên', en: 'Name' }, dataType: 'text', required: true },
    { key: 'price', label: { vi: 'Giá', en: 'Price' }, dataType: 'money', required: false },
    { key: 'cost', label: { vi: 'Vốn', en: 'Cost' }, dataType: 'formula', required: false, formula: 'price * 0.6' },
  ],
};

function mountForm(record: Record<string, unknown> = {}) {
  return mount(DynamicForm, {
    props: { definition: def, modelValue: record, locale: 'vi' as const },
    global: { plugins: [i18n] },
  });
}

describe('DynamicForm', () => {
  it('renders one control per field', () => {
    const wrapper = mountForm();
    expect(wrapper.findAll('[data-field]')).toHaveLength(3);
  });

  it('shows the computed formula value without an input', () => {
    const wrapper = mountForm({ name: 'Phở', price: money(100000, 'VND') });
    const cost = wrapper.find('[data-field="cost"]');
    expect(cost.text()).toContain('60');
    expect(cost.find('input').exists()).toBe(false);
  });

  it('marks the computed field as read-only', () => {
    expect(mountForm().find('[data-field="cost"]').attributes('data-computed')).toBe('true');
  });

  it('emits update:modelValue when a field changes', async () => {
    const wrapper = mountForm();
    await wrapper.find('[data-field="name"] input').setValue('Phở bò');
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({ name: 'Phở bò' });
  });

  it('shows a validation error for a missing required field after submit', async () => {
    const wrapper = mountForm();
    await wrapper.find('form').trigger('submit');
    expect(wrapper.text()).toContain(i18n.global.t('type.record.required'));
  });

  it('does not emit submit while a required field is empty', async () => {
    const wrapper = mountForm();
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('submit')).toBeUndefined();
  });

  it('emits submit with the record when every required field is filled', async () => {
    const wrapper = mountForm({ name: 'Phở' });
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ name: 'Phở' });
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npm run test -- src/features/type-designer/__tests__/DynamicForm.test.ts`
Expected: FAIL — SFC chưa tồn tại.

- [ ] **Step 3: Viết `DynamicForm.vue`**

Yêu cầu:
- Tính `buildFormModel(definition, modelValue)` bằng `computed` — mọi logic suy giá trị nằm ở Task 11, SFC chỉ render.
- Mỗi field bọc trong `[data-field="<key>"]`; field computed thêm `data-computed="true"`.
- Chỉ render `FieldWidgets` cho field **không** computed.
- Lỗi required chỉ hiện **sau lần submit đầu tiên** (cờ `submitted`), để không doạ người dùng ngay khi mở form.
- `submit` chỉ emit khi không còn lỗi.
- Không hardcode chuỗi; dùng `t('type.*')`.

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npm run test -- src/features/type-designer/__tests__/DynamicForm.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/type-designer/DynamicForm.vue src/features/type-designer/__tests__/DynamicForm.test.ts
git commit -m "feat(ui): add dynamic form renderer"
```

---

### Task 16: `DynamicList.vue` + `TypeDesigner.vue` + nối vào app shell

**Files:**
- Create: `src/features/type-designer/DynamicList.vue`
- Create: `src/features/type-designer/TypeDesigner.vue`
- Modify: `src/App.vue`
- Test: `src/features/type-designer/__tests__/DynamicList.test.ts`

**Interfaces:**
- Consumes: `buildListModel` (Task 11); `TypeRegistry` (Task 10); `RecordRepository` (Task 12); `createMemoryAdapter` (M0, dùng tạm khi chưa có PouchDB instance ở UI)
- Produces: SFC `DynamicList.vue` props `{ definition; records; locale }`; SFC `TypeDesigner.vue`

- [ ] **Step 1: Viết failing test cho `DynamicList`**

`src/features/type-designer/__tests__/DynamicList.test.ts`:

```ts
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DynamicList from '../DynamicList.vue';
import type { TypeDefinition } from '@/core/types/definition';
import { money } from '@/core/money';

const def: TypeDefinition = {
  key: 'product', kind: 'builtin_ext', baseType: 'product',
  name: { vi: 'Sản phẩm', en: 'Product' }, version: 1, listView: ['name', 'price', 'cost'],
  fields: [
    { key: 'name', label: { vi: 'Tên', en: 'Name' }, dataType: 'text', required: true },
    { key: 'price', label: { vi: 'Giá', en: 'Price' }, dataType: 'money', required: false },
    { key: 'cost', label: { vi: 'Vốn', en: 'Cost' }, dataType: 'formula', required: false, formula: 'price * 0.6' },
  ],
};

describe('DynamicList', () => {
  it('renders one column header per listView entry', () => {
    const wrapper = mount(DynamicList, {
      props: { definition: def, records: [], locale: 'vi' as const },
      global: { plugins: [i18n] },
    });
    expect(wrapper.findAll('th')).toHaveLength(3);
  });

  it('renders a row per record', () => {
    const wrapper = mount(DynamicList, {
      props: {
        definition: def,
        records: [{ _id: 'product:p1', name: 'Phở', price: money(69000, 'VND') }],
        locale: 'vi' as const,
      },
      global: { plugins: [i18n] },
    });
    expect(wrapper.findAll('tbody tr')).toHaveLength(1);
    expect(wrapper.text()).toContain('Phở');
  });

  it('shows the computed column value', () => {
    const wrapper = mount(DynamicList, {
      props: {
        definition: def,
        records: [{ _id: 'product:p1', name: 'Phở', price: money(100000, 'VND') }],
        locale: 'vi' as const,
      },
      global: { plugins: [i18n] },
    });
    expect(wrapper.text()).toContain('60');
  });

  it('shows the empty state when there are no records', () => {
    const wrapper = mount(DynamicList, {
      props: { definition: def, records: [], locale: 'vi' as const },
      global: { plugins: [i18n] },
    });
    expect(wrapper.text()).toContain(i18n.global.t('type.list.empty'));
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `npm run test -- src/features/type-designer/__tests__/DynamicList.test.ts`
Expected: FAIL — SFC chưa tồn tại.

- [ ] **Step 3: Viết `DynamicList.vue`**

- Header lấy `field.label[locale]` theo `definition.listView`; cột computed thêm hậu tố `(t('type.field.computed'))`.
- Ô dùng `buildListModel` (Task 11) — không tự format trong template.
- `records` rỗng → hiện `t('type.list.empty')`.

- [ ] **Step 4: Viết `TypeDesigner.vue`**

Màn hình tối thiểu để chứng minh R1:
- Liệt kê type hiện có (`registry.listTypes()`).
- Form tạo type mới: key, kind, baseType (chỉ khi `builtin_ext`), name vi/en.
- Thêm/xoá field; chọn `dataType` từ `DATA_TYPES`; với `select`/`multiselect` sửa được options; với `formula` nhập biểu thức.
- Hiển thị **lỗi validation từ engine** (`validateTypeDefinition`) ngay dưới field — dịch `ValidationCode` sang `type.error.*` (Task 13).
- Khi sửa type đã có: cảnh báo rằng thay đổi field sẽ tăng version và dữ liệu cũ sẽ được migrate (Risk #11).
- Nút chạy migration nền, hiện tiến độ từ `onProgress` (Task 9).
- Preview: render `DynamicForm` + `DynamicList` cho type đang sửa.

- [ ] **Step 5: Nối vào `App.vue`**

`src/App.vue` hiện là màn hình chào. Thay bằng một shell tối thiểu:

```vue
<script setup lang="ts">
import { ref } from 'vue';
import TypeDesigner from './features/type-designer/TypeDesigner.vue';

type View = 'designer' | 'hello';
const view = ref<View>('designer');
</script>

<template>
  <main>
    <nav>
      <button type="button" @click="view = 'designer'">Type Designer</button>
      <button type="button" @click="view = 'hello'">Hello</button>
    </nav>
    <TypeDesigner v-if="view === 'designer'" />
  </main>
</template>
```

**Không thêm `vue-router`** (quyết định D5). Khi có nhiều route thật (M2/M3) mới thêm.

- [ ] **Step 6: Chạy test để xác nhận pass**

Run: `npm run test -- src/features/type-designer/__tests__/DynamicList.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/type-designer/DynamicList.vue src/features/type-designer/TypeDesigner.vue src/App.vue src/features/type-designer/__tests__/DynamicList.test.ts
git commit -m "feat(ui): add dynamic list and type designer screen"
```

---

### Task 17: Nghiệm thu M1 — chứng minh "data type vô hạn" (R1)

**Vì sao:** Spec §9.1 chốt tiêu chí nghiệm thu M1: **"Type Designer + dynamic form"**, kiểm chứng R1. Test này chạy đúng kịch bản demo, không phải test đơn vị — nó là bằng chứng R1 hoạt động.

**Files:**
- Test: `src/core/types/__tests__/acceptance-r1.test.ts`

- [ ] **Step 1: Viết failing test**

`src/core/types/__tests__/acceptance-r1.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createMemoryAdapter } from '../../db/memory-adapter';
import { createTypeRegistry } from '../type-registry';
import { createRecordRepository } from '../record-repository';
import { buildFormModel, buildListModel } from '../read-model';
import { migrateCollection } from '../migration';

describe('M1 acceptance — unlimited user-defined types (R1)', () => {
  it('adds a custom field to a built-in type and renders it', async () => {
    const adapter = await createMemoryAdapter();
    const registry = createTypeRegistry(adapter);

    // 1. Admin thêm field "Độ cay" vào type Product có sẵn
    await registry.createType({
      key: 'product', kind: 'builtin_ext', baseType: 'product',
      name: { vi: 'Sản phẩm', en: 'Product' }, branchId: 'hq',
    });
    await registry.updateType('product', {
      fields: [
        { key: 'name', label: { vi: 'Tên', en: 'Name' }, dataType: 'text', required: true },
        { key: 'spicy_level', label: { vi: 'Độ cay', en: 'Spicy level' }, dataType: 'select', required: false,
          options: [
            { value: 'none', label: { vi: 'Không', en: 'None' } },
            { value: 'hot', label: { vi: 'Cay', en: 'Hot' } },
          ] },
      ],
      listView: ['name', 'spicy_level'],
    });

    // 2. Form tự sinh từ định nghĩa mới
    const definition = await registry.getType('product');
    const model = buildFormModel(definition!, { name: 'Phở bò', spicy_level: 'hot' });
    expect(model.fields.map((f) => f.field.key)).toEqual(['name', 'spicy_level']);
    expect(model.values.spicy_level).toBe('hot');
  });

  it('defines a brand-new entity type and runs generic CRUD on it', async () => {
    const adapter = await createMemoryAdapter();
    const registry = createTypeRegistry(adapter);
    const repo = createRecordRepository(adapter);

    // 1. Định nghĩa type mới hoàn toàn: Supplier
    await registry.createType({
      key: 'supplier', kind: 'entity', baseType: null,
      name: { vi: 'Nhà cung cấp', en: 'Supplier' }, branchId: 'hq',
    });
    await registry.updateType('supplier', {
      fields: [
        { key: 'name', label: { vi: 'Tên', en: 'Name' }, dataType: 'text', required: true },
        { key: 'rating', label: { vi: 'Đánh giá', en: 'Rating' }, dataType: 'number', required: false },
      ],
      listView: ['name', 'rating'],
    });

    // 2. CRUD không cần code riêng cho Supplier
    await repo.create({ typeKey: 'supplier', branchId: 'hq', data: { name: 'Mekong', rating: 4 } });
    await repo.create({ typeKey: 'supplier', branchId: 'hq', data: { name: 'Vina', rating: 5 } });

    const all = await repo.list('supplier');
    expect(all.map((d) => d.name).sort()).toEqual(['Mekong', 'Vina']);

    // 3. List view tự sinh
    const definition = await registry.getType('supplier');
    const cells = buildListModel(definition!, all[0]!, 'vi');
    expect(cells.map((c) => c.key)).toEqual(['name', 'rating']);
  });

  it('migrates existing records after the admin edits a type', async () => {
    const adapter = await createMemoryAdapter();
    const registry = createTypeRegistry(adapter);
    const repo = createRecordRepository(adapter);

    await registry.createType({
      key: 'supplier', kind: 'entity', baseType: null,
      name: { vi: 'Nhà cung cấp', en: 'Supplier' }, branchId: 'hq',
    });
    await registry.updateType('supplier', {
      fields: [{ key: 'level', label: { vi: 'Mức', en: 'Level' }, dataType: 'text', required: false }],
    });
    await repo.create({ typeKey: 'supplier', branchId: 'hq', data: { level: 'mild' } });

    // Admin đổi tên field level -> rating, rồi map giá trị chữ sang số
    const definition = await registry.getType('supplier');
    await registry.updateType('supplier', {
      fields: [{ key: 'rating', label: { vi: 'Đánh giá', en: 'Rating' }, dataType: 'number', required: false }],
      migration: [
        { kind: 'rename', from: 'level', to: 'rating' },
        { kind: 'mapValue', field: 'rating', map: { mild: 1, hot: 2 }, fallback: 0 },
      ],
    });

    const afterEdit = await registry.getType('supplier');
    const progress = await migrateCollection(adapter, afterEdit!, definition!.version === afterEdit!.version ? [] : []);

    // Chạy migration thật qua registry: đọc lại record và xác nhận đã chuyển đổi
    const migrated = await repo.get('supplier', 's001');
    expect(migrated!.rating).toBe(1);
    expect('level' in (migrated as unknown as Record<string, unknown>)).toBe(false);
    expect(progress.failed).toBe(0);
  });

  it('rejects a type definition that would break existing data', async () => {
    const adapter = await createMemoryAdapter();
    const registry = createTypeRegistry(adapter);

    await expect(
      registry.createType({
        key: 'supplier', kind: 'entity', baseType: null,
        name: { vi: 'NCC', en: 'Supplier' }, branchId: 'hq',
      }).then(() =>
        registry.updateType('supplier', {
          fields: [{ key: 'total', label: { vi: 'Tổng', en: 'Total' }, dataType: 'formula', required: false, formula: 'missing_field * 2' }],
        }),
      ),
    ).rejects.toThrow(/missing_field/);
  });
});
```

> **Lưu ý về test thứ 3:** cần hoàn thiện phần nối migration vào `updateType` (Task 10 nhận `migration`, Task 12 gọi `migrateRecordOnRead`). Nếu lúc viết test này thấy luồng chưa khớp, **sửa test cho khớp hành vi đã thống nhất** — hoặc sửa implementation nếu hành vi sai. Đừng để test giả xanh: test này là **bằng chứng R1**, không phải test trang trí.

- [ ] **Step 2: Chạy test để xác nhận fail (hoặc lộ lỗ hổng)**

Run: `npm run test -- src/core/types/__tests__/acceptance-r1.test.ts`
Expected: có thể PASS nếu các task trước đã đúng; nếu FAIL thì đó là lỗ hổng thật giữa các task — sửa **implementation**, không nới test.

- [ ] **Step 3: Chạy toàn bộ verification gate**

Bốn lệnh, tất cả phải xanh (CLAUDE.md — CI chạy đúng bốn lệnh này):

```bash
npm run test
npx vue-tsc --noEmit
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

> Trên Git Bash của Windows, `cargo` có thể không nằm trên `PATH`:
> `export PATH="$HOME/.cargo/bin:$PATH"`

- [ ] **Step 4: Kiểm tra thủ công (không thay thế test)**

```bash
npm run dev
```

Mở `http://localhost:5173`, vào Type Designer, và xác nhận **bằng mắt**:
1. Tạo type `Supplier` (entity, không baseType).
2. Thêm field `rating` (number) và `score` (formula = `rating * 10`).
3. Preview form: `score` tự tính, không nhập được.
4. Lưu một record, thấy nó hiện trong list view.
5. Sửa type: đổi `rating` → `quality`, chạy migration nền, thấy record cũ được chuyển đổi.

Đây là demo R1. Nếu bước nào không chạy được bằng mắt, task chưa xong dù test xanh.

- [ ] **Step 5: Commit**

```bash
git add src/core/types/__tests__/acceptance-r1.test.ts
git commit -m "test(types): add M1 acceptance test for unlimited user-defined types"
```

---

## Self-Review

Chạy theo checklist của skill `writing-plans`:

**1. Spec coverage (M1 — spec §9):**

| Yêu cầu trong spec §9 (M1) | Task |
|---|---|
| Type Registry engine | Task 10 |
| Field-type registry | Task 3 |
| Dynamic form/table renderer | Task 14, 15, 16 |
| Validation engine | Task 3, 4 |
| Formula interpreter | Task 5, 6, 7 |
| Schema versioning + migration | Task 8, 9 |
| Type Designer UI | Task 13, 14, 15, 16 |
| Chứng minh R1 | Task 17 |

Không có khoảng trống trong phạm vi M1. Các ràng buộc riêng (§R1) cũng có test sở hữu: reserved keys → Task 4; không `eval` → Task 6; migration khai báo → Task 8; giới hạn index → Task 4.

**2. Placeholder scan:** không có "TODO"/"TBD". Hai chỗ có ghi chú có điều kiện — Task 4 Step 5 (thứ tự thực thi) và Task 17 Step 1 (nối migration) — cả hai đều nêu **hành động cụ thể**, không phải placeholder. Task 13 là bảng key đầy đủ, không phải "thêm key sau".

**3. Type consistency:** đã kiểm tra chéo tên hàm/chữ ký giữa các task:

- `mulRational` — định nghĩa Task 1, dùng Task 7.
- `DATA_TYPES`, `SYSTEM_FIELD_KEYS`, `TypeDefinition`, `FieldDefinition`, `createTypeDefinitionDoc` — Task 2; dùng Task 3, 4, 9, 10, 11, 12, 14, 15, 16.
- `typeDocId`, `recordDocId` — Task 2, 12; dùng Task 10, 12.
- `FIELD_TYPES`, `fieldType`, `defaultValueFor`, `formatFieldValue`, `ValidationIssue` — Task 3; dùng Task 4, 11, 12.
- `validateTypeDefinition`, `assertValidTypeDefinition`, `MAX_INDEXED_FIELDS` — Task 4; dùng Task 10, 12.
- `Rational`, `ratAdd`, `ratMul`, `ratRound` — Task 5; dùng Task 6, 7.
- `parseFormula`, `ParsedFormula`, `FormulaNode`, `FormulaError` — Task 6; dùng Task 4, 7, 11.
- `evaluateFormula`, `formulaValueOf`, `FormulaValue` — Task 7; dùng Task 11.
- `applyTransforms`, `TypeMigration`, `MigrationTransform` — Task 8; dùng Task 9, 10.
- `buildChain`, `migrateData`, `migrateRecordOnRead`, `migrateCollection` — Task 9; dùng Task 12, 17.
- `createTypeRegistry`, `TypeRegistry`, `UpdateTypeInput` — Task 10; dùng Task 12, 16, 17.
- `buildFormModel`, `buildListModel`, `computeFormulaFields`, `FormModel` — Task 11; dùng Task 15, 16, 17.
- `createRecordRepository`, `RecordRepository` — Task 12; dùng Task 16, 17.

Không phát hiện lệch tên. **Một lệch đã biết:** `TypeMigration` được khai báo ở Task 8 nhưng `updateType` (Task 10) nhận `MigrationTransform[]` (một bậc), không nhận `TypeMigration[]` (cả chặng) — vì registry tự sinh `fromVersion`/`toVersion` từ version hiện tại. Đây là chủ ý, không phải lỗi.

**4. Review Focus:** cả 5 dòng đều có test sở hữu:

| Review Focus | Task | Test |
|---|---|---|
| `price * 0.6` với money | Task 1, 7 | `multiplies exactly…`, `evaluates the spec example exactly` |
| Formula trỏ field không tồn tại | Task 4 | `rejects a formula field that references an unknown field` |
| Formula vòng lặp | Task 4 | `detects a formula cycle`, `detects a longer formula cycle` |
| Reserved / trùng tên field hệ thống | Task 4 | `rejects a field key starting with an underscore`, `…shadows a system field` |
| Migration chạy lại / nhảy bậc | Task 9 | `is idempotent…`, `runs every step in order for a document two versions behind` |

**5. Thứ tự thực thi:** số thứ tự task không trùng khớp hoàn toàn với thứ tự phụ thuộc — **Task 4 cần `parseFormula` của Task 6**. Thứ tự chạy đề xuất:

```
1 → 2 → 3 → 5 → 6 → 7 → 4 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17
```

(Task 3 độc lập với Task 4–7; có thể chạy song song nếu chia việc.)

**6. Điểm chưa kiểm chứng được bằng test tự động:**

- **`image` lưu ở đâu** — spec §13.2 nêu vấn đề nhưng chưa chốt giải pháp. Plan này chỉ chấp nhận data URL / id tham chiếu ở v1. Nếu chọn lưu attachment PouchDB, `image` cần task riêng và có thể phá quota IndexedDB (Risk #13 trong spec).
- **Hiệu năng với catalog lớn** (Risk #2) — chưa có benchmark trong M1. `listTypes()` và `migrateCollection` quét toàn bộ collection; với vài nghìn document có thể chậm.
- **Cross-branch isolation cho `meta_types`** — plan giả định `meta_types` là toàn hệ thống (D3). Nếu sau này cần type riêng theo branch, phải thêm lọc `branchId` vào `listTypes` (chỗ này hiện chưa lọc).

---

## Handoff

**Plan đã lưu** tại `docs/superpowers/plans/2026-10-20-m1-type-registry.md`.

**Trạng thái tiền đề:** M0 đã xong và đã commit. PouchDB adapter (`src/core/db/pouch-adapter.ts`) cũng đã xong — thêm cùng bộ test hợp đồng chia sẻ với memory adapter (`__tests__/adapter-contract.ts`). Tổng 89 test pass. `happy-dom` **chưa** được cài (Task 14 cài).

**Về việc thực thi:** skill `writing-plans` yêu cầu dùng `superpowers:subagent-driven-development` hoặc `superpowers:executing-plans`, nhưng plugin `superpowers@claude-plugins-official` **chưa được cài** trên máy này. Hai cách xử lý:

1. **Cài plugin** rồi dùng đúng hai sub-skill trên (thêm marketplace `claude-plugins-official` → cài `superpowers`).
2. **Chạy plan này trực tiếp** — plan tự chứa đủ ngữ cảnh (mỗi task có file, interface, test và code thật), nên có thể thực thi tuần tự mà không cần sub-skill.

**Quyết định cần xác nhận trước khi bắt đầu** — nếu sai thì phải sửa **trước** khi code, vì chúng ảnh hưởng schema hoặc tiền:

| # | Quyết định | Ảnh hưởng |
|---|---|---|
| D1 | `decimal` = số nguyên đã scale + option `scale` (mặc định 2) | Task 2, 3, 12 |
| D2 | Làm tròn `money * phân số` = half away from zero | Task 1, 7 |
| D3 | `meta_types` là metadata toàn hệ thống, không theo branch | Task 2, 10, 12 |
| D4 | Formula chỉ nhận number / money / boolean | Task 6, 7, 11 |
| D5 | Chưa thêm `vue-router` ở M1 | Task 16 |

**Thứ tự git đề xuất:**

```bash
cd E:/Coding/vue/open-pos
git add docs/superpowers/plans/2026-10-20-m1-type-registry.md
git commit -m "docs: add m1 type registry implementation plan"
```

Commit plan **trước** khi bắt đầu Task 1, để mọi thay đổi code sau đó đều có điểm so sánh.

**Nhắc lại gate nghiệm thu:** trước khi báo xong bất kỳ task nào, chạy đủ bốn lệnh — `npm run test`, `npx vue-tsc --noEmit`, `cargo test --manifest-path src-tauri/Cargo.toml`, `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`. CI chạy đúng bốn lệnh này, nên pass cục bộ mới là gate thật.

