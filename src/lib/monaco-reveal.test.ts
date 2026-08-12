import { describe, expect, it } from 'vitest';
import { inferKeyPath, findKeyLine, computeEditorAnchor } from './monaco-reveal';

/** 构造只依赖 getLineContent 的轻量 model 桩（与 monaco-reveal 只读该方法一致） */
function mockModel(lines: string[]) {
  return {
    getLineContent: (lineNumber: number) => lines[lineNumber - 1] ?? '',
    getLineCount: () => lines.length,
  };
}

const NESTED_JSON = [
  '{',
  '  "app": {',
  '    "title": "登录",',
  '    "btn": {',
  '      "confirm": "确定"',
  '    }',
  '  },',
  '  "footer": "底部"',
  '}',
];

const SAME_SEGMENT_JSON = [
  '{',
  '  "a": {',
  '    "b": "1"',
  '  },',
  '  "c": {',
  '    "b": "2"',
  '  }',
  '}',
];

describe('inferKeyPath', () => {
  it('returns null for non-key lines', () => {
    const model = mockModel(NESTED_JSON);
    expect(inferKeyPath(model, 1)).toBeNull(); // '{'
    expect(inferKeyPath(model, 7)).toBeNull(); // '  }'
  });

  it('resolves single-level key', () => {
    const model = mockModel(NESTED_JSON);
    expect(inferKeyPath(model, 8)).toBe('footer');
  });

  it('resolves nested key path', () => {
    const model = mockModel(NESTED_JSON);
    expect(inferKeyPath(model, 3)).toBe('app.title');
    expect(inferKeyPath(model, 5)).toBe('app.btn.confirm');
  });

  it('resolves object-open key line', () => {
    const model = mockModel(NESTED_JSON);
    expect(inferKeyPath(model, 2)).toBe('app');
    expect(inferKeyPath(model, 4)).toBe('app.btn');
  });

  it('disambiguates same last segment by parent path', () => {
    const model = mockModel(SAME_SEGMENT_JSON);
    expect(inferKeyPath(model, 3)).toBe('a.b');
    expect(inferKeyPath(model, 6)).toBe('c.b');
  });

  it('skips blank lines while scanning for parents', () => {
    const model = mockModel(['{', '  "a": {', '', '    "b": "1"', '  }', '}']);
    expect(inferKeyPath(model, 4)).toBe('a.b');
  });
});

describe('findKeyLine', () => {
  it('finds top-level key line', () => {
    const model = mockModel(NESTED_JSON);
    expect(findKeyLine(model, 'footer')).toBe(8);
  });

  it('finds nested key line', () => {
    const model = mockModel(NESTED_JSON);
    expect(findKeyLine(model, 'app.title')).toBe(3);
    expect(findKeyLine(model, 'app.btn.confirm')).toBe(5);
  });

  it('disambiguates same last segment by full path', () => {
    const model = mockModel(SAME_SEGMENT_JSON);
    expect(findKeyLine(model, 'a.b')).toBe(3);
    expect(findKeyLine(model, 'c.b')).toBe(6);
  });

  it('returns null when key does not exist', () => {
    const model = mockModel(NESTED_JSON);
    expect(findKeyLine(model, 'missing')).toBeNull();
    expect(findKeyLine(model, 'app.missing')).toBeNull();
  });

  it('returns first matching line when duplicated', () => {
    const model = mockModel(['{', '  "x": "1",', '  "x": "2"', '}']);
    expect(findKeyLine(model, 'x')).toBe(2);
  });

  it('handles array leaf values (key still resolvable)', () => {
    const model = mockModel(['{', '  "list": [', '    "a",', '    "b"', '  ]', '}']);
    expect(findKeyLine(model, 'list')).toBe(2);
  });
});

describe('computeEditorAnchor', () => {
  const rect = { left: 200, top: 300, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) };

  it('adds editor rect offset and content line height', () => {
    const editor = {
      getDomNode: () => ({ getBoundingClientRect: () => rect }) as HTMLElement,
      getScrolledVisiblePosition: () => ({ top: 40, left: 15, height: 18, width: 0 }),
    };
    expect(computeEditorAnchor(editor, { lineNumber: 1, column: 1 })).toEqual({ x: 215, y: 358 });
  });

  it('falls back to editor rect when scrolled position unavailable', () => {
    const editor = {
      getDomNode: () => ({ getBoundingClientRect: () => rect }) as HTMLElement,
      getScrolledVisiblePosition: () => null,
    };
    expect(computeEditorAnchor(editor, { lineNumber: 1, column: 1 })).toEqual({ x: 200, y: 300 });
  });

  it('returns origin when dom node missing', () => {
    const editor = {
      getDomNode: () => null,
      getScrolledVisiblePosition: () => ({ top: 1, left: 1, height: 1 }),
    };
    expect(computeEditorAnchor(editor, { lineNumber: 1, column: 1 })).toEqual({ x: 0, y: 0 });
  });

  it('falls back to 14px height when line height unavailable', () => {
    const editor = {
      getDomNode: () => ({ getBoundingClientRect: () => rect }) as HTMLElement,
      getScrolledVisiblePosition: () => ({ top: 40, left: 15, height: 0 }),
    };
    expect(computeEditorAnchor(editor, { lineNumber: 1, column: 1 })).toEqual({ x: 215, y: 354 });
  });
});
