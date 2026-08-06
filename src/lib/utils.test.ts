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
  determineInsertionPath,
  buildInsertEdit,
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

describe('determineInsertionPath', () => {
  const SAMPLE_JSON = [
    '{',
    '  "settings": {',
    '    "theme": "dark",',
    '    "editor": {',
    '      "fontSize": 14,',
    '      "tabSize": 2',
    '    },',
    '    "language": "zh"',
    '  },',
    '  "users": {',
    '    "admin": "admin@example.com"',
    '  }',
    '}',
  ].join('\n');

  it('returns root path when cursor is on top-level opening brace', () => {
    expect(determineInsertionPath(SAMPLE_JSON, 0)).toEqual([]);
  });

  it('returns path to parent object when cursor is on key-value line at root level', () => {
    // Cursor on `"settings": {` → path should include "settings" (key opens object)
    const result = determineInsertionPath(SAMPLE_JSON, 1);
    expect(result).toEqual(['settings']);
  });

  it('returns path to settings when cursor is on a key inside settings', () => {
    // Cursor on `"theme": "dark"` → inside "settings"
    expect(determineInsertionPath(SAMPLE_JSON, 2)).toEqual(['settings']);
  });

  it('returns path to editor when cursor is on "editor": {', () => {
    // Cursor on `"editor": {` → inside "editor"
    expect(determineInsertionPath(SAMPLE_JSON, 3)).toEqual(['settings', 'editor']);
  });

  it('returns path to editor when cursor is on a key inside editor', () => {
    // Cursor on `"fontSize": 14` → inside "settings" → "editor"
    expect(determineInsertionPath(SAMPLE_JSON, 4)).toEqual(['settings', 'editor']);
  });

  it('returns path to editor when cursor is on closing brace of editor', () => {
    // Cursor on `    },` (closing editor) → inside "editor" (the object being closed)
    expect(determineInsertionPath(SAMPLE_JSON, 6)).toEqual(['settings', 'editor']);
  });

  it('returns path to settings when cursor is on language key', () => {
    // Cursor on `"language": "zh"` → inside "settings"
    expect(determineInsertionPath(SAMPLE_JSON, 7)).toEqual(['settings']);
  });

  it('returns path to settings when cursor is on closing brace of settings', () => {
    // Cursor on `  },` (closing settings) → inside "settings" (the object being closed)
    expect(determineInsertionPath(SAMPLE_JSON, 8)).toEqual(['settings']);
  });

  it('returns path to users when cursor is on "users": {', () => {
    // Cursor on `"users": {` → inside "users"
    expect(determineInsertionPath(SAMPLE_JSON, 9)).toEqual(['users']);
  });

  it('returns path to users when cursor is on a key inside users', () => {
    // Cursor on `"admin": "admin@example.com"` → inside "users"
    expect(determineInsertionPath(SAMPLE_JSON, 10)).toEqual(['users']);
  });

  it('returns path to users when cursor is on closing brace of users', () => {
    // Cursor on `  }` (closing users) → inside "users" (the object being closed)
    expect(determineInsertionPath(SAMPLE_JSON, 11)).toEqual(['users']);
  });

  it('returns root path when cursor is on final root closing brace', () => {
    // Cursor on `}` (root) → root
    expect(determineInsertionPath(SAMPLE_JSON, 12)).toEqual([]);
  });

  it('handles empty JSON object', () => {
    expect(determineInsertionPath('{}', 0)).toEqual([]);
  });

  it('handles single-level JSON', () => {
    const json = ['{', '  "key": "value"', '}'].join('\n');
    expect(determineInsertionPath(json, 0)).toEqual([]);
    expect(determineInsertionPath(json, 1)).toEqual([]);
    expect(determineInsertionPath(json, 2)).toEqual([]);
  });

  it('handles deeply nested object', () => {
    const json = [
      '{',
      '  "a": {',
      '    "b": {',
      '      "c": "deep"',
      '    }',
      '    "d": "val"',
      '  }',
      '}',
    ].join('\n');

    // Cursor on "c": "deep" → path ["a", "b"]
    expect(determineInsertionPath(json, 3)).toEqual(['a', 'b']);

    // Cursor on } closing b → path ["a", "b"] (the object being closed)
    expect(determineInsertionPath(json, 4)).toEqual(['a', 'b']);

    // Cursor on "d": "val" → path ["a"]
    expect(determineInsertionPath(json, 5)).toEqual(['a']);
  });

  it('handles cursor beyond file length gracefully', () => {
    const json = '{ "key": "val" }';
    // cursorLine beyond file length → returns empty array
    expect(determineInsertionPath(json, 99)).toEqual([]);
  });

  it('handles cursor at negative line number (clamped)', () => {
    const json = '{ "key": "val" }';
    expect(determineInsertionPath(json, -1)).toEqual([]);
  });

  it('handles object with inline opening brace on same line as key', () => {
    const json = [
      '{',
      '  "nested": { "inline": "val", "another": "val2" },',
      '  "next": "value"',
      '}',
    ].join('\n');

    // Cursor on the inline object line → path includes "nested" (key opens object)
    expect(determineInsertionPath(json, 1)).toEqual(['nested']);
  });

  it('returns path to the object being closed when cursor is on nested closing brace', () => {
    // Bug: cursor on inner `}` of settings → path should be ["settings"], not []
    const json = [
      '{',
      '  "settings": {',
      '    "theme": "dark"',
      '  }',
      '}',
    ].join('\n');
    // Cursor on inner `}` (line 3, 0-based) → should return ["settings"]
    expect(determineInsertionPath(json, 3)).toEqual(['settings']);
    // Cursor on outer `}` (line 4) → should return []
    expect(determineInsertionPath(json, 4)).toEqual([]);
  });
});

