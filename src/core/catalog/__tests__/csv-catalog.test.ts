import { describe, it, expect, beforeEach } from 'vitest';
import { money } from '../../money';
import type { DbAdapter } from '../../db/adapter';
import { createMemoryAdapter } from '../../db/memory-adapter';
import type { CategoryDoc } from '../category';
import { createCategoryDoc } from '../category';
import type { ProductDoc } from '../product';
import { createProductDoc } from '../product';
import type { CatalogRepository } from '../catalog-repository';
import { createCatalogRepository } from '../catalog-repository';
import { parseCsv } from '../csv';
import {
  CATEGORY_CSV_COLUMNS,
  PRODUCT_CSV_COLUMNS,
  exportCategoriesCsv,
  exportProductsCsv,
  importCategoriesCsv,
  importProductsCsv,
  parseCategoriesCsv,
  parseProductsCsv,
} from '../csv-catalog';

const NOW = '2026-10-22T09:00:00.000Z';

const main: CategoryDoc = createCategoryDoc({
  id: 'main',
  name: { vi: 'Món chính', en: 'Mains' },
  sortOrder: 0,
  now: NOW,
});

const phoBo: ProductDoc = createProductDoc({
  id: 'pho-bo',
  name: { vi: 'Phở bò', en: 'Beef pho' },
  basePrice: money(65000, 'VND'),
  categoryId: 'category:main',
  barcode: '8935001',
  variants: [
    { id: 'size-l', name: { vi: 'Tô lớn', en: 'Large' }, priceDelta: money(9000, 'VND') },
  ],
  now: NOW,
});

const traDa: ProductDoc = createProductDoc({
  id: 'tra-da',
  name: { vi: 'Trà đá', en: 'Iced tea' },
  basePrice: money(5000, 'VND'),
  now: NOW,
});

describe('exportCategoriesCsv', () => {
  it('writes the pinned header and sorts by sortOrder', () => {
    const drinks = createCategoryDoc({
      id: 'drinks',
      name: { vi: 'Đồ uống', en: 'Drinks' },
      sortOrder: 1,
      now: NOW,
    });

    const rows = parseCsv(exportCategoriesCsv([drinks, main]));

    expect(rows[0]).toEqual([...CATEGORY_CSV_COLUMNS]);
    expect(rows.slice(1).map((row) => row[0])).toEqual(['category:main', 'category:drinks']);
  });
});

describe('exportProductsCsv', () => {
  it('exports products with a header Excel can open', () => {
    const text = exportProductsCsv([phoBo, traDa], 'VND');
    const rows = parseCsv(text);

    expect(rows[0]).toEqual([...PRODUCT_CSV_COLUMNS]);
    expect(rows[1]?.[0]).toBe('product:pho-bo');
    expect(rows[1]?.[4]).toBe('65000'); // tiền ở đơn vị lớn, không phân cách
    expect(rows[1]?.[8]).toBe(''); // image_ref rỗng = '' chứ không phải 'null'
    expect(text.startsWith('\uFEFF')).toBe(true);
  });
});

describe('parseCategoriesCsv', () => {
  it('parses a hand-written row and defaults name_en to name_vi', () => {
    const { rows, errors } = parseCategoriesCsv('name_vi\nĐồ uống\n');

    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { id: null, name: { vi: 'Đồ uống', en: 'Đồ uống' }, sortOrder: 0 },
    ]);
  });

  it('reads columns by name, in any order', () => {
    const { rows, errors } = parseCategoriesCsv('sort_order,_id,name_vi\n2,category:drinks,Đồ uống\n');

    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { id: 'drinks', name: { vi: 'Đồ uống', en: 'Đồ uống' }, sortOrder: 2 },
    ]);
  });

  it('reports an unknown column once, on the header line', () => {
    const { rows, errors } = parseCategoriesCsv('name_vi,ghost,ghost\nĐồ uống,1,2\n');

    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ row: 1, column: 'ghost' });
  });

  it('reports a missing required column on the header line', () => {
    const { rows, errors } = parseCategoriesCsv('_id,sort_order\ncategory:drinks,1\n');

    expect(rows).toEqual([]);
    expect(errors[0]).toMatchObject({ row: 1, column: 'name_vi' });
  });
});

