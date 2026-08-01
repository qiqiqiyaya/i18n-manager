'use client';

import { create } from 'zustand';
import { SchemaObject, TranslationObject } from '@/types/schema';
import { deepClone, flattenObject, unflattenObject, emptyTranslationsFromSchema, deepMergeTemplate } from '@/lib/utils';

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

interface EditorState {
  projectId: string | null;
  projectTitle: string;
  availableLocales: string[];
  schema: SchemaObject;
  openLocales: Record<string, TranslationObject>;
  activeLang: string | null;
  isDirty: boolean;
  isLoading: boolean;
  saveStatus: SaveStatus;
  saveError: string | null;

  setProjectId: (id: string) => void;
  setProjectTitle: (title: string) => void;
  setAvailableLocales: (locales: string[]) => void;
  setSchema: (schema: SchemaObject) => void;
  updateSchema: (schema: SchemaObject) => void;
  setOpenLocales: (locales: Record<string, TranslationObject>) => void;
  openLocale: (lang: string, translations: TranslationObject) => void;
  closeLocale: (lang: string) => void;
  setActiveLang: (lang: string | null) => void;
  updateTranslation: (lang: string, translations: TranslationObject) => void;
  applyLocaleSync: (addedKeys: string[], removedKeys: string[], renameMap?: Record<string, string>) => void;
  reconcileSchemaInLocales: (newSchema: SchemaObject) => void;
  setIsDirty: (dirty: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  setSaveStatus: (status: SaveStatus, error?: string | null) => void;
  reset: () => void;
}

const initialState = {
  projectId: null,
  projectTitle: '',
  availableLocales: [] as string[],
  schema: {},
  openLocales: {},
  activeLang: null,
  isDirty: false,
  isLoading: false,
  saveStatus: 'idle' as SaveStatus,
  saveError: null as string | null,
};

export const useEditorStore = create<EditorState>((set) => ({
  ...initialState,

  setProjectId: (projectId) => set({ projectId }),
  setProjectTitle: (projectTitle) => set({ projectTitle }),
  setAvailableLocales: (availableLocales) => set({ availableLocales }),
  setSchema: (schema) => set({ schema }),
  updateSchema: (schema) => set({ schema, isDirty: true, saveStatus: 'dirty' }),
  setOpenLocales: (locales) => set({ openLocales: locales }),

  openLocale: (lang, translations) =>
    set((state) => {
      // 从 schema 生成空译文模板，然后递归合并（不覆盖已有值）
      const template = emptyTranslationsFromSchema(state.schema);
      const merged = deepClone(translations);

      // 递归合并：只在 translations 中缺失的键上填入空字符串
      const mergeTemplate = (target: Record<string, any>, source: Record<string, any>) => {
        for (const [key, value] of Object.entries(source)) {
          if (!(key in target)) {
            target[key] = deepClone(value);
          } else if (
            value !== null && typeof value === 'object' && !Array.isArray(value)
          ) {
            // source 是嵌套对象
            if (target[key] !== null && typeof target[key] === 'object' && !Array.isArray(target[key])) {
              // target 也是嵌套对象 → 递归合并
              mergeTemplate(target[key], value);
            } else {
              // target 是基本类型 → 用 source 的嵌套结构覆盖
              target[key] = deepClone(value);
            }
          }
        }
      };

      mergeTemplate(merged, template);
      return {
        openLocales: { ...state.openLocales, [lang]: merged },
        activeLang: state.activeLang || lang,
      };
    }),

  closeLocale: (lang) =>
    set((state) => {
      const { [lang]: _, ...rest } = state.openLocales;
      return {
        openLocales: rest,
        activeLang: state.activeLang === lang ? (Object.keys(rest)[0] || null) : state.activeLang,
      };
    }),

  setActiveLang: (lang) => set({ activeLang: lang }),

  updateTranslation: (lang, translations) =>
    set((state) => ({
      openLocales: { ...state.openLocales, [lang]: translations },
      isDirty: true,
      saveStatus: 'dirty',
    })),

  applyLocaleSync: (addedKeys, removedKeys, renameMap?) =>
    set((state) => {
      if (addedKeys.length === 0 && removedKeys.length === 0 && (!renameMap || Object.keys(renameMap).length === 0)) return state;
      // 在循环前预计算 schema 模板，避免每语言重复计算
      const schemaTemplate = emptyTranslationsFromSchema(state.schema);
      const newOpenLocales: Record<string, TranslationObject> = {};
      for (const [lang, translations] of Object.entries(state.openLocales)) {
        let flatCurrent: Record<string, any>;
        try {
          flatCurrent = flattenObject(translations);
        } catch {
          // 如果包含数组等无法 flatten 的值，跳过该语言
          newOpenLocales[lang] = translations;
          continue;
        }
        // 处理重命名：迁移旧值到新键
        if (renameMap) {
          for (const [oldKey, newKey] of Object.entries(renameMap)) {
            if (oldKey in flatCurrent) {
              flatCurrent[newKey] = flatCurrent[oldKey];
              delete flatCurrent[oldKey];
            }
          }
        }
        // 新增空键
        for (const key of addedKeys) {
          if (!(key in flatCurrent)) {
            flatCurrent[key] = '';
          }
        }
        // 删除旧键
        for (const key of removedKeys) {
          delete flatCurrent[key];
        }
        try {
          const unflattened = unflattenObject(flatCurrent);
          newOpenLocales[lang] = deepMergeTemplate(unflattened, schemaTemplate);
        } catch {
          newOpenLocales[lang] = translations;
        }
      }
      return { openLocales: newOpenLocales };
    }),

  reconcileSchemaInLocales: (newSchema) =>
    set((state) => {
      const newFlatKeys = Object.keys(flattenObject(newSchema));
      const newOpenLocales: Record<string, TranslationObject> = {};
      for (const [lang, translations] of Object.entries(state.openLocales)) {
        let flatCurrent: Record<string, any>;
        try {
          flatCurrent = flattenObject(translations);
        } catch {
          newOpenLocales[lang] = translations;
          continue;
        }
        const result: Record<string, any> = {};
        for (const key of newFlatKeys) {
          result[key] = key in flatCurrent ? flatCurrent[key] : '';
        }
        try {
          const unflattened = unflattenObject(result);
          const schemaTemplate = emptyTranslationsFromSchema(newSchema);
          newOpenLocales[lang] = deepMergeTemplate(unflattened, schemaTemplate);
        } catch {
          newOpenLocales[lang] = translations;
        }
      }
      return { openLocales: newOpenLocales };
    }),

  setIsDirty: (isDirty) => set({ isDirty }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setSaveStatus: (saveStatus, saveError = null) => set({ saveStatus, saveError }),
  reset: () => set(initialState),
}));
