'use client';

import { useEffect, useRef, useState, useImperativeHandle, forwardRef, memo, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { editor } from 'monaco-editor';
import type { OnMount } from '@monaco-editor/react';

// 动态导入 Monaco Editor（SSR 安全）
const Editor = dynamic(() => import('@monaco-editor/react').then((mod) => mod.default), {
  ssr: false,
  loading: () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999', background: '#1e1e1e' }}>
      <span>加载编辑器中...</span>
    </div>
  ),
});

export interface MonacoEditorHandle {
  getValue: () => string;
  setValue: (value: string) => void;
  focus: () => void;
  find: (term: string) => void;
  formatDocument: () => void;
  getEditor: () => editor.IStandaloneCodeEditor | null;
  getCursorPosition: () => { lineNumber: number; column: number } | null;
  scrollToRatio: (ratio: number) => void;
}

interface MonacoEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: string;
  readOnly?: boolean;
  height?: string;
  options?: editor.IStandaloneEditorConstructionOptions;
  onEditorMount?: (editor: editor.IStandaloneCodeEditor) => void;
  onScrollChange?: (ratio: number) => void;
}

const DEFAULT_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  language: 'json',
  theme: 'vs-dark',
  automaticLayout: true,
  formatOnPaste: true,
  formatOnType: false,
  readOnly: false,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontSize: 14,
  tabSize: 2,
  wordWrap: 'off',
  lineNumbers: 'on',
  folding: true,
  renderWhitespace: 'selection',
  bracketPairColorization: { enabled: true },
};

function MonacoEditorComponent(
  {
    value,
    onChange,
    language = 'json',
    readOnly = false,
    height = '100%',
    options,
    onEditorMount,
    onScrollChange,
  }: MonacoEditorProps,
  ref: React.Ref<MonacoEditorHandle>
) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const [isReady, setIsReady] = useState(false);
  /** 标记 onChange 是否由用户键入触发，防止 value prop 回写时重置光标 */
  const fromUserRef = useRef(false);
  /** 标记是否正在同步滚动，防止循环触发 */
  const isSyncingScrollRef = useRef(false);

  const handleMount: OnMount = useCallback(
    (editorInstance) => {
      editorRef.current = editorInstance;
      setIsReady(true);

      // 粘贴时自动格式化
      editorInstance.onDidPaste(() => {
        setTimeout(() => {
          editorInstance.getAction('editor.action.formatDocument')?.run();
        }, 100);
      });

      // 滚动同步：使用 rAF 节流，计算滚动比例（0-1）
      let scrollRafId: number | null = null;
      editorInstance.onDidScrollChange(() => {
        if (scrollRafId !== null) return;
        if (isSyncingScrollRef.current) return;
        scrollRafId = requestAnimationFrame(() => {
          scrollRafId = null;
          const scrollTop = editorInstance.getScrollTop();
          const scrollHeight = editorInstance.getScrollHeight();
          const clientHeight = editorInstance.getLayoutInfo()?.height ?? 0;
          const maxScroll = Math.max(0, scrollHeight - clientHeight);
          const ratio = maxScroll > 0 ? scrollTop / maxScroll : 0;
          onScrollChange?.(ratio);
        });
      });

      onEditorMount?.(editorInstance);
    },
    [onEditorMount, onScrollChange]
  );

  const handleChange = useCallback(
    (newValue: string | undefined) => {
      if (newValue !== undefined) {
        fromUserRef.current = true; // 标记为用户行为 — 后续 value prop 变化不再重设编辑器
        onChange?.(newValue);
      }
    },
    [onChange]
  );

  // ---------- 外部 value prop 同步（仅当非用户行为时执行） ----------
  // 用户编辑时不走 value prop 回写路径，从而避免 Monaco 重新 setValue 导致光标跳转
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !isReady) return;

    // 跳过由用户 onChange 触发的重渲染（编辑器内容已最新）
    if (fromUserRef.current) {
      fromUserRef.current = false;
      return;
    }

    const currentEditorValue = editor.getValue();
    if (value !== currentEditorValue) {
      // 保存并恢复光标 / 滚动位置
      const position = editor.getPosition();
      const scrollTop = editor.getScrollTop();
      const scrollLeft = editor.getScrollLeft();

      editor.setValue(value);

      if (position) {
        const model = editor.getModel();
        if (model) {
          const maxLine = model.getLineCount();
          const restoredLine = Math.min(position.lineNumber, maxLine);
          const maxCol = model.getLineMaxColumn(restoredLine);
          editor.setPosition({ lineNumber: restoredLine, column: Math.min(position.column, maxCol) });
          editor.setScrollPosition({ scrollTop, scrollLeft });
        }
      }
    }
  }, [value, isReady]);

  useImperativeHandle(
    ref,
    () => ({
      getValue: () => editorRef.current?.getValue() ?? '',
      setValue: (newValue: string) => {
        const editor = editorRef.current;
        if (editor) {
          const currentValue = editor.getValue();
          if (currentValue !== newValue) {
            editor.setValue(newValue);
          }
        }
      },
      focus: () => editorRef.current?.focus(),
      find: (term: string) => {
        const editor = editorRef.current;
        if (editor) {
          const findAction = editor.getAction('actions.find');
          if (findAction) {
            findAction.run().then(() => {
              const controller = editor.getContribution('editor.contrib.findController') as { setSearchString: (value: string) => void } | null;
              if (controller) {
                controller.setSearchString(term);
              }
            });
          }
        }
      },
      formatDocument: () => {
        editorRef.current?.getAction('editor.action.formatDocument')?.run();
      },
      getEditor: () => editorRef.current,
      getCursorPosition: () => {
        const editor = editorRef.current;
        if (!editor) return null;
        const pos = editor.getPosition();
        if (!pos) return null;
        return { lineNumber: pos.lineNumber, column: pos.column };
      },
      scrollToRatio: (ratio: number) => {
        const editor = editorRef.current;
        if (!editor) return;
        isSyncingScrollRef.current = true;
        const scrollHeight = editor.getScrollHeight();
        const clientHeight = editor.getLayoutInfo()?.height ?? 0;
        const maxScroll = Math.max(0, scrollHeight - clientHeight);
        editor.setScrollTop(Math.round(ratio * maxScroll));
        // 微任务重置：比 setTimeout 快得多，setScrollTop 触发的 scroll 事件在同一帧内处理完
        // 后立即重置 flag，不会引入可感知的延迟
        queueMicrotask(() => { isSyncingScrollRef.current = false; });
      },
    }),
    []
  );

  const mergedOptions = useMemo(
    () => ({ ...DEFAULT_OPTIONS, ...options, language, readOnly }),
    [options, language, readOnly]
  );

  return (
    <div style={{ width: '100%', height, minHeight: 200 }}>
      <Editor
        height={height}
        language={language}
        defaultValue={value}
        onChange={handleChange}
        onMount={handleMount}
        options={mergedOptions}
        loading={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999', background: '#1e1e1e' }}>
            <span>加载编辑器中...</span>
          </div>
        }
      />
    </div>
  );
}

export default memo(forwardRef(MonacoEditorComponent));