describe('parseProductsCsv', () => {
  it('parses a hand-written menu row', () => {
    const { rows, errors } = parseProductsCsv(
      'name_vi,base_price,category_id\nPhở bò,65000,category:main\n',
      { currency: 'VND' },
    );

    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        id: null,
        name: { vi: 'Phở bò', en: 'Phở bò' },
        categoryId: 'category:main',
        basePrice: money(65000, 'VND'),
        unit: null,
        barcode: null,
        sku: null,
        imageRef: null,
        sortOrder: 0,
        isActive: true,
        variants: [],
      },
    ]);
  });

  it('reports the file line number for a bad price', () => {
    const { rows, errors } = parseProductsCsv('name_vi,base_price\nPhở bò,65000\nTrà đá,65.000\n', {
      currency: 'VND',
    });

    expect(rows).toHaveLength(1);
    expect(errors).toEqual([
      { row: 3, column: 'base_price', message: expect.stringMatching(/65\.000/) },
    ]);
  });

  it('reports a missing name and a fraction VND cannot represent', () => {
    const { rows, errors } = parseProductsCsv('name_vi,base_price\n,65000\nPhở bò,65.5\n', {
      currency: 'VND',
    });

    expect(rows).toEqual([]);
    expect(errors).toEqual([
      { row: 2, column: 'name_vi', message: expect.any(String) },
      { row: 3, column: 'base_price', message: expect.any(String) },
    ]);
  });

  it('accepts a bare _id and a prefixed _id', () => {
    const { rows, errors } = parseProductsCsv(
      '_id,name_vi,base_price\npho-bo,Phở bò,65000\nproduct:tra-da,Trà đá,5000\n',
      { currency: 'VND' },
    );

    expect(errors).toEqual([]);
    expect(rows.map((row) => row.id)).toEqual(['pho-bo', 'tra-da']);
  });

  it('rejects an _id with a foreign prefix', () => {
    const { errors } = parseProductsCsv(
      '_id,name_vi,base_price\ncategory:main,Phở bò,65000\n',
      { currency: 'VND' },
    );

    expect(errors[0]).toMatchObject({ row: 2, column: '_id' });
  });

  it('parses the variants JSON cell and rejects malformed JSON with the line number', () => {
    const good = parseProductsCsv(
      'name_vi,base_price,variants\nPhở bò,65000,"[{""id"":""size-l"",""name"":{""vi"":""Tô lớn"",""en"":""Large""},""priceDelta"":{""minor"":9000,""currency"":""VND""}}]"\n',
      { currency: 'VND' },
    );
    expect(good.errors).toEqual([]);
    expect(good.rows[0]?.variants).toEqual(phoBo.variants);

    const bad = parseProductsCsv('name_vi,base_price,variants\nPhở bò,65000,"[{oops]"\n', {
      currency: 'VND',
    });
    expect(bad.rows).toEqual([]);
    expect(bad.errors[0]).toMatchObject({ row: 2, column: 'variants' });
  });

  it('accepts 1/0 and true/false for is_active, and blanks as true', () => {
    const { rows, errors } = parseProductsCsv(
      'name_vi,base_price,is_active\nA,1000,1\nB,2000,0\nC,3000,false\nD,4000,\n',
      { currency: 'VND' },
    );

    expect(errors).toEqual([]);
    expect(rows.map((row) => row.isActive)).toEqual([true, false, false, true]);
  });

  it('rejects a value for is_active it cannot read', () => {
    const { errors } = parseProductsCsv('name_vi,base_price,is_active\nA,1000,có\n', {
      currency: 'VND',
    });

    expect(errors[0]).toMatchObject({ row: 2, column: 'is_active' });
  });

  it('refuses two rows that would create the same id', () => {
    const { rows, errors } = parseProductsCsv(
      'name_vi,base_price\nPhở bò,65000\nPhở bò,66000\n',
      { currency: 'VND' },
    );

    expect(rows).toHaveLength(1);
    expect(errors).toContainEqual({
      row: 3,
      column: '_id',
      message: expect.stringMatching(/pho-bo/),
    });
  });

  it('round-trips export → parse', () => {
    const parsed = parseProductsCsv(exportProductsCsv([phoBo, traDa], 'VND'), { currency: 'VND' });

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]?.variants).toEqual(phoBo.variants);
    expect(parsed.rows[0]?.basePrice).toEqual(phoBo.basePrice);
    expect(parsed.rows[1]?.name).toEqual(traDa.name);
    expect(parsed.rows[1]?.barcode).toBeNull();
  });
});

