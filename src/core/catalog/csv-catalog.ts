import type { CurrencyCode, Money } from '../money';
import { formatMoneyInput, parseMoneyInput } from '../money-parse';
import { slugify } from '../slug';
import type { LocalizedText } from '../types/definition';
import type { CategoryDoc } from './category';
import type { ProductDoc, ProductVariant } from './product';
import { normalizeBarcode } from './product';
import type { CatalogRepository } from './catalog-repository';
import { formatCsv, parseCsv } from './csv';

/**
 * Import/export catalog bằng CSV — đường "nhập menu thật của quán" (checkpoint M2).
 *
 * Hai quyết định định hình cả file này:
 *
 * 1. **Import là atomic** (D7): mọi dòng được parse và kiểm **trước**, có bất kỳ lỗi nào
 *    thì ném lỗi và không ghi gì. Người dùng sửa file rồi nhập lại, thay vì phải dò xem
 *    lần nhập hỏng đã ghi được những dòng nào.
 * 2. **Tiền là chuỗi đơn vị lớn** ("65000"), parse bằng `parseMoneyInput` — không đi qua
 *    float, nên không mất đồng nào (Review Focus #1).
 *
 * Field tuỳ chỉnh của type `product` (M1) **không** nằm trong CSV v1: bộ cột là cố định
 * và cột lạ bị từ chối. Sản phẩm đã có field tuỳ chỉnh vẫn giữ nguyên giá trị khi nhập
 * lại, vì đó là bản cập nhật chứ không phải tạo mới.
 */

export const CATEGORY_CSV_COLUMNS = ['_id', 'name_vi', 'name_en', 'sort_order'] as const;

export const PRODUCT_CSV_COLUMNS = [
  '_id',
  'name_vi',
  'name_en',
  'category_id',
  'base_price',
  'unit',
  'barcode',
  'sku',
  'image_ref',
  'sort_order',
  'is_active',
  'variants',
] as const;

export interface CsvRowError {
  /** Số dòng **theo file** (dòng tiêu đề là 1) để người dùng mở Excel tới đúng chỗ. */
  readonly row: number;
  readonly column: string;
  readonly message: string;
}

export interface ParsedCategoryRow {
  /** `null` = tạo mới, id sinh từ slug tên. */
  readonly id: string | null;
  readonly name: LocalizedText;
  readonly sortOrder: number;
}

export interface ParsedProductRow {
  readonly id: string | null;
  readonly name: LocalizedText;
  readonly categoryId: string | null;
  readonly basePrice: Money;
  readonly unit: string | null;
  readonly barcode: string | null;
  readonly sku: string | null;
  readonly imageRef: string | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly variants: readonly ProductVariant[];
}

export interface ImportSummary {
  readonly created: readonly string[];
  readonly updated: readonly string[];
}

interface ParsedTable<T> {
  readonly rows: readonly T[];
  readonly errors: readonly CsvRowError[];
}

interface BuiltRow<T> {
  readonly value: T;
  /** `_id` hiệu dụng (đã sinh từ slug nếu trống) — dùng để phát hiện trùng trong file. */
  readonly id: string;
}

type RowBuilder<T> = (
  read: (column: string) => string,
  row: number,
  errors: CsvRowError[],
) => BuiltRow<T> | null;

const CURRENCIES: readonly string[] = ['VND', 'USD'];

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatRowError(error: CsvRowError): string {
  return `row ${error.row}, column "${error.column}": ${error.message}`;
}

function csvImportError(fnName: string, errors: readonly CsvRowError[]): Error {
  const details = errors.map((error) => `  ${formatRowError(error)}`).join('\n');
  return new Error(
    `${fnName}(): ${errors.length} invalid row(s), nothing was written:\n${details}`,
  );
}

/** Hai terminal phải xuất ra file giống nhau với cùng dữ liệu. */
function compareByOrderThenName<T extends { _id: string; sortOrder: number; name: LocalizedText }>(
  a: T,
  b: T,
): number {
  return (
    a.sortOrder - b.sortOrder ||
    a.name.vi.localeCompare(b.name.vi) ||
    a._id.localeCompare(b._id)
  );
}

function buildHeaderIndex(
  header: readonly string[],
  columns: readonly string[],
  required: readonly string[],
): { index: Map<string, number>; errors: CsvRowError[] } {
  const known = new Set<string>(columns);
  const index = new Map<string, number>();
  const errors: CsvRowError[] = [];
  const reportedUnknown = new Set<string>();

  header.forEach((raw, position) => {
    const name = raw.trim();
    if (name === '') return;

    if (!known.has(name)) {
      if (!reportedUnknown.has(name)) {
        reportedUnknown.add(name);
        errors.push({
          row: 1,
          column: name,
          message: `unknown column ${JSON.stringify(name)}; expected one of ${columns.join(', ')}`,
        });
      }
      return;
    }

    if (index.has(name)) {
      errors.push({
        row: 1,
        column: name,
        message: `column ${JSON.stringify(name)} is declared more than once`,
      });
      return;
    }

    index.set(name, position);
  });

  for (const name of required) {
    if (!index.has(name)) {
      errors.push({
        row: 1,
        column: name,
        message: `missing required column ${JSON.stringify(name)}`,
      });
    }
  }

  return { index, errors };
}

