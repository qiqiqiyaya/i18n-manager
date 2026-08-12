'use client';

import { useRef, useCallback, useEffect, useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Button, Space, Tooltip, message as antdMessage } from 'antd';
import { PlusOutlined, CheckCircleFilled, CloseCircleFilled, ExclamationCircleFilled, SyncOutlined, SortAscendingOutlined, AlignLeftOutlined, BranchesOutlined } from '@ant-design/icons';
import { useEditorStore } from '@/stores/editorStore';
import MonacoEditor, { type MonacoEditorHandle } from '@/components/json-editor/MonacoEditor';
import DuplicateKeysDrawer from '@/components/project/DuplicateKeysDrawer';
import { flattenObject, getLeafPaths, determineInsertionPath, buildInsertEdit } from '@/lib/utils';
import { inferKeyPath, findKeyLine, computeEditorAnchor } from '@/lib/monaco-reveal';
import { findDuplicateKeys, type DuplicateGroup } from '@/lib/duplicate-keys';
import type { SchemaUpdatedPayload } from '@/types/collaboration';
import type { ReferenceTokenPayload } from '@/types/reference';
import type { SchemaObject } from '@/types/schema';
import type { editor } from 'monaco-editor';

/** 自动保存防抖延迟与 Schema 校验防抖共享同一值 */
const PARSE_DEBOUNCE = parseInt(
  process.env.NEXT_PUBLIC_AUTO_SAVE_DEBOUNCE || '1000',
  10
);

/** 「速查」token 上报防抖（毫秒） */
const REFERENCE_DEBOUNCE = 200;
/** token 为选中文本时允许的最大长度（超出视为误选，不上报） */
const MAX_TOKEN_LENGTH = 120;

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
  /** timestamp/clientId 由 useSocket 内部注入（含时钟校准），调用方无需传 */
  sendSchemaUpdated?: (
    data: Omit<SchemaUpdatedPayload, 'projectId' | 'timestamp' | 'clientId'>
  ) => void;
  sendSchemaSave?: (data: { schema: SchemaObject; addedKeys: string[]; removedKeys: string[] }) => void;
  onScrollChange?: (ratio: number) => void;
  /** 「速查」token 上报（选中/光标 → token + 屏幕锚点；null 表示当前位置无 token） */
  onReferenceToken?: (payload: ReferenceTokenPayload | null) => void;
}

/** SchemaEditor 句柄：MonacoEditorHandle + flushSave（Ctrl+S 手动保存）+ revealKey（速查跳转定位） */
export type SchemaEditorHandle = MonacoEditorHandle & {
  flushSave: () => void;
  revealKey: (keyPath: string) => void;
};

