import { describe, expect, it } from 'vitest';
import {
  flattenObject,
  unflattenObject,
  setNestedValue,
  getLeafPaths,
  createNestedFromPaths,
  findMissingPaths,
  emptyTranslationsFromSchema,
  hasNestedPath,
  deepClone,
  deepMergeTemplate,
  keyExists,
} from './utils';

describe('flattenObject', () => {
  it('flattens simple nested object', () => {
    const input = { emp: { name: '张三' } };
    expect(flattenObject(input)).toEqual({ 'emp.name': '张三' });
  });

  it('flattens multiple levels', () => {
    const input = { a: { b: { c: 'deep' } } };
    expect(flattenObject(input)).toEqual({ 'a.b.c': 'deep' });
  });

  it('handles multiple keys at same level', () => {
    const input = { a: { x: '1', y: '2' }, b: '3' };
    expect(flattenObject(input)).toEqual({ 'a.x': '1', 'a.y': '2', b: '3' });
  });

  it('handles empty nested object', () => {
    const input = { yiku: {} };
    expect(flattenObject(input)).toEqual({ yiku: '' });
  });

  it('handles empty root object', () => {
    expect(flattenObject({})).toEqual({});
  });

  it('throws on array values', () => {
    const input = { list: [1, 2, 3] };
    expect(() => flattenObject(input)).toThrow('不支持数组类型');
  });

  it('handles null values', () => {
    const input = { key: null };
    expect(flattenObject(input)).toEqual({ key: null });
  });

  it('handles boolean values', () => {
    const input = { flag: true };
    expect(flattenObject(input)).toEqual({ flag: true });
  });

  it('handles numeric values', () => {
    const input = { count: 42, ratio: 3.14 };
    expect(flattenObject(input)).toEqual({ count: 42, ratio: 3.14 });
  });

  it('handles mixed deep nesting', () => {
    const input = { app: { login: { title: '登录', btn: '确定' }, theme: 'dark' }, lang: 'zh-CN' };
    expect(flattenObject(input)).toEqual({
      'app.login.title': '登录',
      'app.login.btn': '确定',
      'app.theme': 'dark',
      lang: 'zh-CN',
    });
  });
});

describe('unflattenObject', () => {
  it('restores simple flat object', () => {
    const input = { 'emp.name': '张三' };
    expect(unflattenObject(input)).toEqual({ emp: { name: '张三' } });
  });

  it('restores multiple levels', () => {
    const input = { 'a.b.c': 'deep' };
    expect(unflattenObject(input)).toEqual({ a: { b: { c: 'deep' } } });
  });

  it('handles empty object', () => {
    expect(unflattenObject({})).toEqual({});
  });

  it('handles top-level keys mixed with nested', () => {
    const input = { 'a.x': '1', 'a.y': '2', b: '3' };
    expect(unflattenObject(input)).toEqual({ a: { x: '1', y: '2' }, b: '3' });
  });

  it('handles empty string value for flattened empty object', () => {
    const input = { yiku: '' };
    expect(unflattenObject(input)).toEqual({ yiku: '' });
  });

  it('round-trips with flattenObject', () => {
    const original = { app: { login: { title: '登录' }, theme: 'dark' }, lang: 'zh-CN' };
    const flat = flattenObject(original);
    expect(unflattenObject(flat)).toEqual(original);
  });
});

describe('setNestedValue', () => {
  it('sets value at nested path', () => {
    const obj = {};
    setNestedValue(obj, 'a.b.c', 'value');
    expect(obj).toEqual({ a: { b: { c: 'value' } } });
  });

  it('overwrites leaf with nested object on conflict', () => {
    const obj = { a: 'string' };
    setNestedValue(obj, 'a.b', 'value');
    expect(obj).toEqual({ a: { b: 'value' } });
  });

  it('sets value at top-level path', () => {
    const obj = {};
    setNestedValue(obj, 'key', 'val');
    expect(obj).toEqual({ key: 'val' });
  });
});

describe('getLeafPaths', () => {
  it('returns paths for nested object', () => {
    const input = { a: { b: 'val', c: { d: 'deep' } }, e: 'leaf' };
    expect(getLeafPaths(input)).toEqual(['a.b', 'a.c.d', 'e']);
  });

  it('handles empty nested object as leaf', () => {
    const input = { empty: {} };
    expect(getLeafPaths(input)).toEqual(['empty']);
  });

  it('handles empty root object', () => {
    expect(getLeafPaths({})).toEqual([]);
  });
});

