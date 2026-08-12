/**
 * 「速查」浮层的查询纯函数：双向命中（键/值）。
 *
 * token 可以是一个键（点分路径或末段）或一段译文值，返回：
 * - schemaHits：token 命中的 Schema 键（含说明）
 * - translationHits：token 命中的各语言译文 (lang, key, value)
 * 排序：key-exact > key-segment > value-exact > value-contains。
 * 数组叶子值原样保留为叶子（flattenObject 行为），仅参与键匹配，不做值匹配。
 */
import { flattenObject } from '@/lib/utils';

export type SchemaMatchType = 'exact' | 'segment';

export interface SchemaHit {
  /** 完整点分键路径 */
  key: string;
  /** Schema 中该键的说明 */
  description: string;
  matchType: SchemaMatchType;
}

export type TranslationMatchType = 'key-exact' | 'key-segment' | 'value-exact' | 'value-contains';

export interface TranslationHit {
  lang: string;
  /** 完整点分键路径 */
  key: string;
  value: string;
  matchType: TranslationMatchType;
}

export interface LookupResult {
  schemaHits: SchemaHit[];
  translationHits: TranslationHit[];
}

const TRANSLATION_PRIORITY: Record<TranslationMatchType, number> = {
  'key-exact': 0,
  'key-segment': 1,
  'value-exact': 2,
  'value-contains': 3,
};

function lastSegment(key: string): string {
  const idx = key.lastIndexOf('.');
  return idx === -1 ? key : key.slice(idx + 1);
}

export function lookupToken(
  token: string,
  schema: Record<string, unknown>,
  openLocales: Record<string, Record<string, unknown>>
): LookupResult {
  const t = token.trim().toLowerCase();
  if (!t) return { schemaHits: [], translationHits: [] };

  const schemaHits: SchemaHit[] = [];
  for (const [key, desc] of Object.entries(flattenObject(schema))) {
    const keyL = key.toLowerCase();
    if (keyL === t) {
      schemaHits.push({ key, description: String(desc), matchType: 'exact' });
    } else if (lastSegment(key).toLowerCase() === t) {
      schemaHits.push({ key, description: String(desc), matchType: 'segment' });
    }
  }

  const translationHits: TranslationHit[] = [];
  for (const [lang, translations] of Object.entries(openLocales)) {
    for (const [key, value] of Object.entries(flattenObject(translations))) {
      const keyL = key.toLowerCase();
      const segL = lastSegment(key).toLowerCase();

      let matchType: TranslationMatchType | null = null;
      if (keyL === t) {
        matchType = 'key-exact';
      } else if (segL === t) {
        matchType = 'key-segment';
      } else if (typeof value === 'string') {
        const valueL = value.toLowerCase();
        if (valueL === t) {
          matchType = 'value-exact';
        } else if (valueL.includes(t)) {
          matchType = 'value-contains';
        }
      }

      if (matchType) {
        translationHits.push({
          lang,
          key,
          value: typeof value === 'string' ? value : String(value),
          matchType,
        });
      }
    }
  }

  translationHits.sort(
    (a, b) => TRANSLATION_PRIORITY[a.matchType] - TRANSLATION_PRIORITY[b.matchType]
  );

  return { schemaHits, translationHits };
}
