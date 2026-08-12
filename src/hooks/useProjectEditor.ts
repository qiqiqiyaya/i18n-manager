'use client';

import { useEffect, useCallback } from 'react';
import axios from 'axios';
import { useEditorStore } from '@/stores/editorStore';
import { TranslationObject } from '@/types/schema';

interface UseProjectEditorOptions {
  projectId: string;
}

export function useProjectEditor({ projectId }: UseProjectEditorOptions) {
  const setProjectId = useEditorStore((s) => s.setProjectId);
  const setProjectTitle = useEditorStore((s) => s.setProjectTitle);
  const setReferenceEnabled = useEditorStore((s) => s.setReferenceEnabled);
  const setAvailableLocales = useEditorStore((s) => s.setAvailableLocales);
  const setSchema = useEditorStore((s) => s.setSchema);
  const setOpenLocales = useEditorStore((s) => s.setOpenLocales);
  const setActiveLang = useEditorStore((s) => s.setActiveLang);
  const setIsLoading = useEditorStore((s) => s.setIsLoading);
  const setIsDirty = useEditorStore((s) => s.setIsDirty);
  const reset = useEditorStore((s) => s.reset);

  const loadProject = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const res = await axios.get(`/api/projects/${projectId}`);
      const { meta, schema: schemaData, locales } = res.data.data;
      setProjectId(projectId);
      setProjectTitle(meta?.title || '');
      setReferenceEnabled(meta?.referenceEnabled ?? true);
      setAvailableLocales(locales || []);
      setSchema(schemaData || {});

      const localeMap: Record<string, TranslationObject> = {};
      if (locales && locales.length > 0) {
        for (const lang of locales) {
          try {
            const langRes = await axios.get(`/api/projects/${projectId}/locales/${lang}`);
            const translations = langRes.data.data.translations || {};
            localeMap[lang] = translations;
          } catch (err) {
            console.error(`[Editor] 加载语言 ${lang} 失败:`, err);
          }
        }
        setOpenLocales(localeMap);
        setActiveLang(locales[0]);
      }
      setIsDirty(false);
    } catch (err) {
      console.error('[Editor] 加载项目失败:', err);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, setProjectId, setProjectTitle, setReferenceEnabled, setAvailableLocales, setSchema, setOpenLocales, setActiveLang, setIsLoading, setIsDirty]);

  // 初始加载
  useEffect(() => {
    loadProject();
    return () => {
      reset();
    };
  }, [projectId, loadProject, reset]);

  // 监听 beforeunload（isDirty 由 Socket.IO 保存完成后管理）
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useEditorStore.getState().isDirty) {
        e.preventDefault();
        e.returnValue = '有未保存的更改，确定离开吗？';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  return { loadProject };
}
