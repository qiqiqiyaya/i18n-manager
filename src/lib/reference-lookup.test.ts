import { describe, expect, it } from 'vitest';
import { lookupToken } from './reference-lookup';

const SCHEMA = {
  title: '页面标题',
  app: {
    title: '应用标题',
    login: '登录按钮',
  },
};

const LOCALES = {
  'zh-CN': {
    title: '首页',
    app: { title: '我的应用', login: '登录' },
  },
  'en-US': {
    title: 'Home',
    app: { title: 'My App', login: 'Login' },
  },
};

describe('lookupToken', () => {
  it('returns empty hits for empty/whitespace token', () => {
    expect(lookupToken('', SCHEMA, LOCALES)).toEqual({ schemaHits: [], translationHits: [] });
    expect(lookupToken('   ', SCHEMA, LOCALES)).toEqual({ schemaHits: [], translationHits: [] });
  });

  it('matches schema key by exact full path', () => {
    const result = lookupToken('app.title', SCHEMA, LOCALES);
    expect(result.schemaHits).toContainEqual({ key: 'app.title', description: '应用标题', matchType: 'exact' });
  });

  it('matches schema key by last segment', () => {
    const result = lookupToken('login', SCHEMA, LOCALES);
    expect(result.schemaHits).toContainEqual({ key: 'app.login', description: '登录按钮', matchType: 'segment' });
  });

  it('ranks exact schema key before segment', () => {
    const result = lookupToken('title', SCHEMA, LOCALES);
    const types = result.schemaHits.map((h) => h.matchType);
    expect(types[0]).toBe('exact');
    expect(types).toContain('segment');
  });

  it('matches translation value exactly', () => {
    const result = lookupToken('登录', SCHEMA, LOCALES);
    expect(result.translationHits).toContainEqual({
      lang: 'zh-CN', key: 'app.login', value: '登录', matchType: 'value-exact',
    });
  });

  it('matches translation value by contains (case-insensitive)', () => {
    const result = lookupToken('log', SCHEMA, LOCALES);
    expect(result.translationHits.some((h) => h.lang === 'en-US' && h.key === 'app.login' && h.matchType === 'value-contains')).toBe(true);
    const upper = lookupToken('LOGIN', SCHEMA, LOCALES);
    expect(upper.translationHits.some((h) => h.lang === 'en-US' && h.key === 'app.login')).toBe(true);
  });

  it('matches translation by key path (cross-language view)', () => {
    const result = lookupToken('app.title', SCHEMA, LOCALES);
    const hits = result.translationHits.filter((h) => h.matchType === 'key-exact');
    expect(hits).toHaveLength(2);
    expect(hits.map((h) => h.lang).sort()).toEqual(['en-US', 'zh-CN']);
  });

  it('matches translation by last-segment key', () => {
    const result = lookupToken('login', SCHEMA, LOCALES);
    const hits = result.translationHits.filter((h) => h.matchType === 'key-segment');
    expect(hits).toHaveLength(2);
  });

  it('groups same value across languages', () => {
    const result = lookupToken('Home', SCHEMA, LOCALES);
    const hits = result.translationHits.filter((h) => h.matchType === 'value-exact');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toEqual({ lang: 'en-US', key: 'title', value: 'Home', matchType: 'value-exact' });
  });

  it('sorts translation hits: key-exact < key-segment < value-exact < value-contains', () => {
    // token 同时命中 key（app.title 的 title 段）与 value
    const result = lookupToken('title', SCHEMA, LOCALES);
    const priorities = result.translationHits.map((h) => h.matchType);
    const order = ['key-exact', 'key-segment', 'value-exact', 'value-contains'];
    for (let i = 1; i < priorities.length; i++) {
      expect(order.indexOf(priorities[i])).toBeGreaterThanOrEqual(order.indexOf(priorities[i - 1]));
    }
  });

  it('skips non-string leaves for value matching but key-matches them', () => {
    const result = lookupToken('list', SCHEMA, { 'zh-CN': { list: ['a', 'b'] } });
    expect(result.translationHits).toContainEqual({ lang: 'zh-CN', key: 'list', value: 'a,b', matchType: 'key-exact' });
    const valueHit = lookupToken('a', SCHEMA, { 'zh-CN': { list: ['a', 'b'] } });
    expect(valueHit.translationHits.filter((h) => h.matchType.startsWith('value'))).toEqual([]);
  });

  it('returns empty hits when nothing matches', () => {
    const result = lookupToken('zzz-不存在', SCHEMA, LOCALES);
    expect(result.schemaHits).toEqual([]);
    expect(result.translationHits).toEqual([]);
  });
});