describe('importCategoriesCsv', () => {
  let adapter: DbAdapter;
  let repo: CatalogRepository;

  beforeEach(async () => {
    adapter = await createMemoryAdapter();
    repo = createCatalogRepository(adapter, () => NOW);
  });

  it('creates categories and reports their document ids', async () => {
    const summary = await importCategoriesCsv(repo, 'name_vi,sort_order\nĐồ uống,1\n');

    expect(summary.created).toEqual(['category:do-uong']);
    expect((await repo.listCategories()).map((category) => category._id)).toEqual([
      'category:do-uong',
    ]);
  });

  it('updates a category addressed by _id', async () => {
    await repo.createCategory({ id: 'drinks', name: { vi: 'Đồ uống', en: 'Drinks' }, sortOrder: 1 });
    const summary = await importCategoriesCsv(
      repo,
      '_id,name_vi,sort_order\ncategory:drinks,Thức uống,2\n',
    );

    expect(summary.updated).toEqual(['category:drinks']);
    expect((await repo.listCategories())[0]?.name.vi).toBe('Thức uống');
  });
});

describe('importProductsCsv', () => {
  let adapter: DbAdapter;
  let repo: CatalogRepository;

  beforeEach(async () => {
    adapter = await createMemoryAdapter();
    repo = createCatalogRepository(adapter, () => NOW);
  });

  it('creates products from a hand-written file', async () => {
    const summary = await importProductsCsv(repo, 'name_vi,base_price\nPhở bò,65000\n', {
      currency: 'VND',
    });

    expect(summary.created).toEqual(['product:pho-bo']);
    expect((await repo.listProducts()).map((product) => product._id)).toEqual(['product:pho-bo']);
  });

  it('updates an existing product addressed by _id and keeps its rev', async () => {
    const before = await repo.createProduct({
      id: 'pho-bo',
      name: { vi: 'Phở bò', en: 'Pho' },
      basePrice: money(65000, 'VND'),
    });

    const summary = await importProductsCsv(
      repo,
      '_id,name_vi,base_price\nproduct:pho-bo,Phở bò,72000\n',
      { currency: 'VND' },
    );

    expect(summary.updated).toEqual(['product:pho-bo']);
    const after = await repo.getProduct('pho-bo');
    expect(after?.basePrice).toEqual(money(72000, 'VND'));
    expect(after?._rev).not.toBe(before._rev);
  });

  it('writes nothing at all when any row is invalid', async () => {
    const text = 'name_vi,base_price\nPhở bò,65000\nTrà đá,65.000\n';

    await expect(importProductsCsv(repo, text, { currency: 'VND' })).rejects.toThrow(/row 3/);
    expect(await repo.listProducts()).toEqual([]); // Review Focus #1 + D7
  });

  it('names the offending row and column in the error', async () => {
    await expect(
      importProductsCsv(repo, 'name_vi,base_price\nPhở bò,không_phải_số\n', { currency: 'VND' }),
    ).rejects.toThrow(/row 2, column "base_price"/);
  });

  it('refuses an unknown category instead of silently dropping it', async () => {
    const text = 'name_vi,base_price,category_id\nPhở bò,65000,category:nope\n';

    await expect(importProductsCsv(repo, text, { currency: 'VND' })).rejects.toThrow(/category:nope/);
    expect(await repo.listProducts()).toEqual([]);
  });

  it('imports categories first, then products that reference them', async () => {
    await importCategoriesCsv(repo, exportCategoriesCsv([main]));
    const summary = await importProductsCsv(repo, exportProductsCsv([phoBo], 'VND'), {
      currency: 'VND',
    });

    expect(summary.created).toEqual(['product:pho-bo']);
    expect((await repo.listProducts())[0]?.categoryId).toBe('category:main');
  });

  it('round-trips a full menu through export and import', async () => {
    await importCategoriesCsv(repo, exportCategoriesCsv([main]));
    await importProductsCsv(repo, exportProductsCsv([phoBo, traDa], 'VND'), { currency: 'VND' });

    const exported = exportProductsCsv(await repo.listProducts(), 'VND');
    const summary = await importProductsCsv(repo, exported, { currency: 'VND' });

    expect(summary.updated).toEqual(['product:pho-bo', 'product:tra-da']);
  });
});
