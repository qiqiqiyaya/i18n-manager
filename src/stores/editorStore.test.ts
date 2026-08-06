import { describe, expect, it, beforeEach } from 'vitest';
import { useEditorStore } from './editorStore';

function initStore() {
  useEditorStore.setState({
    projectId: null,
    projectTitle: '',
    availableLocales: [],
    schema: {},
    openLocales: {},
    activeLang: null,
    isDirty: false,
    isLoading: false,
    saveStatus: 'idle',
    saveError: null,
  });
}

describe('editorStore', () => {
  beforeEach(() => initStore());

  describe('basic setters', () => {
    it('setProjectId', () => {
      useEditorStore.getState().setProjectId('proj-1');
      expect(useEditorStore.getState().projectId).toBe('proj-1');
    });

    it('setProjectTitle', () => {
      useEditorStore.getState().setProjectTitle('Test');
      expect(useEditorStore.getState().projectTitle).toBe('Test');
    });

    it('setAvailableLocales', () => {
      useEditorStore.getState().setAvailableLocales(['zh-CN', 'en-US']);
      expect(useEditorStore.getState().availableLocales).toEqual(['zh-CN', 'en-US']);
    });

    it('setActiveLang', () => {
      useEditorStore.getState().setActiveLang('zh-CN');
      expect(useEditorStore.getState().activeLang).toBe('zh-CN');
    });

    it('setIsDirty', () => {
      useEditorStore.getState().setIsDirty(true);
      expect(useEditorStore.getState().isDirty).toBe(true);
    });

    it('setIsLoading', () => {
      useEditorStore.getState().setIsLoading(true);
      expect(useEditorStore.getState().isLoading).toBe(true);
    });

    it('setSaveStatus', () => {
      useEditorStore.getState().setSaveStatus('saving');
      expect(useEditorStore.getState().saveStatus).toBe('saving');
    });

    it('reset restores initial state', () => {
      useEditorStore.getState().setProjectId('test');
      useEditorStore.getState().reset();
      expect(useEditorStore.getState().projectId).toBeNull();
    });
  });

  describe('setSchema', () => {
    it('sets schema without dirty flag', () => {
      useEditorStore.getState().setSchema({ key: 'desc' });
      expect(useEditorStore.getState().schema).toEqual({ key: 'desc' });
      expect(useEditorStore.getState().isDirty).toBe(false);
    });
  });

  describe('updateSchema', () => {
    it('sets schema with dirty flag', () => {
      useEditorStore.getState().updateSchema({ key: 'desc' });
      expect(useEditorStore.getState().schema).toEqual({ key: 'desc' });
      expect(useEditorStore.getState().isDirty).toBe(true);
      expect(useEditorStore.getState().saveStatus).toBe('dirty');
    });
  });

  describe('setOpenLocales', () => {
    it('sanitizes locales against schema template', () => {
      useEditorStore.getState().setSchema({ a: { b: 'desc' } });
      useEditorStore.getState().setOpenLocales({ 'zh-CN': { a: { b: '值' } } });
      expect(useEditorStore.getState().openLocales).toEqual({ 'zh-CN': { a: { b: '值' } } });
    });

    it('fills missing keys from schema', () => {
      useEditorStore.getState().setSchema({ a: { b: 'desc' }, c: 'desc2' });
      useEditorStore.getState().setOpenLocales({ 'zh-CN': { a: { b: '值' } } });
      expect(useEditorStore.getState().openLocales).toEqual({ 'zh-CN': { a: { b: '值' }, c: '' } });
    });
  });

  describe('openLocale', () => {
    it('adds locale and sets activeLang', () => {
      useEditorStore.getState().openLocale('zh-CN', { key: '值' });
      expect(useEditorStore.getState().openLocales['zh-CN']).toEqual({ key: '值' });
      expect(useEditorStore.getState().activeLang).toBe('zh-CN');
    });

    it('merges schema template into translations', () => {
      useEditorStore.getState().setSchema({ a: 'desc', b: 'desc2' });
      useEditorStore.getState().openLocale('zh-CN', { a: '值' });
      expect(useEditorStore.getState().openLocales['zh-CN']).toEqual({ a: '值', b: '' });
    });

    it('overrides basic type with nested object from schema template', () => {
      useEditorStore.getState().setSchema({ a: { nested: 'desc' } });
      useEditorStore.getState().openLocale('zh-CN', { a: '旧字符串' });
      expect(useEditorStore.getState().openLocales['zh-CN']).toEqual({ a: { nested: '' } });
    });

    it('preserves existing activeLang when adding another locale', () => {
      useEditorStore.getState().openLocale('zh-CN', { key: '值' });
      useEditorStore.getState().openLocale('en-US', { key: 'val' });
      expect(useEditorStore.getState().activeLang).toBe('zh-CN');
    });
  });

  describe('closeLocale', () => {
    it('removes locale', () => {
      useEditorStore.getState().openLocale('zh-CN', {});
      useEditorStore.getState().openLocale('en-US', {});
      useEditorStore.getState().closeLocale('zh-CN');
      expect(useEditorStore.getState().openLocales['zh-CN']).toBeUndefined();
    });

    it('switches activeLang when closing active', () => {
      useEditorStore.getState().openLocale('zh-CN', {});
      useEditorStore.getState().openLocale('en-US', {});
      useEditorStore.getState().setActiveLang('zh-CN');
      useEditorStore.getState().closeLocale('zh-CN');
      expect(useEditorStore.getState().activeLang).toBe('en-US');
    });

    it('sets activeLang to null when closing last locale', () => {
      useEditorStore.getState().openLocale('zh-CN', {});
      useEditorStore.getState().closeLocale('zh-CN');
      expect(useEditorStore.getState().activeLang).toBeNull();
    });
  });

  describe('updateTranslation', () => {
    it('updates translation and sets dirty', () => {
      useEditorStore.getState().setSchema({ key: 'desc' });
      useEditorStore.getState().openLocale('zh-CN', { key: '' });
      useEditorStore.getState().updateTranslation('zh-CN', { key: '新值' });
      expect(useEditorStore.getState().openLocales['zh-CN'].key).toBe('新值');
      expect(useEditorStore.getState().isDirty).toBe(true);
    });

    it('fills missing keys from schema template', () => {
      useEditorStore.getState().setSchema({ key: 'desc', missing: 'desc2' });
      useEditorStore.getState().openLocale('zh-CN', { key: '' });
      useEditorStore.getState().updateTranslation('zh-CN', { key: '值' });
      expect(useEditorStore.getState().openLocales['zh-CN']).toEqual({ key: '值', missing: '' });
    });
  });

  describe('applyLocaleSync', () => {
    beforeEach(() => {
      useEditorStore.getState().setSchema({ a: 'desc', b: 'desc' });
      useEditorStore.getState().setOpenLocales({ 'zh-CN': { a: '值1', b: '值2' } });
    });

    it('adds new keys to locales', () => {
      useEditorStore.getState().updateSchema({ a: 'desc', b: 'desc', c: 'desc' });
      useEditorStore.getState().applyLocaleSync(['c'], []);
      expect(useEditorStore.getState().openLocales['zh-CN']).toEqual({ a: '值1', b: '值2', c: '' });
    });

    it('removes keys from locales', () => {
      useEditorStore.getState().setSchema({ b: 'desc' });
      useEditorStore.getState().applyLocaleSync([], ['a']);
      expect(useEditorStore.getState().openLocales['zh-CN']).toEqual({ b: '值2' });
    });

    it('handles rename mapping', () => {
      useEditorStore.getState().setSchema({ a_renamed: 'desc', b: 'desc' });
      useEditorStore.getState().applyLocaleSync(['a_renamed'], ['a'], { 'a': 'a_renamed' });
      expect(useEditorStore.getState().openLocales['zh-CN']).toEqual({ a_renamed: '值1', b: '值2' });
    });

    it('does nothing when no changes', () => {
      const prev = useEditorStore.getState().openLocales;
      useEditorStore.getState().applyLocaleSync([], []);
      expect(useEditorStore.getState().openLocales).toBe(prev);
    });

    it('handles multiple locales', () => {
      useEditorStore.getState().openLocale('en-US', { a: 'val1', b: 'val2' });
      useEditorStore.getState().setSchema({ b: 'desc', c: 'desc' });
      useEditorStore.getState().applyLocaleSync(['c'], ['a']);
      const locales = useEditorStore.getState().openLocales;
      expect(locales['zh-CN']).toEqual({ b: '值2', c: '' });
      expect(locales['en-US']).toEqual({ b: 'val2', c: '' });
    });

    it('handles locale with array values (flatten passes through)', () => {
      useEditorStore.getState().setSchema({});
      useEditorStore.getState().setOpenLocales({ 'zh-CN': { list: [1, 2, 3] } });
      useEditorStore.getState().applyLocaleSync(['c'], []);
      // flatten now passes arrays through, so locale is processed and c added
      expect(useEditorStore.getState().openLocales['zh-CN']).toEqual({ list: [1, 2, 3], c: '' });
    });
  });

  describe('reconcileSchemaInLocales', () => {
    it('reconciles locales against new schema', () => {
      useEditorStore.getState().setSchema({ a: 'desc', b: 'desc', c: 'desc' });
      useEditorStore.getState().setOpenLocales({ 'zh-CN': { a: '值1', b: '值2', c: '值3' } });
      const newSchema = { a: 'desc', d: 'desc' };
      useEditorStore.getState().reconcileSchemaInLocales(newSchema);
      expect(useEditorStore.getState().openLocales['zh-CN']).toEqual({ a: '值1', d: '' });
    });

    it('handles locale with array values (flatten passes through)', () => {
      useEditorStore.getState().setSchema({});
      useEditorStore.getState().setOpenLocales({ 'zh-CN': { list: [1, 2, 3] } });
      const newSchema = { b: 'desc' };
      useEditorStore.getState().reconcileSchemaInLocales(newSchema);
      // flatten passes arrays through; array key not in new schema is removed
      expect(useEditorStore.getState().openLocales['zh-CN']).toEqual({ b: '' });
    });
  });

  describe('sortAllKeys', () => {
    it('sorts schema and locale keys alphabetically', () => {
      useEditorStore.getState().setSchema({ z: 'desc', a: 'desc', m: { b: 'desc', a: 'desc' } });
      useEditorStore.getState().openLocale('zh-CN', { z: '值', a: '值2', m: { b: 'v', a: 'v2' } });
      useEditorStore.getState().sortAllKeys();
      const state = useEditorStore.getState();
      expect(Object.keys(state.schema)).toEqual(['a', 'm', 'z']);
      expect(Object.keys(state.schema.m)).toEqual(['a', 'b']);
      expect(Object.keys(state.openLocales['zh-CN'])).toEqual(['a', 'm', 'z']);
      expect(Object.keys(state.openLocales['zh-CN'].m)).toEqual(['a', 'b']);
    });
  });
});
