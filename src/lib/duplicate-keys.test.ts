import { describe, expect, test } from 'vitest';
import { collectKeyOccurrences, findDuplicateKeys } from './duplicate-keys';

/**
 * duplicate-keys 的契约：
 * - collectKeyOccurrences 收集「全部」键节点（叶子 + 中间层对象键）
 * - 与 JSON.parse 不同，字面重复键必须全部保留
 * - offset 指向键名的起始引号，供 model.getPositionAt 换算行号
 * - findDuplicateKeys 按「路径最后一段」分组，只返回 count > 1 的组
 * - 两个函数均返回 null 表示文本无法解析为 JSON 对象
 *
 * offset 断言一律用 text.indexOf 推导，不硬编码字符数——
 * 否则改动测试数据里的一个空格就会让断言全部失效。
 */

/** 从结果中取出全部 path，便于断言集合 */
function paths(occurrences: ReturnType<typeof collectKeyOccurrences>): string[] {
  return (occurrences ?? []).map((o) => o.path);
}

/** 按 path 查找唯一一条记录 */
function byPath(
  occurrences: ReturnType<typeof collectKeyOccurrences>,
  path: string
) {
  return (occurrences ?? []).filter((o) => o.path === path);
}

describe('collectKeyOccurrences', () => {
  test('returns null when text is not valid JSON', () => {
    // Arrange
    const text = '{ "a": ';

    // Act
    const result = collectKeyOccurrences(text);

    // Assert
    expect(result).toBeNull();
  });

  test('returns null when text is empty', () => {
    expect(collectKeyOccurrences('')).toBeNull();
  });

  test('returns null when root is an array', () => {
    // Schema 必须是对象（见 validation.ts 的 schemaObjectSchema）
    expect(collectKeyOccurrences('[1, 2, 3]')).toBeNull();
  });

  test('returns null when root is a primitive', () => {
    expect(collectKeyOccurrences('"just a string"')).toBeNull();
  });

  test('returns empty array when JSON is an empty object', () => {
    // Arrange
    const text = '{}';

    // Act
    const result = collectKeyOccurrences(text);

    // Assert
    expect(result).toEqual([]);
  });

  test('collects top-level leaf keys and marks kind as leaf', () => {
    // Arrange
    const text = '{ "title": "标题", "count": 3 }';

    // Act
    const result = collectKeyOccurrences(text);

    // Assert
    expect(paths(result)).toEqual(['title', 'count']);
    expect(result!.every((o) => o.kind === 'leaf')).toBe(true);
    expect(result!.map((o) => o.keyName)).toEqual(['title', 'count']);
  });

  test('collects intermediate object keys and marks kind as branch', () => {
    // Arrange
    const text = '{ "user": { "name": "n" } }';

    // Act
    const result = collectKeyOccurrences(text);

    // Assert — 中间层 user 与叶子 user.name 都要出现
    expect(paths(result)).toEqual(['user', 'user.name']);
    expect(byPath(result, 'user')[0].kind).toBe('branch');
    expect(byPath(result, 'user.name')[0].kind).toBe('leaf');
  });

  test('collects keys at every nesting depth', () => {
    // Arrange
    const text = '{ "a": { "b": { "c": "v" } } }';

    // Act
    const result = collectKeyOccurrences(text);

    // Assert
    expect(paths(result)).toEqual(['a', 'a.b', 'a.b.c']);
    expect(result!.map((o) => o.keyName)).toEqual(['a', 'b', 'c']);
  });

  test('treats empty object as leaf to match flattenObject behavior', () => {
    // utils.ts:22-23 把空对象当叶子值（''），此处保持一致
    // Arrange
    const text = '{ "empty": {} }';

    // Act
    const result = collectKeyOccurrences(text);

    // Assert
    expect(paths(result)).toEqual(['empty']);
    expect(byPath(result, 'empty')[0].kind).toBe('leaf');
  });

  test('treats array value as leaf and does not recurse into elements', () => {
    // 项目约束 5：flattenObject 遇数组原样保留为叶子值
    // Arrange
    const text = '{ "items": [{ "nested": 1 }] }';

    // Act
    const result = collectKeyOccurrences(text);

    // Assert — nested 不应出现
    expect(paths(result)).toEqual(['items']);
    expect(byPath(result, 'items')[0].kind).toBe('leaf');
  });

  test('preserves every occurrence of a literal duplicate key that JSON.parse would discard', () => {
    // Arrange
    const text = '{ "a": 1, "a": 2 }';

    // Assert 前置事实：JSON.parse 只保留最后一个
    expect(Object.keys(JSON.parse(text))).toEqual(['a']);

    // Act
    const result = collectKeyOccurrences(text);

    // Assert — AST 层能看见两次
    expect(paths(result)).toEqual(['a', 'a']);
    expect(result![0].offset).not.toBe(result![1].offset);
  });

  test('offset points at the opening quote of the key name', () => {
    // Arrange
    const text = '{\n  "alpha": 1,\n  "beta": 2\n}';

    // Act
    const result = collectKeyOccurrences(text);

    // Assert — 用 indexOf 推导期望值，不硬编码字符数
    expect(byPath(result, 'alpha')[0].offset).toBe(text.indexOf('"alpha"'));
    expect(byPath(result, 'beta')[0].offset).toBe(text.indexOf('"beta"'));
  });

  test('offset of a nested key points at that key not its parent', () => {
    // Arrange
    const text = '{\n  "outer": {\n    "inner": 1\n  }\n}';

    // Act
    const result = collectKeyOccurrences(text);

    // Assert
    expect(byPath(result, 'outer')[0].offset).toBe(text.indexOf('"outer"'));
    expect(byPath(result, 'outer.inner')[0].offset).toBe(text.indexOf('"inner"'));
  });

  test('tolerates trailing commas and comments as jsonc', () => {
    // jsonc-parser 容错解析：Monaco 里用户中途编辑常出现尾逗号
    // Arrange
    const text = '{ "a": 1, }';

    // Act
    const result = collectKeyOccurrences(text);

    // Assert — 不应因尾逗号整体失败
    expect(paths(result)).toEqual(['a']);
  });
});

