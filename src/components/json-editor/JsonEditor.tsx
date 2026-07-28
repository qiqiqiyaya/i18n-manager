'use client';

import { useEffect, useRef, useState } from 'react';
import 'jsoneditor/dist/jsoneditor.min.css';

interface JsonEditorProps {
  data: any;
  onChange?: (data: any) => void;
  onNodeSelected?: (path: string[]) => void;
  onEditable?: (node: { field: string; value: string; path: string[] }) => boolean | { field: boolean; value: boolean };
  mode?: 'tree' | 'code' | 'view';
  /** 可切换的模式列表，启用后会在编辑器上方显示模式切换按钮。默认不启用。 */
  availableModes?: Array<'tree' | 'code' | 'form' | 'view'>;
  expandAll?: boolean;
  height?: string;
}

export default function JsonEditorComponent({
  data,
  onChange,
  onNodeSelected,
  onEditable,
  mode: initialMode = 'tree',
  availableModes,
  expandAll: shouldExpandAll = false,
  height = '100%',
}: JsonEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const dataRef = useRef(data);
  const [currentMode, setCurrentMode] = useState(initialMode);

  // 去重 ref
  const onChangeRef = useRef(onChange);
  const lastSavedDataRef = useRef<string>('');

  // 始终保持 onChangeRef 为最新值
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let editor: any = null;

    import('jsoneditor').then(({ default: JSONEditor }) => {
      if (cancelled || !containerRef.current) return;

      const options: ConstructorParameters<typeof JSONEditor>[1] = {
        mode: currentMode,
        mainMenuBar: currentMode !== 'view',
        onChange: () => {
          if (!editor) return;
          try {
            const currentData = editor.get();
            const serialized = JSON.stringify(currentData);
            // 去重：数据未变化时不触发
            if (serialized !== lastSavedDataRef.current) {
              lastSavedDataRef.current = serialized;
              onChangeRef.current?.(currentData);
            }
          } catch { /* 忽略序列化错误 */ }
        },
        onNodeSelected: (params: { path: string[] }) => {
          if (onNodeSelected && params) onNodeSelected(params.path || []);
        },
        onEditable: (node: { field: string; value: string; path: string[] }) => {
          if (onEditable) return onEditable(node);
          return { field: true, value: true };
        },
        navigationBar: true,
        statusBar: true,
      };

      editor = new JSONEditor(containerRef.current!, options, data);
      editorRef.current = editor;
      dataRef.current = data;
      lastSavedDataRef.current = JSON.stringify(data);
      if (shouldExpandAll && typeof editor.expandAll === 'function') {
        editor.expandAll();
      }
    });

    return () => {
      cancelled = true;
      if (editor) { editor.destroy(); }
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 切换模式
  const handleModeChange = (newMode: string) => {
    if (editorRef.current && typeof editorRef.current.setMode === 'function') {
      editorRef.current.setMode(newMode);
      setCurrentMode(newMode as typeof currentMode);
    }
  };

  useEffect(() => {
    if (editorRef.current && data !== dataRef.current) {
      editorRef.current.update(data);
      dataRef.current = data;
      lastSavedDataRef.current = JSON.stringify(data);
      if (shouldExpandAll && typeof editorRef.current.expandAll === 'function') {
        editorRef.current.expandAll();
      }
    }
  }, [data, shouldExpandAll]);

  const modeLabels: Record<string, string> = {
    tree: '树形',
    code: '代码',
    form: '表单',
    view: '只读',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {availableModes && availableModes.length > 0 && (
        <div style={{ display: 'flex', gap: 4, padding: '6px 12px', borderBottom: '1px solid #f0f0f0',
          background: '#fafafa', flexShrink: 0 }}>
          {availableModes.map((m) => (
            <button key={m} onClick={() => handleModeChange(m)}
              style={{
                padding: '2px 10px', fontSize: 12, cursor: 'pointer', border: '1px solid #d9d9d9',
                borderRadius: 4, background: currentMode === m ? '#1677ff' : '#fff',
                color: currentMode === m ? '#fff' : '#333', transition: 'all 0.2s',
              }}>
              {modeLabels[m] || m}
            </button>
          ))}
        </div>
      )}
      <div ref={containerRef} style={{ flex: 1, width: '100%' }} className="jsoneditor-container" />
    </div>
  );
}