describe('createNestedFromPaths', () => {
  it('creates nested object from paths', () => {
    const paths = ['a.b', 'a.c', 'd'];
    expect(createNestedFromPaths(paths)).toEqual({ a: { b: '', c: '' }, d: '' });
  });

  it('handles empty array', () => {
    expect(createNestedFromPaths([])).toEqual({});
  });
});

describe('findMissingPaths', () => {
  it('finds keys in new but not in old', () => {
    const oldObj = { a: { b: '' } };
    const newObj = { a: { b: '', c: '' } };
    expect(findMissingPaths(oldObj, newObj)).toEqual(['a.c']);
  });

  it('returns empty when both match', () => {
    const obj = { a: { b: '' } };
    expect(findMissingPaths(obj, obj)).toEqual([]);
  });

  it('handles nested new branches', () => {
    const oldObj = {};
    const newObj = { a: { b: { c: '' } } };
    expect(findMissingPaths(oldObj, newObj)).toEqual(['a.b.c']);
  });

  it('handles empty objects', () => {
    expect(findMissingPaths({}, {})).toEqual([]);
  });
});

describe('emptyTranslationsFromSchema', () => {
  it('creates empty translation from flat schema', () => {
    const schema = { key1: 'desc1', key2: 'desc2' };
    expect(emptyTranslationsFromSchema(schema)).toEqual({ key1: '', key2: '' });
  });

  it('creates empty translation from nested schema', () => {
    const schema = { a: { b: 'desc' } };
    expect(emptyTranslationsFromSchema(schema)).toEqual({ a: { b: '' } });
  });

  it('handles empty schema', () => {
    expect(emptyTranslationsFromSchema({})).toEqual({});
  });
});

describe('hasNestedPath', () => {
  it('returns true for existing path', () => {
    expect(hasNestedPath({ a: { b: 'val' } }, 'a.b')).toBe(true);
  });

  it('returns false for non-existing path', () => {
    expect(hasNestedPath({ a: { b: 'val' } }, 'a.c')).toBe(false);
  });

  it('returns false for path beyond depth', () => {
    expect(hasNestedPath({ a: 'leaf' }, 'a.b')).toBe(false);
  });

  it('returns false for empty object', () => {
    expect(hasNestedPath({}, 'a')).toBe(false);
  });
});

describe('deepClone', () => {
  it('creates a deep copy', () => {
    const original = { a: { b: 'val' } };
    const cloned = deepClone(original);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
    expect(cloned.a).not.toBe(original.a);
  });

  it('handles null', () => {
    expect(deepClone(null)).toBeNull();
  });

  it('handles arrays', () => {
    expect(deepClone([1, [2, 3]])).toEqual([1, [2, 3]]);
  });
});

describe('deepMergeTemplate', () => {
  it('fills missing keys from source', () => {
    const target = { a: 'existing' };
    const source = { a: 'existing', b: 'new' };
    expect(deepMergeTemplate(target, source)).toEqual({ a: 'existing', b: 'new' });
  });

  it('preserves target values over source', () => {
    const target = { a: 'kept' };
    const source = { a: 'overwrite' };
    expect(deepMergeTemplate(target, source)).toEqual({ a: 'kept' });
  });

  it('overwrites target leaf with source nested structure', () => {
    const target = { a: 'string' };
    const source = { a: { b: '' } };
    expect(deepMergeTemplate(target, source)).toEqual({ a: { b: '' } });
  });

  it('merges nested objects', () => {
    const target = { a: { b: 'kept', c: 'kept' } };
    const source = { a: { b: 'kept', d: 'new' } };
    expect(deepMergeTemplate(target, source)).toEqual({ a: { b: 'kept', c: 'kept', d: 'new' } });
  });

  it('handles empty source', () => {
    const target = { a: 'val' };
    expect(deepMergeTemplate(target, {})).toEqual({ a: 'val' });
  });

  it('handles empty target', () => {
    const source = { a: { b: '' } };
    expect(deepMergeTemplate({}, source)).toEqual({ a: { b: '' } });
  });
});

describe('keyExists', () => {
  it('returns true when key exists', () => {
    expect(keyExists({ a: 'val' }, 'a')).toBe(true);
  });

  it('returns false when key does not exist', () => {
    expect(keyExists({ a: 'val' }, 'b')).toBe(false);
  });
});