describe('buildInsertEdit', () => {
  it('inserts after opening brace with increased indent', () => {
    const result = buildInsertEdit('  "settings": {', '  ', 'new_key');
    expect(result.insertAtStart).toBe(false);
    expect(result.text).toBe('\n    "new_key": ""');
  });

  it('inserts after standalone opening brace with increased indent', () => {
    const result = buildInsertEdit('{', '', 'new_key');
    expect(result.insertAtStart).toBe(false);
    expect(result.text).toBe('\n  "new_key": ""');
  });

  it('inserts before closing brace with increased indent (inside object)', () => {
    // New behavior: insert `,\n` at end of previous line, then key with increased indent
    const result = buildInsertEdit('  }', '  ', 'new_key');
    expect(result.insertAtStart).toBe(true);
    expect(result.text).toBe(',\n    "new_key": ""');
  });

  it('inserts before closing brace with trailing comma and increased indent', () => {
    const result = buildInsertEdit('  },', '  ', 'new_key');
    expect(result.insertAtStart).toBe(true);
    expect(result.text).toBe(',\n    "new_key": ""');
  });

  it('inserts before root-level closing brace with 2-space indent', () => {
    // Bug: `}` at root → insert `,\n` at end of previous line, key indented by 2
    const result = buildInsertEdit('}', '', 'new_key');
    expect(result.insertAtStart).toBe(true);
    expect(result.text).toBe(',\n  "new_key": ""');
  });

  it('inserts after comma line with trailing comma (more entries follow)', () => {
    const result = buildInsertEdit('  "key": "val",', '  ', 'new_key');
    expect(result.insertAtStart).toBe(false);
    expect(result.text).toBe('\n  "new_key": "",');
  });

  it('inserts after comma line with numeric key name', () => {
    // Bug: "new_key_73": "", → new key "new_key_74" must have trailing comma
    const result = buildInsertEdit('  "new_key_73": "",', '  ', 'new_key_74');
    expect(result.insertAtStart).toBe(false);
    expect(result.text).toBe('\n  "new_key_74": "",');
  });

  it('inserts inside empty inline object {}', () => {
    // Bug: cursor on `{}` → key must go between { and }
    const result = buildInsertEdit('{}', '', 'new_key');
    expect(result.column).toBe(2);
    expect(result.text).toBe('\n  "new_key": ""');
  });

  it('inserts inside inline empty object with trailing comma', () => {
    // Bug: cursor on `{` in `"new_key_30": {},` → insert between { and }
    const result = buildInsertEdit('  "new_key_30": {},', '  ', 'new_key');
    expect(result.column).toBe(18);
    expect(result.text).toBe('\n    "new_key": ""');
  });

  it('inserts inside empty inline object with indent', () => {
    const result = buildInsertEdit('  {}', '  ', 'new_key');
    expect(result.column).toBe(4);
    expect(result.text).toBe('\n    "new_key": ""');
  });

  it('inserts after key-value line with comma and newline', () => {
    const result = buildInsertEdit('  "key": "val"', '  ', 'new_key');
    expect(result.insertAtStart).toBe(false);
    expect(result.text).toBe(',\n  "new_key": ""');
  });

  it('handles root-level opening brace', () => {
    const result = buildInsertEdit('{', '', 'new_key');
    expect(result.text).toContain('"new_key"');
  });

  it('inserts after opening brace with comma when target has existing keys', () => {
    const result = buildInsertEdit('  "settings": {', '  ', 'new_key', true);
    expect(result.insertAtStart).toBe(false);
    expect(result.text).toBe('\n    "new_key": "",');
  });

  it('inserts after opening brace without comma when target is empty', () => {
    const result = buildInsertEdit('  "settings": {', '  ', 'new_key', false);
    expect(result.insertAtStart).toBe(false);
    expect(result.text).toBe('\n    "new_key": ""');
  });

  it('inserts after standalone opening brace with comma when target has keys', () => {
    const result = buildInsertEdit('{', '', 'new_key', true);
    expect(result.text).toBe('\n  "new_key": "",');
  });

  it('handles root-level closing brace', () => {
    const result = buildInsertEdit('}', '', 'new_key');
    expect(result.insertAtStart).toBe(true);
    expect(result.text).toContain('"new_key"');
  });

  it('preserves the generated key name in output text', () => {
    const result = buildInsertEdit('  "theme": "dark",', '  ', 'custom_key_42');
    expect(result.text).toContain('"custom_key_42"');
  });
});
