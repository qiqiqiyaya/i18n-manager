'use client';

import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Button, Space, Tooltip } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useEditorStore } from '@/stores/editorStore';
import MonacoEditor, { type MonacoEditorHandle } from '@/components/json-editor/MonacoEditor';
import { flattenObject } from '@/lib/utils';
import type { SchemaUpdatedPayload } from '@/types/collaboration';
import type { editor } from 'monaco-editor';

/** 自动保存防抖延迟与 Schema 校验防抖共享同一值 */
const PARSE_DEBOUNCE = parseInt(
  process.env.NEXT_PUBLIC_AUTO_SAVE_DEBOUNCE || '1000',
  10
);

/**
 * 启发式重命名检测：如果删除的键和新增的键前缀相同但最后一个分段不同，视为重命名
 */
function detectRenames(removedKeys: string[], newKeys: string[]): Record<string, string> {
  const renameMap: Record<string, string> = {};
  for (const removed of removedKeys) {
    const removedParts = removed.split('.');
    if (removedParts.length < 2) continue;
    const removedPrefix = removedParts.slice(0, -1).join('.');
    const removedLast = removedParts[removedParts.length - 1];
    for (const added of newKeys) {
      const addedParts = added.split('.');
      if (addedParts.length < 2) continue;
      const addedPrefix = addedParts.slice(0, -1).join('.');
      const addedLast = addedParts[addedParts.length - 1];
      if (removedPrefix === addedPrefix && removedLast !== addedLast) {
        renameMap[removed] = added;
        break;
      }
    }
  }
  return renameMap;
}

interface SchemaEditorProps {
  sendSchemaUpdated?: (data: Omit<SchemaUpdatedPayload, 'projectId'>) => void;
  sendSchemaSave?: (data: { schema: Record<string, any>; addedKeys: string[]; removedKeys: string[] }) => void;
  socketId?: string;
}

