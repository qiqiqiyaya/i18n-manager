import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSearch } from './useSearch';
import { useEditorStore } from '@/stores/editorStore';

function initStore() {
  useEditorStore.setState({
    projectId: null,
    projectTitle: '',
    availableLocales: [],
    schema: { a: 'desc', b: 'desc' },
    openLocales: {
      'zh-CN': { a: '苹果', b: '香蕉' },
      'en-US': { a: 'apple', b: 'banana' },
    },
    activeLang: 'zh-CN',
    isDirty: false,
    isLoading: false,
    saveStatus: 'idle',
    saveError: null,
  });
}

describe('useSearch', () => {
  beforeEach(() => initStore());

  it('returns empty results with empty keyword', () => {
    const { result } = renderHook(() => useSearch({ projectId: 'test' }));
    expect(result.current.keyword).toBe('');
    expect(result.current.results).toEqual([]);
  });

  it('sets keyword and returns matching results', () => {
    const { result } = renderHook(() => useSearch({ projectId: 'test' }));

    act(() => {
      result.current.setKeyword('苹果');
    });

    expect(result.current.keyword).toBe('苹果');
    expect(result.current.results).toHaveLength(1);
    expect(result.current.results[0]).toEqual({ lang: 'zh-CN', key: 'a', value: '苹果' });
  });

  it('matches across all open locales', () => {
    const { result } = renderHook(() => useSearch({ projectId: 'test' }));

    act(() => {
      result.current.setKeyword('apple');
    });

    expect(result.current.results).toHaveLength(1);
    expect(result.current.results[0]).toEqual({ lang: 'en-US', key: 'a', value: 'apple' });
  });

  it('matches nested keys', () => {
    useEditorStore.setState({
      openLocales: {
        'zh-CN': { app: { title: '登录', btn: '确定' } },
      },
    });

    const { result } = renderHook(() => useSearch({ projectId: 'test' }));

    act(() => {
      result.current.setKeyword('登录');
    });

    expect(result.current.results).toHaveLength(1);
    expect(result.current.results[0]).toEqual({ lang: 'zh-CN', key: 'app.title', value: '登录' });
  });

  it('returns multiple results for same keyword in same locale', () => {
    useEditorStore.setState({
      openLocales: {
        'zh-CN': { title: '测试', desc: '这是一个测试' },
      },
    });

    const { result } = renderHook(() => useSearch({ projectId: 'test' }));

    act(() => {
      result.current.setKeyword('测试');
    });

    expect(result.current.results).toHaveLength(2);
  });

  it('returns empty results when no match', () => {
    const { result } = renderHook(() => useSearch({ projectId: 'test' }));

    act(() => {
      result.current.setKeyword('不存在的');
    });

    expect(result.current.results).toEqual([]);
  });

  it('clears keyword resets results', () => {
    const { result } = renderHook(() => useSearch({ projectId: 'test' }));

    act(() => { result.current.setKeyword('苹果'); });
    expect(result.current.results).toHaveLength(1);

    act(() => { result.current.setKeyword(''); });
    expect(result.current.results).toEqual([]);
  });

  it('search() function works directly', () => {
    const { result } = renderHook(() => useSearch({ projectId: 'test' }));
    const res = result.current.search('banana');
    expect(res).toHaveLength(1);
    expect(res[0]).toEqual({ lang: 'en-US', key: 'b', value: 'banana' });
  });

  it('search() with empty query returns empty', () => {
    const { result } = renderHook(() => useSearch({ projectId: 'test' }));
    expect(result.current.search('')).toEqual([]);
    expect(result.current.search('   ')).toEqual([]);
  });
});
