import { describe, expect, test } from 'vitest';
import { computeMinimalEdit } from './monaco-edits';

/**
 * computeMinimalEdit 的契约：
 * - 返回 null 表示内容相同，调用方无需操作
 * - 返回的 range 是 1-based 行号 / 1-based 列号（Monaco 约定）
 * - 把返回的 text 应用到 range 上，结果必须严格等于 newText
 *
 * 每个用例都用 applyEdit 反向验证「应用后等于 newText」，
 * 而不是只断言 range 数值——后者会把实现细节焊死在测试里。
 */

/** 按 Monaco 语义把单个编辑操作应用到原文本，用于反向验证 */
function applyEdit(
  oldText: string,
  edit: { range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }; text: string }
): string {
  const lines = oldText.split('\n');
  const { startLineNumber, startColumn, endLineNumber, endColumn } = edit.range;

  // 起始行的保留前缀 + 结束行的保留后缀
  const before = lines.slice(0, startLineNumber - 1);
  const startLine = lines[startLineNumber - 1] ?? '';
  const endLine = lines[endLineNumber - 1] ?? '';
  const head = startLine.slice(0, startColumn - 1);
  const tail = endLine.slice(endColumn - 1);
  const after = lines.slice(endLineNumber);

  const middle = head + edit.text + tail;
  return [...before, ...middle.split('\n'), ...after].join('\n');
}

/** 断言：编辑应用后严格等于 newText */
function expectRoundTrip(oldText: string, newText: string) {
  const edit = computeMinimalEdit(oldText, newText);
  expect(edit, '内容不同时应返回编辑操作').not.toBeNull();
  expect(applyEdit(oldText, edit!)).toBe(newText);
}