describe('findDuplicateKeys', () => {
  test('returns null when text is not valid JSON', () => {
    expect(findDuplicateKeys('{ "a": ')).toBeNull();
  });

  test('returns empty array when no key name repeats', () => {
    // Arrange
    const text = '{ "a": 1, "b": { "c": 2 } }';

    // Act
    const result = findDuplicateKeys(text);

    // Assert
    expect(result).toEqual([]);
  });

  test('groups same-named keys living at different paths', () => {
    // Arrange — user.name 与 admin.name 键名同为 name
    const text = '{ "user": { "name": 1 }, "admin": { "name": 2 } }';

    // Act
    const result = findDuplicateKeys(text);

    // Assert
    expect(result).toHaveLength(1);
    expect(result![0].keyName).toBe('name');
    expect(result![0].count).toBe(2);
    expect(result![0].occurrences.map((o) => o.path)).toEqual([
      'user.name',
      'admin.name',
    ]);
  });

  test('includes intermediate object keys alongside leaf keys', () => {
    // 决策 1：中间层对象键也纳入检测
    // Arrange — profile 是中间层且出现两次
    const text =
      '{ "user": { "profile": { "a": 1 } }, "admin": { "profile": { "b": 2 } } }';

    // Act
    const result = findDuplicateKeys(text);

    // Assert
    expect(result!.map((g) => g.keyName)).toEqual(['profile']);
    expect(result![0].occurrences.every((o) => o.kind === 'branch')).toBe(true);
  });

  test('groups a leaf key together with a same-named branch key', () => {
    // 同名但一个是叶子一个是分组，仍属同一组（规则只看键名）
    // Arrange
    const text = '{ "x": { "dup": 1 }, "dup": { "y": 2 } }';

    // Act
    const result = findDuplicateKeys(text);

    // Assert
    expect(result).toHaveLength(1);
    expect(result![0].keyName).toBe('dup');
    expect(result![0].occurrences.map((o) => o.kind).sort()).toEqual([
      'branch',
      'leaf',
    ]);
  });

  test('excludes keys that appear only once', () => {
    // Arrange
    const text = '{ "solo": 1, "a": { "dup": 1 }, "b": { "dup": 2 } }';

    // Act
    const result = findDuplicateKeys(text);

    // Assert
    expect(result!.map((g) => g.keyName)).toEqual(['dup']);
  });

  test('sorts groups by occurrence count descending', () => {
    // Arrange — twice 出现 2 次，thrice 出现 3 次
    const text = `{
      "a": { "thrice": 1, "twice": 1 },
      "b": { "thrice": 1, "twice": 1 },
      "c": { "thrice": 1 }
    }`;

    // Act
    const result = findDuplicateKeys(text);

    // Assert
    expect(result!.map((g) => [g.keyName, g.count])).toEqual([
      ['thrice', 3],
      ['twice', 2],
    ]);
  });

  test('sorts groups with equal counts by key name for stable output', () => {
    // Arrange — zeta 与 alpha 都出现 2 次
    const text = '{ "a": { "zeta": 1, "alpha": 1 }, "b": { "zeta": 1, "alpha": 1 } }';

    // Act
    const result = findDuplicateKeys(text);

    // Assert — 字典序，alpha 在前
    expect(result!.map((g) => g.keyName)).toEqual(['alpha', 'zeta']);
  });

  test('reports a literal duplicate key as a group of two', () => {
    // 让 §3.1 那条静默丢数据的路径首次可见
    // Arrange
    const text = '{ "a": 1, "a": 2 }';

    // Act
    const result = findDuplicateKeys(text);

    // Assert
    expect(result).toHaveLength(1);
    expect(result![0].count).toBe(2);
    expect(result![0].occurrences.map((o) => o.path)).toEqual(['a', 'a']);
  });

  test('does not confuse a key containing a dot with a nested path', () => {
    // 字面键 "a.b" 的键名是 "a.b" 整体，与嵌套 a→b 的键名 "b" 不同组
    // Arrange
    const text = '{ "a.b": 1, "a": { "b": 2 } }';

    // Act
    const result = findDuplicateKeys(text);

    // Assert — 键名分别是 "a.b" 与 "b"，各出现一次，无重复
    expect(result).toEqual([]);
  });

  test('preserves document order of occurrences within a group', () => {
    // Drawer 子行按文档顺序展示，跳转才符合直觉
    // Arrange
    const text = '{ "z": { "k": 1 }, "a": { "k": 2 }, "m": { "k": 3 } }';

    // Act
    const result = findDuplicateKeys(text);

    // Assert
    expect(result![0].occurrences.map((o) => o.path)).toEqual([
      'z.k',
      'a.k',
      'm.k',
    ]);
  });
});