function parseCsvTable<T>(
  text: string,
  columns: readonly string[],
  required: readonly string[],
  build: RowBuilder<T>,
): ParsedTable<T> {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], errors: [] };

  const { index, errors } = buildHeaderIndex(table[0] ?? [], columns, required);
  if (errors.length > 0) return { rows: [], errors };

  const rows: T[] = [];
  const seenIds = new Map<string, number>();

  for (let position = 1; position < table.length; position += 1) {
    const raw = table[position] ?? [];
    // Excel hay để lại dòng trống ở cuối file; bỏ qua thay vì báo lỗi khó hiểu.
    if (raw.every((value) => value.trim() === '')) continue;

    const row = position + 1;
    const read = (column: string): string => {
      const columnPosition = index.get(column);
      return columnPosition === undefined ? '' : (raw[columnPosition] ?? '');
    };

    const errorsBefore = errors.length;
    const built = build(read, row, errors);
    if (built === null || errors.length > errorsBefore) continue;

    const firstSeen = seenIds.get(built.id);
    if (firstSeen !== undefined) {
      errors.push({
        row,
        column: '_id',
        message: `${JSON.stringify(built.id)} is already used by row ${firstSeen}`,
      });
      continue;
    }

    seenIds.set(built.id, row);
    rows.push(built.value);
  }

  return { rows, errors };
}

/** `category:main` hoặc `main` → `main`; tiền tố khác bị từ chối. */
function readBareId(
  rawId: string,
  prefix: string,
  row: number,
  errors: CsvRowError[],
): string | null {
  if (rawId.startsWith(`${prefix}:`)) {
    const segment = rawId.slice(prefix.length + 1);
    if (segment === '') {
      errors.push({ row, column: '_id', message: `_id ${JSON.stringify(rawId)} has an empty id` });
      return null;
    }
    return segment;
  }

  if (rawId.includes(':')) {
    errors.push({
      row,
      column: '_id',
      message: `_id ${JSON.stringify(rawId)} must start with "${prefix}:" or be a bare id`,
    });
    return null;
  }

  return rawId;
}

function readSortOrder(
  read: (column: string) => string,
  row: number,
  errors: CsvRowError[],
): number {
  const raw = read('sort_order').trim();
  if (raw === '') return 0;

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    errors.push({
      row,
      column: 'sort_order',
      message: `sort_order must be a non-negative integer, got ${JSON.stringify(raw)}`,
    });
    return 0;
  }
  return value;
}

function readIsActive(
  read: (column: string) => string,
  row: number,
  errors: CsvRowError[],
): boolean {
  const raw = read('is_active').trim();
  const normalized = raw.toLowerCase();

  if (normalized === '' || normalized === '1' || normalized === 'true') return true;
  if (normalized === '0' || normalized === 'false') return false;

  errors.push({
    row,
    column: 'is_active',
    message: `is_active must be 1/0 or true/false, got ${JSON.stringify(raw)}`,
  });
  return true;
}

function readOptional(read: (column: string) => string, column: string): string | null {
  const value = read(column).trim();
  return value === '' ? null : value;
}

function parseVariant(
  item: unknown,
  index: number,
  row: number,
  errors: CsvRowError[],
): ProductVariant | null {
  const column = 'variants';

  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    errors.push({ row, column, message: `variants[${index}] must be an object` });
    return null;
  }

  const candidate = item as {
    id?: unknown;
    name?: { vi?: unknown; en?: unknown };
    priceDelta?: { minor?: unknown; currency?: unknown };
  };

  const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
  if (id === '' || id.includes(':')) {
    errors.push({
      row,
      column,
      message: `variants[${index}].id must be a non-empty id without ":", got ${JSON.stringify(candidate.id)}`,
    });
    return null;
  }

  const vi = typeof candidate.name?.vi === 'string' ? candidate.name.vi.trim() : '';
  if (vi === '') {
    errors.push({
      row,
      column,
      message: `variants[${index}].name.vi must be a non-empty string`,
    });
    return null;
  }
  const en = typeof candidate.name?.en === 'string' ? candidate.name.en.trim() : '';

  const minor = candidate.priceDelta?.minor;
  const currency = candidate.priceDelta?.currency;
  if (typeof minor !== 'number' || !Number.isSafeInteger(minor)) {
    errors.push({
      row,
      column,
      message: `variants[${index}].priceDelta.minor must be a safe integer, got ${JSON.stringify(minor)}`,
    });
    return null;
  }
  if (typeof currency !== 'string' || !CURRENCIES.includes(currency)) {
    errors.push({
      row,
      column,
      message: `variants[${index}].priceDelta.currency must be one of ${CURRENCIES.join(', ')}, got ${JSON.stringify(currency)}`,
    });
    return null;
  }

  return {
    id,
    name: { vi, en: en === '' ? vi : en },
    priceDelta: { minor, currency: currency as CurrencyCode },
  };
}

