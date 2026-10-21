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

  it('reports nothing for a transform that changed nothing', () => {
    const { data, applied } = applyTransforms({ name: 'Phở' }, [
      { kind: 'rename', from: 'ghost', to: 'spirit' },
      { kind: 'removeField', field: 'ghost' },
      { kind: 'addDefault', field: 'name', value: 'X' },
    ]);
    expect(data).toEqual({ name: 'Phở' });
    expect(applied).toEqual([]);
  });

  it('rejects an unknown transform kind', () => {
    try {
      applyTransforms({ a: 1 }, [{ kind: 'evalCode', source: 'while(true){}' } as never]);
      throw new Error('expected applyTransforms to throw');
    } catch (error) {
      expect((error as MigrationError).code).toBe('unknown_transform');
    }
  });
});
