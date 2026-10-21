import { describe, it, expect } from 'vitest';
import type { FieldDefinition, TypeDefinition } from '../definition';
import { buildFormModel, buildListModel, computeFormulaFields } from '../read-model';
import { money } from '../../money';

const def: TypeDefinition = {
  key: 'product',
  kind: 'builtin_ext',
  baseType: 'product',
  name: { vi: 'Sản phẩm', en: 'Product' },
  version: 1,
  listView: ['name', 'price', 'cost'],
  fields: [
    { key: 'name', label: { vi: 'Tên', en: 'Name' }, dataType: 'text', required: true },
    { key: 'price', label: { vi: 'Giá', en: 'Price' }, dataType: 'money', required: true },
    {
      key: 'cost',
      label: { vi: 'Vốn', en: 'Cost' },
      dataType: 'formula',
      required: false,
      formula: 'price * 0.6',
    },
  ],
};

function withFields(fields: readonly FieldDefinition[], listView?: readonly string[]): TypeDefinition {
  return { ...def, fields, listView: listView ?? fields.map((f) => f.key) };
}

describe('computeFormulaFields', () => {
  it('computes a money formula without storing it', () => {
    expect(computeFormulaFields(def, { price: money(100000, 'VND') })).toEqual({
      cost: money(60000, 'VND'),
    });
  });

  it('returns null for a formula whose dependency is missing', () => {
    expect(computeFormulaFields(def, {})).toEqual({ cost: null });
  });

  it('chains formula fields', () => {
    const chained = withFields([
      ...def.fields,
      {
        key: 'double_cost',
        label: { vi: 'x2', en: 'x2' },
        dataType: 'formula',
        required: false,
        formula: 'cost * 2',
      },
    ]);
    expect(computeFormulaFields(chained, { price: money(100000, 'VND') })).toEqual({
      cost: money(60000, 'VND'),
      double_cost: money(120000, 'VND'),
    });
  });

  it('computes a chain even when the fields are declared in reverse order', () => {
    const reversed = withFields([
      {
        key: 'double_cost',
        label: { vi: 'x2', en: 'x2' },
        dataType: 'formula',
        required: false,
        formula: 'cost * 2',
      },
      ...def.fields,
    ]);
    expect(computeFormulaFields(reversed, { price: money(100000, 'VND') })).toEqual({
      cost: money(60000, 'VND'),
      double_cost: money(120000, 'VND'),
    });
  });

  it('does not mutate the input record', () => {
    const record = { price: money(100000, 'VND') };
    computeFormulaFields(def, record);
    expect(record).toEqual({ price: money(100000, 'VND') });
  });

  it('leaves non-formula fields out of the result', () => {
    expect(Object.keys(computeFormulaFields(def, { name: 'Phở', price: money(100000, 'VND') }))).toEqual(
      ['cost'],
    );
  });

  it('returns null instead of throwing when the formula is invalid', () => {
    const broken = withFields([
      { key: 'price', label: { vi: 'Giá', en: 'Price' }, dataType: 'money', required: true },
      {
        key: 'cost',
        label: { vi: 'Vốn', en: 'Cost' },
        dataType: 'formula',
        required: false,
        formula: 'price *',
      },
    ]);
    expect(() => computeFormulaFields(broken, { price: money(100000, 'VND') })).not.toThrow();
    expect(computeFormulaFields(broken, { price: money(100000, 'VND') })).toEqual({ cost: null });
  });

  it('returns null when the formula divides by zero', () => {
    const broken = withFields([
      { key: 'price', label: { vi: 'Giá', en: 'Price' }, dataType: 'money', required: true },
      {
        key: 'cost',
        label: { vi: 'Vốn', en: 'Cost' },
        dataType: 'formula',
        required: false,
        formula: 'price / 0',
      },
    ]);
    expect(computeFormulaFields(broken, { price: money(100000, 'VND') })).toEqual({ cost: null });
  });

  it('returns null when a dependency cannot participate in formulas', () => {
    const textDep = withFields([
      { key: 'name', label: { vi: 'Tên', en: 'Name' }, dataType: 'text', required: true },
      {
        key: 'cost',
        label: { vi: 'Vốn', en: 'Cost' },
        dataType: 'formula',
        required: false,
        formula: 'name * 2',
      },
    ]);
    expect(computeFormulaFields(textDep, { name: 'Phở' })).toEqual({ cost: null });
  });
});