function readVariants(
  read: (column: string) => string,
  row: number,
  errors: CsvRowError[],
): readonly ProductVariant[] {
  const raw = read('variants').trim();
  if (raw === '') return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    errors.push({
      row,
      column: 'variants',
      message: `variants must be a JSON array: ${messageOf(error)}`,
    });
    return [];
  }

  if (!Array.isArray(parsed)) {
    errors.push({ row, column: 'variants', message: 'variants must be a JSON array' });
    return [];
  }

  const variants: ProductVariant[] = [];
  parsed.forEach((item, index) => {
    const variant = parseVariant(item, index, row, errors);
    if (variant !== null) variants.push(variant);
  });

  return variants;
}

function buildCategoryRow(
  read: (column: string) => string,
  row: number,
  errors: CsvRowError[],
): BuiltRow<ParsedCategoryRow> | null {
  const errorsBefore = errors.length;

  const nameVi = read('name_vi').trim();
  if (nameVi === '') {
    errors.push({ row, column: 'name_vi', message: 'name_vi must not be blank' });
  }
  const nameEn = read('name_en').trim();
  const sortOrder = readSortOrder(read, row, errors);

  const rawId = read('_id').trim();
  const id = rawId === '' ? null : readBareId(rawId, 'category', row, errors);

  if (errors.length > errorsBefore) return null;

  const effectiveId = id ?? safeSlug(nameVi, row, errors);
  if (effectiveId === null) return null;

  return {
    value: { id, name: { vi: nameVi, en: nameEn === '' ? nameVi : nameEn }, sortOrder },
    id: effectiveId,
  };
}

function buildProductRow(
  read: (column: string) => string,
  row: number,
  errors: CsvRowError[],
  currency: CurrencyCode,
): BuiltRow<ParsedProductRow> | null {
  const errorsBefore = errors.length;

  const nameVi = read('name_vi').trim();
  if (nameVi === '') {
    errors.push({ row, column: 'name_vi', message: 'name_vi must not be blank' });
  }
  const nameEn = read('name_en').trim();

  let basePrice: Money | null = null;
  const rawPrice = read('base_price').trim();
  try {
    basePrice = parseMoneyInput(rawPrice, currency);
  } catch (error) {
    errors.push({ row, column: 'base_price', message: messageOf(error) });
  }

  const sortOrder = readSortOrder(read, row, errors);
  const isActive = readIsActive(read, row, errors);
  const variants = readVariants(read, row, errors);

  const rawId = read('_id').trim();
  const id = rawId === '' ? null : readBareId(rawId, 'product', row, errors);

  if (errors.length > errorsBefore || basePrice === null) return null;

  const effectiveId = id ?? safeSlug(nameVi, row, errors);
  if (effectiveId === null) return null;

  return {
    value: {
      id,
      name: { vi: nameVi, en: nameEn === '' ? nameVi : nameEn },
      categoryId: readOptional(read, 'category_id'),
      basePrice,
      unit: readOptional(read, 'unit'),
      barcode: normalizeBarcode(read('barcode')),
      sku: readOptional(read, 'sku'),
      imageRef: readOptional(read, 'image_ref'),
      sortOrder,
      isActive,
      variants,
    },
    id: effectiveId,
  };
}

/** Slug từ tên; tên không còn ký tự dùng được là lỗi của dòng, không phải lỗi ném ra ngoài. */
function safeSlug(name: string, row: number, errors: CsvRowError[]): string | null {
  try {
    return slugify(name);
  } catch (error) {
    errors.push({ row, column: 'name_vi', message: messageOf(error) });
    return null;
  }
}

export function exportCategoriesCsv(categories: readonly CategoryDoc[]): string {
  const rows: string[][] = [[...CATEGORY_CSV_COLUMNS]];

  for (const category of [...categories].sort(compareByOrderThenName)) {
    rows.push([
      category._id,
      category.name.vi,
      category.name.en,
      String(category.sortOrder),
    ]);
  }

  return formatCsv(rows);
}