const SchemaEditor = forwardRef<SchemaEditorHandle, SchemaEditorProps>(
  function SchemaEditor({ sendSchemaUpdated, sendSchemaSave, onScrollChange, onReferenceToken }, ref) {
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
  // 「速查」token 上报防抖 Subject
  const referenceSubjectRef = useRef<Subject<void> | null>(null);

  // Schema 变更警告（用户编辑中时外部更新了数据）
  const [schemaChangeWarning, setSchemaChangeWarning] = useState(false);

  // ---------- 重复键检测（按钮触发的一次性审计） ----------
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [duplicateDrawerOpen, setDuplicateDrawerOpen] = useState(false);

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
      setEditorText(formatted);
      lastSyncedRef.current = formatted;
      setValidationStatus('valid');
      setValidationMessage(null);
      // setValue 内部走最小编辑，Monaco 会依据编辑范围自动调整光标，
      // 不需要手动保存/恢复光标与滚动位置（手动恢复反而会把光标拽回过期位置）
      isProgrammaticChangeRef.current = true;
      editorRef.current?.setValue(formatted);
      isProgrammaticChangeRef.current = false;
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

          // R8: 标记编辑完成，与 LocaleEditor.parseLogic 行为对齐。
          // 否则「编辑中」状态会一直持续到失焦，导致远端更新到达时长期挂着警告条
          isEditingRef.current = false;

          updateSchema(parsed);
          lastSyncedRef.current = parsedHash;
          setValidationStatus('valid');
          setValidationMessage(null);
          setMonacoMarkers(null);

          // 使用 applyLocaleSync 统一同步 locale（支持 renameMap 迁移值）
          if (newKeys.length > 0 || effectiveRemovedKeys.length > 0 || Object.keys(renameMap).length > 0) {
            applyLocaleSync(newKeys, effectiveRemovedKeys, renameMap);
          }

          // 广播 Schema 变更给其他客户端。
          // 无条件广播：仅改 key 的 value（说明文字）时 addedKeys/removedKeys 均为空，
          // 旧实现在此加了键增删条件门，导致值变更永远不同步（本次修复的主因）
          if (sendSchemaUpdated) {
            sendSchemaUpdated({
              schema: parsed,
              addedKeys: newKeys,
              removedKeys: effectiveRemovedKeys,
              renameMap: Object.keys(renameMap).length > 0 ? renameMap : undefined,
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
  }, [updateSchema, applyLocaleSync, sendSchemaUpdated, sendSchemaSave, setMonacoMarkers]);

  // ---------- 立即保存（Ctrl+S） ----------
  // 直接调用 parseLogic 绕过防抖；parseLogic 内含内容哈希去重（无变化则跳过）
  const flushSave = useCallback(() => {
    const text = editorTextRef.current;
    parseLogic(text);
  }, [parseLogic]);

  // ---------- 「速查」token 上报 ----------
  // 选中非空 → 用选中文本查；无选中 → 光标落在键行则用键路径查（Q1-C 退化触发）。
  // 防抖 + 编辑中/程序写入抑制，避免打字、滚动时反复触发。
  const emitReference = useCallback(() => {
    if (isEditingRef.current || isProgrammaticChangeRef.current) return;
    const editorInstance = editorRef.current?.getEditor();
    const model = editorInstance?.getModel();
    if (!editorInstance || !model) return;

    const sel = editorInstance.getSelection();
    let token: string | null = null;
    let position = editorInstance.getPosition();

    if (sel && !sel.isEmpty()) {
      const text = model.getValueInRange(sel).trim();
      if (text.length > 0 && text.length <= MAX_TOKEN_LENGTH) {
        token = text;
        position = sel.getStartPosition();
      }
    } else if (position) {
      const keyPath = inferKeyPath(model, position.lineNumber);
      if (keyPath) token = keyPath;
    }

    if (token && position) {
      onReferenceToken?.({ token, anchor: computeEditorAnchor(editorInstance, position) });
    } else {
      onReferenceToken?.(null);
    }
  }, [onReferenceToken]);

  useEffect(() => {
    const subject = new Subject<void>();
    referenceSubjectRef.current = subject;
    const subscription = subject.pipe(debounceTime(REFERENCE_DEBOUNCE)).subscribe(() => {
      emitReference();
    });
    return () => {
      subscription.unsubscribe();
      referenceSubjectRef.current = null;
    };
  }, [emitReference]);

  // 向外暴露内部 editorRef（同步滚动）+ flushSave（手动保存）+ revealKey（速查跳转定位）
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
    // 定位到指定点分键路径所在行并聚焦；行未找到 → 静默跳过
    revealKey: (keyPath: string) => {
      const editorInstance = editorRef.current?.getEditor();
      const model = editorInstance?.getModel();
      if (!editorInstance || !model) return;
      const line = findKeyLine(model, keyPath);
      if (line === null) return;
      editorInstance.revealLineInCenter(line);
      editorInstance.setPosition({ lineNumber: line, column: 1 });
      editorInstance.focus();
    },
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
    // 「速查」token 上报：选中/光标变化 → 防抖后计算 token + 锚点
    editorInstance.onDidChangeCursorSelection(() => {
      referenceSubjectRef.current?.next();
    });
    editorInstance.onDidChangeCursorPosition(() => {
      referenceSubjectRef.current?.next();
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
  }, [schema, updateSchema, applyLocaleSync, sendSchemaUpdated, sendSchemaSave]);

  // ---------- 格式化文档 ----------
  const handleFormat = useCallback(() => {
    editorRef.current?.formatDocument();
  }, []);

  // ---------- 重复键检测 ----------
  // 检测输入是编辑器原文而非 store 已解析对象：store 落后一个 debounce 窗口
  // （默认 1000ms），用 store 会让用户改完一秒内点按钮看到旧结果，
  // 破坏「报告 = 屏幕内容」契约——按钮为此专门置灰，不该在数据源上放弃它。
  const handleCheckDuplicates = useCallback(() => {
    const text = editorRef.current?.getValue() ?? '';
    const groups = findDuplicateKeys(text);

    if (groups === null) {
      // 兜底：正常情况下已被 disabled 拦住
      antdMessage.error('JSON 格式错误，无法检测');
      return;
    }
    if (groups.length === 0) {
      antdMessage.success('未发现重复键');
      return;
    }

    setDuplicateGroups(groups);
    setDuplicateDrawerOpen(true);
  }, []);

  /** offset → 1-based 行号，供 Drawer 显示 L{n} */
  const getLineNumber = useCallback((offset: number): number | null => {
    const model = editorRef.current?.getEditor()?.getModel();
    if (!model) return null;
    // offset 在检测时刻记录；若用户此后编辑过，超出范围的 offset 会被
    // Monaco 钳制到文档末尾，故显式判界返回 null 而不是给出错误行号
    if (offset > model.getValueLength()) return null;
    return model.getPositionAt(offset).lineNumber;
  }, []);

  /** 跳转到 offset 所在行：滚动居中 + 定位光标 + 短暂高亮该行 */
  const handleJumpToOffset = useCallback((offset: number) => {
    const editorInstance = editorRef.current?.getEditor();
    const model = editorInstance?.getModel();
    if (!editorInstance || !model) return;

    const position = model.getPositionAt(offset);
    editorInstance.revealLineInCenter(position.lineNumber);
    editorInstance.setPosition(position);
    editorInstance.focus();

    // 临时高亮 1.5s：Drawer 不遮挡左栏，用户需要视觉锚点确认落点。
    // 用 createDecorationsCollection（实例方法）而非 deltaDecorations（已弃用），
    // 前者不需要 window.monaco 命名空间。
    const decorations = editorInstance.createDecorationsCollection([
      {
        range: {
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: 1,
        },
        options: { isWholeLine: true, className: 'dup-key-flash' },
      },
    ]);
    setTimeout(() => decorations.clear(), 1500);
  }, []);

  const handleSort = useCallback(() => {
    sortAllKeys();
    const state = useEditorStore.getState();
    // 排序不增删键，仅改变键顺序，故 addedKeys/removedKeys 均为空
    if (sendSchemaUpdated) {
      sendSchemaUpdated({
        schema: state.schema,
        addedKeys: [],
        removedKeys: [],
      });
    }
    // 排序后自动保存 Schema 到磁盘
    if (sendSchemaSave) {
      sendSchemaSave({
        schema: state.schema,
        addedKeys: [],
        removedKeys: [],
      });
    }
  }, [sortAllKeys, sendSchemaUpdated, sendSchemaSave]);

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

          {/* 工具组：纯图标按钮，用略亮的色块背景与主操作区分，提高辨识度 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              padding: '0 4px',
              borderRadius: 4,
              background: '#2d2d30',
              border: '1px solid #3a3a3c',
            }}
          >
            <Tooltip title="格式化 JSON">
              <Button
                type="text"
                size="small"
                aria-label="格式化"
                icon={<AlignLeftOutlined />}
                onClick={handleFormat}
                style={{ color: '#ccc' }}
              />
            </Tooltip>
            <Tooltip title="将 Schema 和所有译文的 key 按字典序排序并保存">
              <Button
                type="text"
                size="small"
                aria-label="排序"
                icon={<SortAscendingOutlined />}
                onClick={handleSort}
                style={{ color: '#ccc' }}
              />
            </Tooltip>
            <Tooltip
              title={
                validationStatus === 'invalid'
                  ? 'JSON 格式错误，请先修正后再检测'
                  : '检测键名相同但路径不同的重复键'
              }
            >
              {/* 必须包一层 span：disabled 的 Button 不派发鼠标事件，
                  Tooltip 直接包裹会导致悬停无提示 */}
              <span style={{ display: 'inline-flex' }}>
                <Button
                  type="text"
                  size="small"
                  aria-label="重复键检测"
                  icon={<BranchesOutlined />}
                  disabled={validationStatus === 'invalid'}
                  onClick={handleCheckDuplicates}
                  style={{ color: validationStatus === 'invalid' ? '#666' : '#ccc' }}
                />
              </span>
            </Tooltip>
          </div>
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

      {/* 重复键检测结果抽屉 */}
      <DuplicateKeysDrawer
        open={duplicateDrawerOpen}
        onClose={() => setDuplicateDrawerOpen(false)}
        groups={duplicateGroups}
        getLineNumber={getLineNumber}
        onJumpTo={handleJumpToOffset}
      />
    </div>
  );
});

export default SchemaEditor;