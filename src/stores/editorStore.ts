'use client';

import { create } from 'zustand';
import { SchemaObject, TranslationObject } from '@/types/schema';
import { deepClone, hasNestedPath, setNestedValue, flattenObject, unflattenObject } from '@/lib/utils';

interface EditorState {
  projectId: string | null;
  schema: SchemaObject;
  openLocales: Record<string, TranslationObject>;
  activeLang: string | null;
  isDirty: boolean;
  isLoading: boolean;

  setProjectId: (id: string) => void;
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
  reset: () => void;
}

const initialState = {
  projectId: null,
  schema: {},
  openLocales: {},
  activeLang: null,
  isDirty: false,
  isLoading: false,
};

export const useEditorStore = create<EditorState>((set) => ({
  ...initialState,

  setProjectId: (projectId) => set({ projectId }),
  setSchema: (schema) => set({ schema }),
  updateSchema: (schema) => set({ schema, isDirty: true }),
  setOpenLocales: (locales) => set({ openLocales: locales }),

  openLocale: (lang, translations) =>
    set((state) => {
      // 将 Schema 中所有扁平键同步到嵌套译文（不覆盖已有值）
      const schemaKeys = Object.keys(state.schema);
      const merged = deepClone(translations);
      if (schemaKeys.length > 0) {
        for (const key of schemaKeys) {
          if (!hasNestedPath(merged, key)) {
            setNestedValue(merged, key, '');
          }
        }
      }
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
    })),

  applyLocaleSync: (addedKeys, removedKeys, renameMap?) =>
    set((state) => {
      if (addedKeys.length === 0 && removedKeys.length === 0 && (!renameMap || Object.keys(renameMap).length === 0)) return state;
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
          newOpenLocales[lang] = unflattenObject(flatCurrent);
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
          newOpenLocales[lang] = unflattenObject(result);
        } catch {
          newOpenLocales[lang] = translations;
        }
      }
      return { openLocales: newOpenLocales };
    }),

  setIsDirty: (isDirty) => set({ isDirty }),
  setIsLoading: (isLoading) => set({ isLoading }),
  reset: () => set(initialState),
}));
