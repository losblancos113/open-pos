// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import CsvPanel from '../CsvPanel.vue';
import { i18n, vuetifyLocale } from '@/i18n';
import { money } from '@/core/money';
import { createProductDoc } from '@/core/catalog/product';
import { createCategoryDoc } from '@/core/catalog/category';
import { CSV_BOM } from '@/core/catalog/csv';
import { PRODUCT_CSV_COLUMNS } from '@/core/catalog/csv-catalog';
import type { CsvRowError, ImportSummary } from '@/core/catalog/csv-catalog';

const t = i18n.global.t.bind(i18n.global);

const NOW = '2026-10-22T00:00:00.000Z';

const products = [
  createProductDoc({
    id: 'pho-bo',
    name: { vi: 'Phở bò', en: 'Beef pho' },
    basePrice: money(65000, 'VND'),
    now: NOW,
  }),
];

const categories = [createCategoryDoc({ id: 'main', name: { vi: 'Món chính', en: 'Main' }, now: NOW })];

const mounted: VueWrapper[] = [];

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.unmount();
  vi.restoreAllMocks();
});

function mountPanel(
  over: Partial<{
    importing: boolean;
    errors: readonly CsvRowError[];
    imported: { readonly kind: 'categories' | 'products'; readonly summary: ImportSummary } | null;
  }> = {},
): VueWrapper {
  const wrapper = mount(CsvPanel, {
    props: { categories, products, currency: 'VND' as const, ...over },
    global: { plugins: [i18n, vuetifyLocale] },
  });
  mounted.push(wrapper);
  return wrapper;
}

/** Đưa tệp vào `input[type=file]` rồi bắn `change` — không có API nào khác trong happy-dom. */
async function chooseFile(wrapper: VueWrapper, selector: string, text: string): Promise<void> {
  const input = wrapper.find<HTMLInputElement>(selector);
  if (!input.exists()) throw new Error(`file input not found: ${selector}`);
  const file = new File([text], 'menu.csv', { type: 'text/csv' });
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
  await input.trigger('change');
}

describe('CsvPanel', () => {
  it('renders the exported products CSV into a downloadable file', async () => {
    const blobs: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((object) => {
      blobs.push(object as Blob);
      return 'blob:mock';
    });
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const wrapper = mountPanel();
    await wrapper.find('[data-csv-export-products]').trigger('click');

    expect(blobs).toHaveLength(1);
    const text = await blobs[0]!.text();
    // Review Focus #5: thiếu BOM là Excel đọc "Phở bò" thành "Ph? b?".
    expect(text.startsWith(CSV_BOM)).toBe(true);
    expect(text.split('\r\n')[0]).toBe(`${CSV_BOM}${PRODUCT_CSV_COLUMNS.join(',')}`);
    expect(text).toContain('Phở bò');
    expect(revoke).toHaveBeenCalledWith('blob:mock');
  });

  it('emits importProducts with the file text', async () => {
    const wrapper = mountPanel();
    const text = `${CSV_BOM}name_vi,base_price\r\nPhở bò,65000\r\n`;
    await chooseFile(wrapper, '[data-import-products]', text);

    await vi.waitFor(() => {
      expect(wrapper.emitted('importProducts')).toBeDefined();
    });
    expect(wrapper.emitted('importProducts')?.[0]?.[0]).toBe(text);
  });

  it('emits importCategories with the file text', async () => {
    const wrapper = mountPanel();
    const text = `${CSV_BOM}name_vi\r\nMón chính\r\n`;
    await chooseFile(wrapper, '[data-import-categories]', text);

    await vi.waitFor(() => {
      expect(wrapper.emitted('importCategories')).toBeDefined();
    });
    expect(wrapper.emitted('importCategories')?.[0]?.[0]).toBe(text);
  });

  it('lists every row error with its line and column', async () => {
    const wrapper = mountPanel({
      errors: [{ row: 3, column: 'base_price', message: 'không phải số' }],
    });

    expect(wrapper.text()).toContain(
      t('catalog.csv.rowError', { row: 3, column: 'base_price', message: 'không phải số' }),
    );
    expect(wrapper.text()).toContain(t('catalog.csv.import.failed'));
  });

  it('does not report success when the import failed', async () => {
    const wrapper = mountPanel({
      errors: [{ row: 2, column: 'base_price', message: 'bad' }],
      imported: { kind: 'products', summary: { created: ['product:x'], updated: [] } },
    });

    expect(wrapper.text()).toContain(t('catalog.csv.import.failed'));
    expect(wrapper.text()).not.toContain(t('catalog.csv.import.done', { created: 1, updated: 0 }));
  });

  it('shows progress while an import runs', () => {
    const idle = mountPanel();
    expect(idle.find('[role="progressbar"]').exists()).toBe(false);

    const running = mountPanel({ importing: true });
    expect(running.find('[role="progressbar"]').exists()).toBe(true);
  });

  it('reports the created and updated counts of a finished import', () => {
    const wrapper = mountPanel({
      imported: {
        kind: 'products',
        summary: { created: ['product:a', 'product:b'], updated: ['product:c'] },
      },
    });

    expect(wrapper.text()).toContain(t('catalog.csv.import.done', { created: 2, updated: 1 }));
  });
});