describe('computeMinimalEdit', () => {
  describe('无变化', () => {
    test('内容完全相同时返回 null', () => {
      // Arrange
      const text = '{\n  "a": "x"\n}';

      // Act
      const edit = computeMinimalEdit(text, text);

      // Assert
      expect(edit).toBeNull();
    });

    test('两者都是空字符串时返回 null', () => {
      expect(computeMinimalEdit('', '')).toBeNull();
    });
  });

  describe('值变更（本次需求的主场景）', () => {
    test('仅改中间一行的 value 时，编辑范围只覆盖那一行', () => {
      // Arrange
      const oldText = '{\n  "a": "旧值",\n  "b": "x"\n}';
      const newText = '{\n  "a": "新值",\n  "b": "x"\n}';

      // Act
      const edit = computeMinimalEdit(oldText, newText);

      // Assert
      expect(edit).not.toBeNull();
      expect(edit!.range.startLineNumber).toBe(2);
      expect(edit!.range.endLineNumber).toBe(2);
      expect(applyEdit(oldText, edit!)).toBe(newText);
    });

    test('仅改首行时不波及后续行', () => {
      // Arrange
      const oldText = '"first": 1\n"second": 2\n"third": 3';
      const newText = '"FIRST": 1\n"second": 2\n"third": 3';

      // Act
      const edit = computeMinimalEdit(oldText, newText);

      // Assert
      expect(edit!.range.startLineNumber).toBe(1);
      expect(edit!.range.endLineNumber).toBe(1);
      expect(applyEdit(oldText, edit!)).toBe(newText);
    });

    test('仅改末行时不波及前面的行', () => {
      // Arrange
      const oldText = '"first": 1\n"second": 2\n"third": 3';
      const newText = '"first": 1\n"second": 2\n"THIRD": 3';

      // Act
      const edit = computeMinimalEdit(oldText, newText);

      // Assert
      expect(edit!.range.startLineNumber).toBe(3);
      expect(edit!.range.endLineNumber).toBe(3);
      expect(applyEdit(oldText, edit!)).toBe(newText);
    });

    test('多处分散变更时范围收敛到最外侧变更之间', () => {
      // Arrange — 第 2 行和第 4 行都变了
      const oldText = 'a\nB\nc\nD\ne';
      const newText = 'a\nb2\nc\nd2\ne';

      // Act
      const edit = computeMinimalEdit(oldText, newText);

      // Assert — 首行末行未变，范围应落在 2..4
      expect(edit!.range.startLineNumber).toBe(2);
      expect(edit!.range.endLineNumber).toBe(4);
      expect(applyEdit(oldText, edit!)).toBe(newText);
    });
  });

  describe('增删行（键增删场景）', () => {
    test('纯插入一行', () => {
      expectRoundTrip(
        '{\n  "a": "x"\n}',
        '{\n  "a": "x",\n  "b": ""\n}'
      );
    });

    test('纯删除一行', () => {
      expectRoundTrip(
        '{\n  "a": "x",\n  "b": ""\n}',
        '{\n  "a": "x"\n}'
      );
    });

    test('在开头插入行', () => {
      expectRoundTrip('b\nc', 'a\nb\nc');
    });

    test('在结尾插入行', () => {
      expectRoundTrip('a\nb', 'a\nb\nc');
    });

    test('删除开头的行', () => {
      expectRoundTrip('a\nb\nc', 'b\nc');
    });

    test('删除结尾的行', () => {
      expectRoundTrip('a\nb\nc', 'a\nb');
    });
  });

  describe('边界情况', () => {
    test('全文替换（无公共前后缀）', () => {
      expectRoundTrip('aaa\nbbb', 'xxx\nyyy');
    });

    test('从空字符串填充内容', () => {
      expectRoundTrip('', '{\n  "a": "x"\n}');
    });

    test('清空为空字符串', () => {
      expectRoundTrip('{\n  "a": "x"\n}', '');
    });

    test('单行文件改动', () => {
      expectRoundTrip('{}', '{"a":1}');
    });

    test('重复行不会导致前后缀重叠误判', () => {
      // Arrange — 全是相同的行，前缀扫描和后缀扫描会在中间相遇
      const oldText = 'x\nx\nx';
      const newText = 'x\nx\nx\nx';

      // Act + Assert — 若前后缀合计超出短边长度，实现必须钳制
      expectRoundTrip(oldText, newText);
    });

    test('删除到只剩重复行时同样不重叠', () => {
      expectRoundTrip('x\nx\nx\nx', 'x\nx\nx');
    });

    test('排序导致的整体重排（退化为大范围替换但仍正确）', () => {
      expectRoundTrip(
        '{\n  "z": 1,\n  "a": 2\n}',
        '{\n  "a": 2,\n  "z": 1\n}'
      );
    });

    test('只有行尾空白差异', () => {
      expectRoundTrip('a  \nb', 'a\nb');
    });

    test('尾部换行符的增减', () => {
      expectRoundTrip('a\nb', 'a\nb\n');
    });
  });

  describe('返回值结构', () => {
    test('range 使用 1-based 行列号且 startColumn 为 1', () => {
      // Arrange
      const oldText = 'a\nB\nc';
      const newText = 'a\nb\nc';

      // Act
      const edit = computeMinimalEdit(oldText, newText);

      // Assert — 整行替换：从第 2 行第 1 列开始
      expect(edit!.range.startColumn).toBe(1);
      expect(edit!.range.startLineNumber).toBeGreaterThanOrEqual(1);
    });

    test('endColumn 落在结束行的行尾（可安全用于 pushEditOperations）', () => {
      // Arrange
      const oldText = 'a\nBBBB\nc';
      const newText = 'a\nb\nc';

      // Act
      const edit = computeMinimalEdit(oldText, newText);

      // Assert — endColumn 应为原行长度 + 1（Monaco 行尾列号约定）
      const endLine = oldText.split('\n')[edit!.range.endLineNumber - 1];
      expect(edit!.range.endColumn).toBe(endLine.length + 1);
    });
  });

  describe('穷举往返验证', () => {
    // setValue 是 5 个调用点共用的原语，回归代价高。
    // 这里穷举小规模行序列的所有组合做往返验证，覆盖手写用例想不到的组合。
    test('长度 0-4 的行序列两两组合，应用编辑后均等于目标文本', () => {
      // Arrange — 用小字母表制造大量重复行，专门压前后缀重叠的边界
      const alphabet = ['a', 'b'];
      const corpus: string[] = [];
      const build = (current: string[], depth: number) => {
        if (depth === 0) {
          corpus.push(current.join('\n'));
          return;
        }
        for (const ch of alphabet) {
          build([...current, ch], depth - 1);
        }
      };
      for (let len = 0; len <= 4; len++) {
        build([], len);
      }

      // Act + Assert
      let checked = 0;
      for (const oldText of corpus) {
        for (const newText of corpus) {
          const edit = computeMinimalEdit(oldText, newText);
          if (oldText === newText) {
            expect(edit, `相同内容应返回 null: ${JSON.stringify(oldText)}`).toBeNull();
            continue;
          }
          expect(edit, `内容不同应返回编辑: ${JSON.stringify(oldText)}`).not.toBeNull();

          // range 必须落在 oldText 的合法范围内
          const oldLines = oldText.split('\n');
          expect(edit!.range.startLineNumber).toBeGreaterThanOrEqual(1);
          expect(edit!.range.endLineNumber).toBeLessThanOrEqual(oldLines.length);
          expect(edit!.range.startLineNumber).toBeLessThanOrEqual(edit!.range.endLineNumber);

          expect(
            applyEdit(oldText, edit!),
            `${JSON.stringify(oldText)} → ${JSON.stringify(newText)}`
          ).toBe(newText);
          checked++;
        }
      }

      // 确认真的跑了足够多的组合（31 个语料两两组合，减去相同项）
      expect(checked).toBeGreaterThan(900);
    });
  });
});
