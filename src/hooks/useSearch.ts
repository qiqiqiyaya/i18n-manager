'use client';

import { useState, useMemo, useCallback } from 'react';
import { useEditorStore } from '@/stores/editorStore';

export interface SearchResult {
  lang: string;
  key: string;
  value: string;
}

interface UseSearchOptions {
  projectId: string;
}

export function useSearch({ projectId }: UseSearchOptions) {
  const [keyword, setKeyword] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const openLocales = useEditorStore((s) => s.openLocales);

  const search = useCallback(
    (query: string): SearchResult[] => {
      if (!query.trim()) return [];
      const lowerQuery = query.toLowerCase();
      const results: SearchResult[] = [];
      for (const [lang, translations] of Object.entries(openLocales)) {
        searchInObject(translations, '', lowerQuery, results, lang);
      }
      return results;
    },
    [openLocales]
  );

  const results = useMemo(() => {
    if (!keyword.trim()) return [];
    return search(keyword);
  }, [keyword, search]);

  return { keyword, setKeyword, results, isSearching, setIsSearching, search };
}

function searchInObject(
  obj: Record<string, any>,
  prefix: string,
  query: string,
  results: SearchResult[],
  lang: string
): void {
  for (const [key, value] of Object.entries(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') {
      searchInObject(value, fullPath, query, results, lang);
    } else if (typeof value === 'string' && value.toLowerCase().includes(query)) {
      results.push({ lang, key: fullPath, value });
    }
  }
}