export default function SchemaEditor({ sendSchemaUpdated, sendSchemaSave, socketId }: SchemaEditorProps) {
  const editorRef = useRef<MonacoEditorHandle>(null);
  const schema = useEditorStore((s) => s.schema);
  const openLocales = useEditorStore((s) => s.openLocales);
  const updateSchema = useEditorStore((s) => s.updateSchema);
  const applyLocaleSync = useEditorStore((s) => s.applyLocaleSync);

  // Monaco 编辑器实例引用（用于添加标记）
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
  const editorInstanceRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  // 编辑器当前文本（本地管理，不与 store 强绑定）
  const [editorText, setEditorText] = useState(() => JSON.stringify(schema, null, 2));
  // JSON 校验状态：'valid' | 'invalid' | 'parsing'
  const [validationStatus, setValidationStatus] = useState<'valid' | 'invalid' | 'parsing'>('valid');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  // 上次成功同步到 store 的 schema 快照（用于避免重复同步）
  const lastSyncedRef = useRef(JSON.stringify(schema));
  // RxJS Subject 用于防抖解析（替代手动 setTimeout/clearTimeout）
  const parseSubjectRef = useRef<Subject<string> | null>(null);
  // 标记用户是否正在编辑（用于阻止外部 store 更新覆盖编辑器）
  const isEditingRef = useRef(false);
  // 用 ref 追踪最新 editorText，避免 blur handler 闭包过期
  const editorTextRef = useRef(editorText);
  editorTextRef.current = editorText;
  // 用 ref 追踪 schema/openLocales，避免 useCallback 因依赖变化而重建 handleChange
  const schemaRef = useRef(schema);
  schemaRef.current = schema;
  const openLocalesRef = useRef(openLocales);
  openLocalesRef.current = openLocales;

  // ---------- 接收外部 store 更新（如 WebSocket 广播后的数据重载） ----------
  // 只有当编辑器未被用户主动编辑时才更新
  useEffect(() => {
    if (isEditingRef.current) return;

    const formatted = JSON.stringify(schema, null, 2);
    if (formatted !== editorText) {
      // 保存当前光标和滚动位置
      const editor = editorRef.current?.getEditor();
      const position = editor?.getPosition();
      const scrollTop = editor?.getScrollTop();
      const scrollLeft = editor?.getScrollLeft();

      setEditorText(formatted);
      lastSyncedRef.current = formatted;
      setValidationStatus('valid');
      setValidationMessage(null);
      editorRef.current?.setValue(formatted);

      // 尝试恢复光标位置（在有效范围内钳制）
      if (editor && position) {
        const model = editor.getModel();
        if (model) {
          const maxLine = model.getLineCount();
          const restoredLine = Math.min(position.lineNumber, maxLine);
          const maxCol = model.getLineMaxColumn(restoredLine);
          const restoredCol = Math.min(position.column, maxCol);
          editor.setPosition({ lineNumber: restoredLine, column: restoredCol });
        }
        if (scrollTop !== undefined) {
          editor.setScrollPosition({ scrollTop, scrollLeft });
        }
      }
    }
  }, [schema]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- 添加 Monaco 编辑器标记（红色波浪线） ----------
  const setMonacoMarkers = useCallback((message: string | null) => {
    const monaco = monacoRef.current;
    const editor = editorInstanceRef.current;
    if (!monaco || !editor) return;

    const model = editor.getModel();
    if (!model) return;

    if (!message) {
      // 清除所有标记
      monaco.editor.setModelMarkers(model, 'schema-editor', []);
      return;
    }

    // 在整个文件第一个字符位置添加标记
    monaco.editor.setModelMarkers(model, 'schema-editor', [{
      severity: monaco.MarkerSeverity.Error,
      message,
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 1,
    }]);
  }, []);

  // ---------- RxJS 防抖解析 JSON 并同步到 store ----------
  // 使用 Subject + debounceTime + distinctUntilChanged 替代手动 setTimeout/clearTimeout
  // 注意：通过 ref 访问 schema/openLocales，避免闭包因 store 变化而重建
  const parseLogic = useMemo(() => {
    return (rawText: string) => {
      // 先设置为 parsing 状态（工具条小点变黄）
      setValidationStatus('parsing');
      setValidationMessage(null);

      try {
        const parsed = JSON.parse(rawText);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const flat = flattenObject(parsed);
          const clean: Record<string, string> = {};
          for (const [key, val] of Object.entries(flat)) {
            const strVal = typeof val === 'string' ? val : String(val);
            if (key.trim() !== '') {
              clean[key] = strVal;
            }
          }

          const cleanHash = JSON.stringify(clean);
          // 去重：内容无变化则不重复同步（distinctUntilChanged 是引用比较，这里用 hash）
          if (cleanHash === lastSyncedRef.current) {
            setValidationStatus('valid');
            setValidationMessage(null);
            setMonacoMarkers(null);
            return;
          }

          // 通过 ref 读取最新 schema/openLocales，不依赖闭包
          const currentSchema = schemaRef.current;
          const currentOpenLocales = openLocalesRef.current;

          // 计算完整的 diff：新增键、删除键、重命名检测
          const oldKeys = Object.keys(currentSchema);
          const newKeys = Object.keys(clean).filter((key) => !(key in currentSchema));
          const removedKeys = oldKeys.filter((key) => !(key in clean));
          const renameMap = detectRenames(removedKeys, newKeys);

          // 从 removedKeys 中移除已被 renameMap 覆盖的键
          const effectiveRemovedKeys = removedKeys.filter((key) => !(key in renameMap));

          updateSchema(clean);
          lastSyncedRef.current = cleanHash;
          setValidationStatus('valid');
          setValidationMessage(null);
          setMonacoMarkers(null);

          // 使用 applyLocaleSync 统一同步 locale（支持 renameMap 迁移值）
          if (newKeys.length > 0 || effectiveRemovedKeys.length > 0 || Object.keys(renameMap).length > 0) {
            applyLocaleSync(newKeys, effectiveRemovedKeys, renameMap);
          }

          // 广播 Schema 变更给其他客户端（时间戳 + 来源标识）
          if (sendSchemaUpdated && (newKeys.length > 0 || effectiveRemovedKeys.length > 0)) {
            sendSchemaUpdated({
              schema: clean,
              addedKeys: newKeys,
              removedKeys: effectiveRemovedKeys,
              renameMap: Object.keys(renameMap).length > 0 ? renameMap : undefined,
              timestamp: Date.now(),
              clientId: socketId || '',
            });
          }

          // 通过 Socket.IO 持久化到磁盘（替代 HTTP PATCH）
          if (sendSchemaSave && (newKeys.length > 0 || effectiveRemovedKeys.length > 0)) {
            sendSchemaSave({
              schema: clean,
              addedKeys: newKeys,
              removedKeys: effectiveRemovedKeys,
            });
          }
        } else {
          const msg = 'Schema 必须是 JSON 对象（非数组）';
          setValidationStatus('invalid');
          setValidationMessage(msg);
          setMonacoMarkers(msg);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'JSON 格式错误';
        setValidationStatus('invalid');
        setValidationMessage(msg);
        setMonacoMarkers(msg);
      }
    };
  }, [updateSchema, applyLocaleSync, sendSchemaUpdated, sendSchemaSave, socketId, setMonacoMarkers]);

  // 建立 RxJS Subject + 防抖订阅
  useEffect(() => {
    const subject = new Subject<string>();
    parseSubjectRef.current = subject;

    const subscription = subject.pipe(
      distinctUntilChanged(),
      debounceTime(PARSE_DEBOUNCE)
    ).subscribe((rawText) => {
      parseLogic(rawText);
    });

    return () => {
      subscription.unsubscribe();
      parseSubjectRef.current = null;
    };
  }, [parseLogic]);

  // ---------- 编辑器内容变更 ----------
  const handleChange = useCallback(
    (value: string) => {
      isEditingRef.current = true;
      setEditorText(value);
      // 防抖结束后会通过 parseLogic 更新状态，此处不需要立即清除
      parseSubjectRef.current?.next(value);
    },
    []  // parseSubjectRef 是 ref，不需要依赖
  );

  // ---------- 失去焦点时立即尝试解析 ----------
  // 注：使用 ref 而非 editorText state，因为 blur handler 在
  // onEditorMount 中注册（仅一次），闭包会捕获过期的 editorText
  const handleBlur = useCallback(() => {
    isEditingRef.current = false;
    const text = editorTextRef.current;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        setValidationStatus('valid');
        setValidationMessage(null);
        setMonacoMarkers(null);
      } else {
        const msg = 'Schema 必须是 JSON 对象（非数组）';
        setValidationStatus('invalid');
        setValidationMessage(msg);
        setMonacoMarkers(msg);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'JSON 格式错误';
      setValidationStatus('invalid');
      setValidationMessage(msg);
      setMonacoMarkers(msg);
    }
  }, [setMonacoMarkers]); // 空依赖：editorTextRef.current 始终保持最新

  // ---------- Monaco 编辑器挂载时注册 blur 监听 + 保存 monaco 实例 ----------
  // 稳定引用：onEditorMount 只依赖 handleBlur（空依赖），永远不变
  // 目的：配合 MonacoEditor 的 React.memo 防止不必要的重渲染级联
  const handleEditorMount = useCallback((editor: any) => {
    // 保存 Monaco 实例引用，用于添加标记
    try {
      // Monaco Editor 实例上可以获取到 monaco 命名空间
      const editorInstance = editor as editor.IStandaloneCodeEditor;
      editorInstanceRef.current = editorInstance;
      // @ts-ignore — monaco 实例通过全局访问
      monacoRef.current = (window as any).monaco;
    } catch {
      // 静默失败，标记功能降级
    }
    editor.onDidBlurEditorText(() => {
      handleBlur();
    });
  }, [handleBlur]);

  // ---------- 快速添加键（辅助功能） ----------
  const handleAddKey = useCallback(() => {
    const baseKey = 'new_key';
    let key = baseKey;
    let counter = 1;
    while (key in schema) {
      key = `${baseKey}_${counter}`;
      counter++;
    }

    const newSchema = { ...schema, [key]: '' };
    const formatted = JSON.stringify(newSchema, null, 2);
    setEditorText(formatted);
    lastSyncedRef.current = JSON.stringify(newSchema);
    setValidationStatus('valid');
    setValidationMessage(null);
    editorRef.current?.setValue(formatted);
    updateSchema(newSchema);

    // 使用 applyLocaleSync 统一同步 locale
    applyLocaleSync([key], []);

    // 广播 Schema 变更
    if (sendSchemaUpdated) {
      sendSchemaUpdated({
        schema: newSchema,
        addedKeys: [key],
        removedKeys: [],
        timestamp: Date.now(),
        clientId: socketId || '',
      });
    }

    // 通过 Socket.IO 持久化到磁盘
    if (sendSchemaSave) {
      sendSchemaSave({
        schema: newSchema,
        addedKeys: [key],
        removedKeys: [],
      });
    }
  }, [schema, openLocales, updateSchema, applyLocaleSync, sendSchemaUpdated, sendSchemaSave, socketId]);

  // ---------- 格式化文档 ----------
  const handleFormat = useCallback(() => {
    editorRef.current?.formatDocument();
  }, []);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 工具栏 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 8px',
          borderBottom: '1px solid #303030',
          background: '#252526',
          flexShrink: 0,
          gap: 8,
        }}
      >
        <Space size={4}>
          <Tooltip title="添加新键（自动填入空说明）">
            <Button
              type="text"
              size="small"
              icon={<PlusOutlined />}
              onClick={handleAddKey}
              style={{ color: '#ccc' }}
            >
              添加键
            </Button>
          </Tooltip>
          <Button
            type="text"
            size="small"
            onClick={handleFormat}
            style={{ color: '#ccc', fontSize: 12 }}
          >
            格式化
          </Button>
        </Space>

        {/* JSON 校验状态指示器（紧凑圆点 + 工具提示） */}
        <Tooltip title={validationMessage || (validationStatus === 'valid' ? 'JSON 有效' : '校验中...')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'default' }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              display: 'inline-block',
              background: validationStatus === 'valid' ? '#4ec9b0'
                         : validationStatus === 'parsing' ? '#d4b106'
                         : '#f44747',
              transition: 'background 0.3s',
            }} />
            <span style={{ fontSize: 11, color: '#888' }}>
              {validationStatus === 'valid' ? '有效'
               : validationStatus === 'parsing' ? '校验中'
               : '错误'}
            </span>
          </div>
        </Tooltip>
      </div>

      {/* Monaco 编辑器 */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <MonacoEditor
          ref={editorRef}
          value={editorText}
          onChange={handleChange}
          onEditorMount={handleEditorMount}
          height="100%"
        />
      </div>
    </div>
  );
}
