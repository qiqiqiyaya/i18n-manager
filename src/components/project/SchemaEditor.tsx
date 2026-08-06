'use client';

import { useRef, useCallback, useEffect, useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Button, Space, Tooltip } from 'antd';
import { PlusOutlined, CheckCircleFilled, CloseCircleFilled, ExclamationCircleFilled, SyncOutlined, SortAscendingOutlined } from '@ant-design/icons';
import { useEditorStore } from '@/stores/editorStore';
import MonacoEditor, { type MonacoEditorHandle } from '@/components/json-editor/MonacoEditor';
import { flattenObject, getLeafPaths, determineInsertionPath, buildInsertEdit } from '@/lib/utils';
import type { SchemaUpdatedPayload } from '@/types/collaboration';
import type { SchemaObject } from '@/types/schema';
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
  sendSchemaSave?: (data: { schema: SchemaObject; addedKeys: string[]; removedKeys: string[] }) => void;
  socketId?: string;
  onScrollChange?: (ratio: number) => void;
}

/** SchemaEditor 句柄：MonacoEditorHandle + flushSave（Ctrl+S 手动保存） */
export type SchemaEditorHandle = MonacoEditorHandle & { flushSave: () => void };

const SchemaEditor = forwardRef<SchemaEditorHandle, SchemaEditorProps>(
  function SchemaEditor({ sendSchemaUpdated, sendSchemaSave, socketId, onScrollChange }, ref) {
  const editorRef = useRef<MonacoEditorHandle>(null);

  const schema = useEditorStore((s) => s.schema);
  const openLocales = useEditorStore((s) => s.openLocales);
  const updateSchema = useEditorStore((s) => s.updateSchema);
  const applyLocaleSync = useEditorStore((s) => s.applyLocaleSync);
  const saveStatus = useEditorStore((s) => s.saveStatus);
  const saveError = useEditorStore((s) => s.saveError);
  const sortAllKeys = useEditorStore((s) => s.sortAllKeys);

  // Monaco 编辑器实例引用（用于添加标记）
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
  const editorInstanceRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  // 编辑器当前文本（本地管理，不与 store 强绑定）
  const [editorText, setEditorText] = useState(() => JSON.stringify(schema, null, 2));
  // JSON 校验状态：'valid' | 'invalid' | 'parsing'
  const [validationStatus, setValidationStatus] = useState<'valid' | 'invalid' | 'parsing'>('valid');
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  // 上次成功同步到 store 的 schema JSON hash（用于避免重复同步）
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

  // Schema 变更警告（用户编辑中时外部更新了数据）
  const [schemaChangeWarning, setSchemaChangeWarning] = useState(false);

  // 标记 store 变更是否由本用户的操作触发（阻止回写覆盖编辑器）
  const isSelfOriginatedChangeRef = useRef(false);
  // 标记程序正在通过 setValue 写入 Monaco，此时 onChange 回调应忽略
  const isProgrammaticChangeRef = useRef(false);

  // ---------- 接收外部 store 更新（如 WebSocket 广播后的数据重载） ----------
  useEffect(() => {
    // 自身操作触发的 store 变更，跳过（编辑器已保持用户输入的文本）
    if (isSelfOriginatedChangeRef.current) return;

    if (isEditingRef.current) {
      // 外部更新到达但用户正在编辑，显示警告
      setSchemaChangeWarning(true);
      return;
    }

    setSchemaChangeWarning(false);

    // Schema 现在是嵌套结构，直接显示
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
      isProgrammaticChangeRef.current = true;
      editorRef.current?.setValue(formatted);
      isProgrammaticChangeRef.current = false;

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
  // 用户输入保持原始 JSON 结构（嵌套），直接存入 store
  const parseLogic = useMemo(() => {
    return (rawText: string) => {
      setValidationStatus('parsing');
      setValidationMessage(null);

      try {
        const parsed = JSON.parse(rawText);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const parsedHash = JSON.stringify(parsed);
          // 去重：内容无变化则不重复同步
          if (parsedHash === lastSyncedRef.current) {
            setValidationStatus('valid');
            setValidationMessage(null);
            setMonacoMarkers(null);
            return;
          }

          // 通过 ref 读取最新 schema，不依赖闭包
          const currentSchema = schemaRef.current;

          // 扁平化计算 diff：新增键、删除键、重命名检测
          const oldFlatKeys = Object.keys(flattenObject(currentSchema));
          const newFlatKeys = getLeafPaths(parsed);
          const newKeys = newFlatKeys.filter((key) => !oldFlatKeys.includes(key));
          const removedKeys = oldFlatKeys.filter((key) => !newFlatKeys.includes(key));
          const renameMap = detectRenames(removedKeys, newKeys);

          // 从 removedKeys 中移除已被 renameMap 覆盖的键
          const effectiveRemovedKeys = removedKeys.filter((key) => !(key in renameMap));

          // 标记为自身操作触发，阻止 useEffect 回写
          isSelfOriginatedChangeRef.current = true;
          setTimeout(() => { isSelfOriginatedChangeRef.current = false; }, 0);

          updateSchema(parsed);
          lastSyncedRef.current = parsedHash;
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
              schema: parsed,
              addedKeys: newKeys,
              removedKeys: effectiveRemovedKeys,
              renameMap: Object.keys(renameMap).length > 0 ? renameMap : undefined,
              timestamp: Date.now(),
              clientId: socketId || '',
            });
          }

          // 通过 Socket.IO 持久化到磁盘
          if (sendSchemaSave) {
            sendSchemaSave({
              schema: parsed,
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

  // ---------- 立即保存（Ctrl+S） ----------
  // 直接调用 parseLogic 绕过防抖；parseLogic 内含内容哈希去重（无变化则跳过）
  const flushSave = useCallback(() => {
    const text = editorTextRef.current;
    parseLogic(text);
  }, [parseLogic]);

  // 向外暴露内部 editorRef（同步滚动）+ flushSave（手动保存）
  useImperativeHandle(ref, () => ({
    getValue: () => editorRef.current?.getValue() ?? '',
    setValue: (value: string) => editorRef.current?.setValue(value),
    focus: () => editorRef.current?.focus(),
    find: (term: string) => editorRef.current?.find(term),
    formatDocument: () => editorRef.current?.formatDocument(),
    getEditor: () => editorRef.current?.getEditor() ?? null,
    getCursorPosition: () => editorRef.current?.getCursorPosition() ?? null,
    scrollToRatio: (ratio: number) => editorRef.current?.scrollToRatio(ratio),
    flushSave,
  }), [flushSave]);

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
      // 程序写入（setValue）触发的 onChange，跳过
      if (isProgrammaticChangeRef.current) return;
      isEditingRef.current = true;
      setEditorText(value);
      // 防抖结束后会通过 parseLogic 更新状态，此处不需要立即清除
      parseSubjectRef.current?.next(value);
    },
    []  // parseSubjectRef 是 ref，不需要依赖
  );

  // ---------- 失去焦点时立即尝试解析 ----------
  const handleBlur = useCallback(() => {
    isEditingRef.current = false;
    setSchemaChangeWarning(false);
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
  }, [setMonacoMarkers]);

  // ---------- Monaco 编辑器挂载时注册 blur 监听 + 保存 monaco 实例 ----------
  const handleEditorMount = useCallback((editorInstance: editor.IStandaloneCodeEditor) => {
    try {
      editorInstanceRef.current = editorInstance;
      // monaco 实例通过全局访问（@monaco-editor/react 挂载到 window.monaco）
      monacoRef.current = (window as { monaco?: unknown }).monaco as typeof import('monaco-editor');
    } catch {
      // 静默失败，标记功能降级
    }
    editorInstance.onDidBlurEditorText(() => {
      handleBlur();
    });
  }, [handleBlur]);

  // ---------- 快速添加键（辅助功能，光标感知） ----------
  const handleAddKey = useCallback(() => {
    // 获取光标位置
    const editor = editorRef.current?.getEditor();
    if (!editor) return;
    const position = editor.getPosition();
    if (!position) return;

    const text = editorTextRef.current;
    const lines = text.split('\n');
    const cursorLineIdx = position.lineNumber - 1;
    const cursorLine = lines[cursorLineIdx];
    if (!cursorLine) return;

    // 确定插入路径（用于 store 同步）
    const path = determineInsertionPath(text, cursorLineIdx);

    // 从编辑器当前 JSON 文本解析嵌套结构
    let currentNested: SchemaObject;
    try {
      currentNested = JSON.parse(text) as SchemaObject;
    } catch {
      // JSON 解析失败时中止操作，防止清空编辑器
      return;
    }
    if (!currentNested || typeof currentNested !== 'object' || Array.isArray(currentNested)) {
      return;
    }

    // 导航到目标对象，生成唯一 key 名
    let target = currentNested;
    for (const segment of path) {
      if (!target || typeof target !== 'object' || Array.isArray(target)) {
        return;
      }
      target = target[segment] as Record<string, unknown>;
      if (!target || typeof target !== 'object' || Array.isArray(target)) {
        return;
      }
    }

    const existingKeys = Object.keys(target);
    const targetHasKeys = existingKeys.length > 0;
    const baseKey = 'new_key';
    let key = baseKey;
    let counter = 1;
    while (existingKeys.includes(key)) {
      key = `${baseKey}_${counter}`;
      counter++;
    }

    // 根据光标上下文决定插入位置和文本
    const currentIndent = cursorLine.match(/^\s*/)?.[0] || '';

    // 使用纯函数构建编辑操作（传入 targetHasKeys 以决定是否需要尾逗号）
    const editDesc = buildInsertEdit(cursorLine, currentIndent, key, targetHasKeys);
    let targetLineNumber: number;
    let targetColumn: number;
    if (editDesc.column != null) {
      targetLineNumber = position.lineNumber;
      targetColumn = editDesc.column;
    } else if (editDesc.insertAtStart) {
      // 插入到上一行行尾（用于 } 情况：在上一行加逗号 + 新 key）
      const prevLineIdx = position.lineNumber - 2;
      if (prevLineIdx >= 0 && prevLineIdx < lines.length) {
        targetLineNumber = position.lineNumber - 1;
        targetColumn = lines[prevLineIdx].length + 1;
      } else {
        targetLineNumber = position.lineNumber;
        targetColumn = 1;
      }
    } else {
      targetLineNumber = position.lineNumber;
      targetColumn = cursorLine.length + 1;
    }
    const edit = {
      range: {
        startLineNumber: targetLineNumber,
        startColumn: targetColumn,
        endLineNumber: targetLineNumber,
        endColumn: targetColumn,
      },
      text: editDesc.text,
    };

    // 执行 Monaco 文本编辑（光标自然停留在插入点）
    isProgrammaticChangeRef.current = true;
    editor.executeEdits('add-key', [edit]);
    editor.focus();
    isProgrammaticChangeRef.current = false;

    // 读取编辑后的完整文本
    const updatedText = editor.getValue();
    setEditorText(updatedText);
    lastSyncedRef.current = updatedText;
    setValidationStatus('valid');
    setValidationMessage(null);

    // 标记为自身操作，阻止 useEffect 回写
    isSelfOriginatedChangeRef.current = true;
    setTimeout(() => { isSelfOriginatedChangeRef.current = false; }, 0);

    // 解析更新后的 JSON 用于 store/network 同步
    let updatedNested: SchemaObject;
    try {
      updatedNested = JSON.parse(updatedText) as SchemaObject;
    } catch {
      updatedNested = currentNested;
    }

    updateSchema(updatedNested);

    // 触发防抖解析管道（自动保存等）
    parseSubjectRef.current?.next(updatedText);

    // 扁平化键路径用于 locale 同步
    const flatSchema = flattenObject(schema);
    const newFlatKeys = getLeafPaths(updatedNested);
    const newKeys = newFlatKeys.filter((k) => !(k in flatSchema));

    applyLocaleSync(newKeys, []);

    // 广播 Schema 变更
    if (sendSchemaUpdated) {
      sendSchemaUpdated({
        schema: updatedNested,
        addedKeys: newKeys,
        removedKeys: [],
        timestamp: Date.now(),
        clientId: socketId || '',
      });
    }

    // 通过 Socket.IO 持久化到磁盘
    if (sendSchemaSave) {
      sendSchemaSave({
        schema: updatedNested,
        addedKeys: newKeys,
        removedKeys: [],
      });
    }
  }, [schema, updateSchema, applyLocaleSync, sendSchemaUpdated, sendSchemaSave, socketId]);

  // ---------- 格式化文档 ----------
  const handleFormat = useCallback(() => {
    editorRef.current?.formatDocument();
  }, []);

  const handleSort = useCallback(() => {
    sortAllKeys();
    // 排序后自动保存 Schema 到磁盘
    if (sendSchemaSave) {
      const state = useEditorStore.getState();
      const newFlatKeys = getLeafPaths(state.schema);
      sendSchemaSave({
        schema: state.schema,
        addedKeys: newFlatKeys,
        removedKeys: [],
      });
    }
  }, [sortAllKeys, sendSchemaSave]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 工具栏 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 32,
          padding: '0 8px',
          boxSizing: 'border-box',
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
          <Tooltip title="将 Schema 和所有译文的 key 按字典序排序并保存">
            <Button
              type="text"
              size="small"
              icon={<SortAscendingOutlined />}
              onClick={handleSort}
              style={{ color: '#ccc' }}
            >
              排序
            </Button>
          </Tooltip>
        </Space>

        {/* 保存状态 + JSON 校验指示器（右上角工具栏） */}
        <Tooltip title={
          validationMessage
            || (saveStatus === 'error' ? saveError : null)
            || (saveStatus === 'idle' ? '已保存' : null)
        }>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'default' }}>
            {validationStatus === 'invalid' ? (
              <>
                <CloseCircleFilled style={{ color: '#f44747', fontSize: 12 }} />
                <span style={{ fontSize: 11, color: '#f44747' }}>{validationMessage || 'JSON 错误'}</span>
              </>
            ) : saveStatus === 'saving' ? (
              <>
                <SyncOutlined spin style={{ color: '#1890ff', fontSize: 12 }} />
                <span style={{ fontSize: 11, color: '#1890ff' }}>保存中...</span>
              </>
            ) : saveStatus === 'error' ? (
              <>
                <CloseCircleFilled style={{ color: '#f44747', fontSize: 12 }} />
                <span style={{ fontSize: 11, color: '#f44747' }}>保存失败</span>
              </>
            ) : saveStatus === 'dirty' ? (
              <>
                <ExclamationCircleFilled style={{ color: '#d4b106', fontSize: 12 }} />
                <span style={{ fontSize: 11, color: '#d4b106' }}>未保存</span>
              </>
            ) : (
              <>
                <CheckCircleFilled style={{ color: '#4ec9b0', fontSize: 12 }} />
                <span style={{ fontSize: 11, color: '#4ec9b0' }}>
                  {validationStatus === 'parsing' ? '校验中' : '已保存'}
                </span>
              </>
            )}
          </div>
        </Tooltip>
      </div>

      {/* Schema 变更警告（用户编辑中时外部 Schema 更新） */}
      {schemaChangeWarning && (
        <div style={{ padding: '4px 8px', background: '#fffbe6', borderBottom: '1px solid #ffe58f', fontSize: 12, color: '#d48806', flexShrink: 0 }}>
          <span role="img" aria-label="warning">⚠️</span> Schema 已被他人更新，完成编辑后即可刷新
        </div>
      )}

      {/* Monaco 编辑器 */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <MonacoEditor
          ref={editorRef}
          value={editorText}
          onChange={handleChange}
          onEditorMount={handleEditorMount}
          onScrollChange={onScrollChange}
          height="100%"
        />
      </div>
    </div>
  );
});

export default SchemaEditor;