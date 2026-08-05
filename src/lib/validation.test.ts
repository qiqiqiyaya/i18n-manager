import { describe, expect, it } from 'vitest';
import {
  createProjectSchema,
  updateProjectSchema,
  langSchema,
  schemaObjectSchema,
  translationObjectSchema,
  importStrategySchema,
  exportLanguagesSchema,
  searchKeywordSchema,
} from './validation';

describe('createProjectSchema', () => {
  it('accepts valid input', () => {
    const result = createProjectSchema.safeParse({ title: 'My Project', description: 'A test project' });
    expect(result.success).toBe(true);
  });

  it('accepts input without description', () => {
    const result = createProjectSchema.safeParse({ title: 'My Project' });
    expect(result.success).toBe(true);
  });

  it('rejects empty title', () => {
    const result = createProjectSchema.safeParse({ title: '' });
    expect(result.success).toBe(false);
  });

  it('rejects title exceeding 50 chars', () => {
    const result = createProjectSchema.safeParse({ title: 'a'.repeat(51) });
    expect(result.success).toBe(false);
  });

  it('rejects missing title', () => {
    const result = createProjectSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects description exceeding 200 chars', () => {
    const result = createProjectSchema.safeParse({ title: 'P', description: 'd'.repeat(201) });
    expect(result.success).toBe(false);
  });
});

describe('updateProjectSchema', () => {
  it('accepts partial update with title only', () => {
    const result = updateProjectSchema.safeParse({ title: 'Updated' });
    expect(result.success).toBe(true);
  });

  it('accepts empty object', () => {
    const result = updateProjectSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('langSchema', () => {
  it('accepts valid language codes', () => {
    expect(langSchema.safeParse('zh-CN').success).toBe(true);
    expect(langSchema.safeParse('en-US').success).toBe(true);
    expect(langSchema.safeParse('ja_JP').success).toBe(true);
    expect(langSchema.safeParse('zh_Hans_CN').success).toBe(true);
  });

  it('rejects invalid characters', () => {
    expect(langSchema.safeParse('zh CN').success).toBe(false);
    expect(langSchema.safeParse('zh.CN').success).toBe(false);
  });

  it('rejects too short codes', () => {
    expect(langSchema.safeParse('a').success).toBe(false);
  });

  it('rejects too long codes', () => {
    expect(langSchema.safeParse('a'.repeat(21)).success).toBe(false);
  });
});

describe('schemaObjectSchema', () => {
  it('accepts a valid nested object', () => {
    const result = schemaObjectSchema.safeParse({ a: { b: 'desc' }, c: 'value' });
    expect(result.success).toBe(true);
  });

  it('rejects an array', () => {
    const result = schemaObjectSchema.safeParse([]);
    expect(result.success).toBe(false);
  });

  it('rejects null', () => {
    const result = schemaObjectSchema.safeParse(null);
    expect(result.success).toBe(false);
  });

  it('accepts empty object', () => {
    const result = schemaObjectSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('translationObjectSchema', () => {
  it('accepts a valid translation object', () => {
    const result = translationObjectSchema.safeParse({ key: 'value' });
    expect(result.success).toBe(true);
  });

  it('accepts nested translations', () => {
    const result = translationObjectSchema.safeParse({ a: { b: 'text' } });
    expect(result.success).toBe(true);
  });

  it('rejects null', () => {
    const result = translationObjectSchema.safeParse(null);
    expect(result.success).toBe(false);
  });
});

describe('importStrategySchema', () => {
  it('defaults to merge', () => {
    const result = importStrategySchema.parse(undefined);
    expect(result).toBe('merge');
  });

  it('accepts overwrite', () => {
    expect(importStrategySchema.parse('overwrite')).toBe('overwrite');
  });

  it('accepts skip', () => {
    expect(importStrategySchema.parse('skip')).toBe('skip');
  });

  it('rejects invalid strategy', () => {
    const result = importStrategySchema.safeParse('invalid');
    expect(result.success).toBe(false);
  });
});

describe('exportLanguagesSchema', () => {
  it('accepts a list of languages', () => {
    const result = exportLanguagesSchema.safeParse(['zh-CN', 'en-US']);
    expect(result.success).toBe(true);
  });

  it('rejects empty array', () => {
    const result = exportLanguagesSchema.safeParse([]);
    expect(result.success).toBe(false);
  });

  it('accepts single language', () => {
    const result = exportLanguagesSchema.safeParse(['zh-CN']);
    expect(result.success).toBe(true);
  });
});

describe('searchKeywordSchema', () => {
  it('accepts a keyword', () => {
    expect(searchKeywordSchema.parse('test')).toBe('test');
  });

  it('accepts empty keyword', () => {
    expect(searchKeywordSchema.parse(undefined)).toBe(undefined);
  });
});