export function exportProductsCsv(products: readonly ProductDoc[], currency: CurrencyCode): string {
  const rows: string[][] = [[...PRODUCT_CSV_COLUMNS]];

  for (const product of [...products].sort(compareByOrderThenName)) {
    if (product.basePrice.currency !== currency) {
      throw new Error(
        `exportProductsCsv(): product ${JSON.stringify(product._id)} is priced in ` +
          `${product.basePrice.currency} but the file is exported as ${currency}`,
      );
    }

    rows.push([
      product._id,
      product.name.vi,
      product.name.en,
      product.categoryId ?? '',
      formatMoneyInput(product.basePrice),
      product.unit ?? '',
      product.barcode ?? '',
      product.sku ?? '',
      product.imageRef ?? '',
      String(product.sortOrder),
      product.isActive ? '1' : '0',
      JSON.stringify(product.variants),
    ]);
  }

  return formatCsv(rows);
}

export function parseCategoriesCsv(text: string): ParsedTable<ParsedCategoryRow> {
  return parseCsvTable(text, CATEGORY_CSV_COLUMNS, ['name_vi'], buildCategoryRow);
}

export function parseProductsCsv(
  text: string,
  options: { readonly currency: CurrencyCode },
): ParsedTable<ParsedProductRow> {
  return parseCsvTable(text, PRODUCT_CSV_COLUMNS, ['name_vi', 'base_price'], (read, row, errors) =>
    buildProductRow(read, row, errors, options.currency),
  );
}

function requireRev(docId: string, doc: { readonly _rev?: string }, fnName: string): string {
  if (doc._rev === undefined) {
    throw new Error(`${fnName}(): stored document ${JSON.stringify(docId)} has no _rev`);
  }
  return doc._rev;
}

export async function importCategoriesCsv(
  repo: CatalogRepository,
  text: string,
): Promise<ImportSummary> {
  const { rows, errors } = parseCategoriesCsv(text);
  if (errors.length > 0) throw csvImportError('importCategoriesCsv', errors);

  const existing = new Map(
    (await repo.listCategories()).map((category) => [category._id, category]),
  );
  const summary: { created: string[]; updated: string[] } = { created: [], updated: [] };

  for (const row of rows) {
    const id = row.id ?? slugify(row.name.vi);
    const docId = `category:${id}`;
    const current = existing.get(docId) ?? null;

    if (current === null) {
      await repo.createCategory({ id, name: row.name, sortOrder: row.sortOrder });
      summary.created.push(docId);
      continue;
    }

    await repo.updateCategory(
      id,
      { name: row.name, sortOrder: row.sortOrder },
      requireRev(docId, current, 'importCategoriesCsv'),
    );
    summary.updated.push(docId);
  }

  return summary;
}

export async function importProductsCsv(
  repo: CatalogRepository,
  text: string,
  options: { readonly currency: CurrencyCode },
): Promise<ImportSummary> {
  const { rows, errors } = parseProductsCsv(text, options);
  if (errors.length > 0) throw csvImportError('importProductsCsv', errors);

  const [categories, products] = await Promise.all([repo.listCategories(), repo.listProducts()]);
  const categoryIds = new Set(categories.map((category) => category._id));
  const byId = new Map(products.map((product) => [product._id, product]));

  // Kiểm trước những gì repository sẽ từ chối — nếu không, lỗi xảy ra giữa vòng ghi và
  // các dòng trước đã nằm trong store, phá tính atomic của D7.
  const barcodeOwner = new Map<string, string>();
  for (const product of products) {
    const barcode = normalizeBarcode(product.barcode);
    if (barcode !== null) barcodeOwner.set(barcode, product._id);
  }

  const planned = rows.map((row) => {
    const id = row.id ?? slugify(row.name.vi);
    const docId = `product:${id}`;
    const existing = byId.get(docId) ?? null;

    if (row.categoryId !== null && !categoryIds.has(row.categoryId)) {
      throw new Error(
        `importProductsCsv(): category ${JSON.stringify(row.categoryId)} not found ` +
          `(row for ${JSON.stringify(docId)}); nothing was written`,
      );
    }

    const barcode = normalizeBarcode(row.barcode);
    if (barcode !== null) {
      const owner = barcodeOwner.get(barcode);
      if (owner !== undefined && owner !== docId) {
        throw new Error(
          `importProductsCsv(): barcode ${JSON.stringify(barcode)} is already used by ` +
            `${JSON.stringify(owner)} (row for ${JSON.stringify(docId)}); nothing was written`,
        );
      }
      barcodeOwner.set(barcode, docId);
    }

    return { row, id, docId, existing };
  });

  const summary: { created: string[]; updated: string[] } = { created: [], updated: [] };

  for (const { row, id, docId, existing } of planned) {
    if (existing === null) {
      await repo.createProduct({ ...row, id });
      summary.created.push(docId);
      continue;
    }

    await repo.updateProduct(id, { ...row }, requireRev(docId, existing, 'importProductsCsv'));
    summary.updated.push(docId);
  }

  return summary;
}