describe('buildFormModel', () => {
  it('marks formula fields as computed and readonly', () => {
    const model = buildFormModel(def, { name: 'Phở', price: money(100000, 'VND') });
    const cost = model.fields.find((f) => f.field.key === 'cost');
    expect(cost).toMatchObject({ computed: true, value: money(60000, 'VND') });
  });

  it('marks plain fields as not computed', () => {
    const model = buildFormModel(def, {});
    expect(model.fields.find((f) => f.field.key === 'name')!.computed).toBe(false);
  });

  it('carries the type key and version', () => {
    const model = buildFormModel(def, {});
    expect(model.typeKey).toBe('product');
    expect(model.version).toBe(1);
  });

  it('assigns the default widget from the field registry', () => {
    const model = buildFormModel(def, {});
    expect(model.fields.find((f) => f.field.key === 'name')!.widget).toBe('text');
  });

  it('lets a field override the widget through ui.widget', () => {
    const custom = withFields([
      {
        key: 'name',
        label: { vi: 'Tên', en: 'Name' },
        dataType: 'text',
        required: true,
        ui: { widget: 'rich-text' },
      },
    ]);
    expect(buildFormModel(custom, {}).fields[0]!.widget).toBe('rich-text');
  });

  it('falls back to the field default value when the record has none', () => {
    const withDefault = withFields([
      {
        key: 'name',
        label: { vi: 'Tên', en: 'Name' },
        dataType: 'text',
        required: true,
        defaultValue: 'Chưa đặt tên',
      },
    ]);
    expect(buildFormModel(withDefault, {}).values).toEqual({ name: 'Chưa đặt tên' });
  });

  it('keeps the record value when there is one', () => {
    const model = buildFormModel(def, { name: 'Phở' });
    expect(model.values.name).toBe('Phở');
  });

  it('exposes the computed values in the values map', () => {
    const model = buildFormModel(def, { name: 'Phở', price: money(100000, 'VND') });
    expect(model.values.cost).toEqual(money(60000, 'VND'));
  });

  it('reports a validation error for a required field that is empty', () => {
    const model = buildFormModel(def, { price: money(100000, 'VND') });
    expect(model.fields.find((f) => f.field.key === 'name')!.error).toMatch(/required/i);
  });

  it('leaves error null for a field that validates', () => {
    const model = buildFormModel(def, { name: 'Phở', price: money(100000, 'VND') });
    expect(model.fields.find((f) => f.field.key === 'name')!.error).toBeNull();
  });

  it('records why a formula could not be computed', () => {
    const model = buildFormModel(def, { name: 'Phở' });
    const cost = model.fields.find((f) => f.field.key === 'cost')!;
    expect(cost.value).toBeNull();
    expect(cost.error).toMatch(/price/i);
  });

  it('does not mutate the input record', () => {
    const record = { name: 'Phở', price: money(100000, 'VND') };
    buildFormModel(def, record);
    expect(record).toEqual({ name: 'Phở', price: money(100000, 'VND') });
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

  it('formats a text cell as-is', () => {
    const cells = buildListModel(def, { name: 'Phở', price: money(1000, 'VND') }, 'vi');
    expect(cells[0]!.text).toBe('Phở');
  });

  it('does not mutate the input record', () => {
    const record = { name: 'Phở', price: money(100000, 'VND') };
    buildListModel(def, record, 'vi');
    expect(record).toEqual({ name: 'Phở', price: money(100000, 'VND') });
  });
});
