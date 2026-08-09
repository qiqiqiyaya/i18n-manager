'use client';

import { useRef, useCallback, useEffect, useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Alert, Popover, Tag, Typography } from 'antd';
import type { editor } from 'monaco-editor';
import { useEditorStore } from '@/stores/editorStore';
import MonacoEditor, { type MonacoEditorHandle } from '@/components/json-editor/MonacoEditor';
import { flattenObject } from '@/lib/utils';
import type { TranslationObject } from '@/types/schema';

const { Text } = Typography;

/** 与自动保存防抖一致 */
const PARSE_DEBOUNCE = parseInt(
  process.env.NEXT_PUBLIC_AUTO_SAVE_DEBOUNCE || '1000',
  10
);

interface LocaleEditorProps {
  sendLocaleSave?: (lang: string, translations: TranslationObject) => void;
  /** 广播译文变更给其他客户端（timestamp/clientId 由 useSocket 内部注入） */
  sendLocaleUpdated?: (lang: string, translations: TranslationObject) => void;
  onScrollChange?: (ratio: number) => void;
}

/** LocaleEditor 句柄：MonacoEditorHandle + flushSave（Ctrl+S 手动保存） */
export type LocaleEditorHandle = MonacoEditorHandle & { flushSave: () => void };

const LocaleEditor = forwardRef<LocaleEditorHandle, LocaleEditorProps>(
  function LocaleEditor({ sendLocaleSave, sendLocaleUpdated, onScrollChange }, ref) {
  const editorRef = useRef<MonacoEditorHandle>(null);

  const activeLang = useEditorStore((s) => s.activeLang);
  const openLocales = useEditorStore((s) => s.openLocales);
  const schema = useEditorStore((s) => s.schema);
  const updateTranslation = useEditorStore((s) => s.updateTranslation);

  // 编辑器本地文本管理
  const [editorText, setEditorText] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const lastSyncedRef = useRef<string>('');
  const parseSubjectRef = useRef<Subject<string> | null>(null);
  const isEditingRef = useRef(false);
  // 标记程序正在通过 setValue 写入 Monaco，此时 onChange 回调应忽略
  // Monaco 的 setValue 即使值不变也会触发 onDidChangeContent，需要此标志防止误判用户编辑
  const isProgrammaticChangeRef = useRef(false);
  // 标记程序正在通过 syncEditorFromStore 写入 Monaco，此时 onDidChangeCursorPosition 回调应忽略
  // 避免外部数据更新（如添加键）导致 setValue 重置光标时误触发翻译参考层弹出
  const suppressCursorRef = useRef(false);
  // 用 ref 追踪最新 editorText，避免 blur handler 闭包过期
  const editorTextRef = useRef(editorText);
  editorTextRef.current = editorText;
  // 追踪上一个 activeLang，用于切 Tab 时 flush 旧语言编辑内容
  const prevActiveLangRef = useRef(activeLang);
  // 用 ref 存 activeLang/openLocales，供 handleBlur 使用，避免依赖变化导致 handleEditorMount 重建
  const activeLangRef = useRef(activeLang);
  activeLangRef.current = activeLang;
  const openLocalesRef = useRef(openLocales);
  openLocalesRef.current = openLocales;

  // 翻译参考浮层状态
  const [referenceKey, setReferenceKey] = useState<string | null>(null);
  const [referenceVisible, setReferenceVisible] = useState(false);

  // Schema 变更警告（用户编辑中时外部更新了数据）
  const [schemaChangeWarning, setSchemaChangeWarning] = useState(false);

  // ---------- 辅助：从 store 同步内容到 Monaco 编辑器 ----------
  // 序列化 → setEditorText → setValue（带 programmatic flag 防止误触发 onChange）
  // setValue 内部走最小编辑，Monaco 依据编辑范围自动调整光标，无需手动保存/恢复位置
  const syncEditorFromStore = useCallback(() => {
    if (!activeLang || !openLocales[activeLang]) return;

    const formatted = JSON.stringify(openLocales[activeLang], null, 2);
    setEditorText(formatted);
    lastSyncedRef.current = formatted;
    setValidationError(null);
    isProgrammaticChangeRef.current = true;
    editorRef.current?.setValue(formatted);
    isProgrammaticChangeRef.current = false;

    // 抑制 setValue 触发的 onDidChangeCursorPosition 事件，
    // 防止外部数据更新（如 Schema 添加键 → applyLocaleSync →
    // openLocales 变化）时意外弹出翻译参考层
    suppressCursorRef.current = true;
    queueMicrotask(() => { suppressCursorRef.current = false; });
  }, [activeLang, openLocales]);

  // ---------- 切换语言时强制同步编辑器 ----------
  // 用户切换 Tab → 先 flush 旧语言的编辑内容到 store，再加载新语言
  useEffect(() => {
    const prevLang = prevActiveLangRef.current;
    // 切走前：如果旧语言有未保存的编辑内容，flush 到 store（绕过防抖）
    // 不能用 parseLogic（其 useMemo 闭包中 activeLang 可能已变为新语言），
    // 直接用 updateTranslation + prevLang 确保写入正确的语言
    if (prevLang && prevLang !== activeLang && isEditingRef.current) {
      const text = editorTextRef.current;
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const currentHash = JSON.stringify(parsed);
          if (currentHash !== lastSyncedRef.current) {
            updateTranslation(prevLang, parsed);
            lastSyncedRef.current = currentHash;
            if (sendLocaleUpdated) {
              sendLocaleUpdated(prevLang, parsed);
            }
            if (sendLocaleSave) {
              sendLocaleSave(prevLang, parsed);
            }
          }
        }
      } catch {
        // JSON 不合法时不 flush（用户可能在编辑中途切换）
      }
    }

    isEditingRef.current = false;
    setSchemaChangeWarning(false);
    prevActiveLangRef.current = activeLang;

    if (activeLang && openLocales[activeLang]) {
      syncEditorFromStore();
    } else if (!activeLang) {
      setEditorText('');
    }
  }, [activeLang]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- 外部数据更新时（相同语言、openLocales 内容变化） ----------
  // 仅在用户未编辑时覆盖；用户编辑中则显示警告
  useEffect(() => {
    if (!activeLang) return;

    if (isEditingRef.current) {
      setSchemaChangeWarning(true);
      return;
    }

    setSchemaChangeWarning(false);

    const formatted = JSON.stringify(openLocales[activeLang], null, 2);
    if (formatted !== editorText) {
      syncEditorFromStore();
    }
  }, [openLocales]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- RxJS 防抖解析 JSON 并同步到 store ----------
  // 使用 Subject + debounceTime + distinctUntilChanged 替代手动 setTimeout/clearTimeout
  const parseLogic = useMemo(() => {
    return (rawText: string) => {
      if (!activeLang) return;

      try {
        const parsed = JSON.parse(rawText);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const cleanHash = JSON.stringify(parsed);
          // 内容无变化时跳过
          if (cleanHash === lastSyncedRef.current) {
            setValidationError(null);
            return;
          }

          // 标记编辑完成，防止 store 更新触发虚假的 Schema 更新警告
          isEditingRef.current = false;

          updateTranslation(activeLang, parsed);
          lastSyncedRef.current = cleanHash;
          setValidationError(null);

          // 广播给其他客户端（改动前译文完全不同步，这是本次修复的一部分）
          if (sendLocaleUpdated) {
            sendLocaleUpdated(activeLang, parsed);
          }

          // 通过 Socket.IO 持久化到磁盘（替代 HTTP PATCH）
          if (sendLocaleSave && activeLang) {
            sendLocaleSave(activeLang, parsed);
          }
        } else {
          setValidationError('译文必须是 JSON 对象（非数组）');
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'JSON 格式错误';
        setValidationError(msg);
      }
    };
  }, [activeLang, updateTranslation, sendLocaleUpdated, sendLocaleSave]);

  // ---------- 立即保存（Ctrl+S） ----------
  // 直接调用 parseLogic 绕过防抖；parseLogic 内含内容哈希去重（无变化则跳过）
  const flushSave = useCallback(() => {
    if (!activeLang) return;
    const text = editorTextRef.current;
    parseLogic(text);
  }, [activeLang, parseLogic]);

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
      debounceTime(PARSE_DEBOUNCE),
      distinctUntilChanged()
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
      setValidationError(null);
      parseSubjectRef.current?.next(value);
    },
    []  // parseSubjectRef 是 ref，不需要依赖
  );

  // ---------- 失去焦点时校验并同步 sanitized 内容 ----------
  // 注：使用 ref 而非 editorText state，因为 blur handler 在
  // onEditorMount 中注册（仅一次），闭包会捕获过期的 editorText
  // 同时用 ref 存 activeLang/openLocales，避免依赖变化导致 handleEditorMount 重建
  const handleBlur = useCallback(() => {
    isEditingRef.current = false;
    const lang = activeLangRef.current;
    const locales = openLocalesRef.current;
    // 从 store 同步 sanitized 内容回编辑器（补回误删的 key，值为空）
    if (lang && locales[lang]) {
      const sanitized = JSON.stringify(locales[lang], null, 2);
      if (sanitized !== editorTextRef.current) {
        setEditorText(sanitized);
        lastSyncedRef.current = sanitized;
        isProgrammaticChangeRef.current = true;
        editorRef.current?.setValue(sanitized);
        isProgrammaticChangeRef.current = false;
      }
    }
    const text = editorTextRef.current;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        setValidationError(null);
      } else {
        setValidationError('译文必须是 JSON 对象（非数组）');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'JSON 格式错误';
      setValidationError(msg);
    }
  }, []); // 空依赖：全部通过 ref 读取最新值

  // ---------- 推断光标位置的完整键路径 ----------
  // 支持嵌套结构：向上扫描以更浅缩进开启对象且包裹当前键的父级，拼出点分路径
  // 例：{"a": {"b": "x"}} 光标在 "b" 行 → 返回 "a.b"
  const inferKeyPath = useCallback((model: editor.ITextModel, lineNumber: number): string | null => {
    const currentLine = model.getLineContent(lineNumber);
    const keyMatch = currentLine.match(/^\s*"([^"]+)"\s*:/);
    if (!keyMatch) return null;

    const path: string[] = [keyMatch[1]];
    const currentIndent = (currentLine.match(/^\s*/)?.[0] ?? '').length;
    let parentIndent = currentIndent;

    // 向上扫描寻找父级键（缩进更浅、且开启对象包裹当前键）
    for (let i = lineNumber - 1; i >= 1; i--) {
      const line = model.getLineContent(i);
      const trimmed = line.trim();
      if (!trimmed) continue;

      const indent = (line.match(/^\s*/)?.[0] ?? '').length;
      if (indent >= parentIndent) continue;

      const parentMatch = line.match(/^\s*"([^"]+)"\s*:\s*\{/);
      if (parentMatch) {
        path.unshift(parentMatch[1]);
        parentIndent = indent;
      }
    }

    return path.join('.');
  }, []);

  const handleCursorPosition = useCallback(() => {
    if (suppressCursorRef.current) return;
    const editor = editorRef.current?.getEditor();
    if (!editor || !activeLang) return;

    const position = editor.getPosition();
    if (!position) return;

    const model = editor.getModel();
    if (!model) return;

    const key = inferKeyPath(model, position.lineNumber);
    if (key) {
      setReferenceKey(key);
      setReferenceVisible(true);
    } else {
      setReferenceVisible(false);
    }
  }, [activeLang, inferKeyPath]);

  // ---------- Monaco 编辑器挂载时注册事件监听 ----------
  // 稳定引用：配合 MonacoEditor 的 React.memo 防止不必要的重渲染级联
  const handleEditorMount = useCallback((editorInstance: editor.IStandaloneCodeEditor) => {
    editorInstance.onDidChangeCursorPosition(() => {
      handleCursorPosition();
    });
    editorInstance.onDidBlurEditorText(() => {
      handleBlur();
    });
  }, [handleCursorPosition, handleBlur]);

  // ---------- 翻译参考数据 ----------
  const getReferenceData = useCallback(() => {
    if (!referenceKey) return null;

    const schemaFlat = flattenObject(schema);
    const description = schemaFlat[referenceKey] || '';

    const otherTranslations: Array<{ lang: string; value: string }> = [];
    for (const [lang, translations] of Object.entries(openLocales)) {
      if (lang === activeLang) continue;
      const flat = flattenObject(translations);
      if (referenceKey in flat) {
        otherTranslations.push({ lang, value: String(flat[referenceKey]) });
      }
    }

    return { key: referenceKey, description, otherTranslations };
  }, [referenceKey, schema, openLocales, activeLang]);

  // ---------- 空状态 ----------
  if (!activeLang) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 200px)', color: '#999' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 16, marginBottom: 8 }}>暂无语言</p>
          <p>请点击 &quot;+&quot; 按钮添加语言</p>
        </div>
      </div>
    );
  }

  const referenceData = getReferenceData();

  const referenceContent = referenceData ? (
    <div style={{ maxWidth: 400, fontSize: 13 }}>
      <div style={{ marginBottom: 8 }}>
        <Text strong style={{ fontSize: 13 }}>键名：</Text>
        <Text code style={{ fontSize: 12 }}>{referenceData.key}</Text>
      </div>
      {referenceData.description && (
        <div style={{ marginBottom: 8 }}>
          <Text strong style={{ fontSize: 13 }}>说明：</Text>
          <Text style={{ fontSize: 12 }}>{referenceData.description}</Text>
        </div>
      )}
      {referenceData.otherTranslations.length > 0 && (
        <div>
          <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>其他语言译文：</Text>
          {referenceData.otherTranslations.map((t) => (
            <div key={t.lang} style={{ marginBottom: 4 }}>
              <Tag style={{ fontSize: 11 }}>{t.lang}</Tag>
              <Text style={{ fontSize: 12 }}>{t.value}</Text>
            </div>
          ))}
        </div>
      )}
      {referenceData.otherTranslations.length === 0 && (
        <Text type="secondary" style={{ fontSize: 12 }}>其他语言中暂无此键的译文</Text>
      )}
    </div>
  ) : null;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* 条件提示（绝对定位浮层，不挤占编辑器空间，保持与 Schema 编辑器高度一致） */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, display: 'flex', flexDirection: 'column' }}>
        {schemaChangeWarning && (
          <div style={{ padding: '4px 12px', background: '#fffbe6', borderBottom: '1px solid #ffe58f', fontSize: 12, color: '#d48806' }}>
            <span role="img" aria-label="warning">⚠️</span> Schema 已更新，完成编辑后保存以应用新结构
          </div>
        )}

        {validationError && (
          <Alert
            title={validationError}
            type="error"
            showIcon
            closable
            onClose={() => setValidationError(null)}
            style={{
              padding: '4px 12px',
              fontSize: 12,
              borderRadius: 0,
              border: 'none',
            }}
          />
        )}
      </div>

      {/* 翻译参考 + 编辑器 */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <Popover
          content={referenceContent}
          open={referenceVisible && !!referenceData}
          onOpenChange={setReferenceVisible}
          placement="rightTop"
          trigger={['click']}
          title="翻译参考"
        >
          <div style={{ height: '100%' }} onClick={handleCursorPosition}>
            <MonacoEditor
              ref={editorRef}
              value={editorText}
              onChange={handleChange}
              height="100%"
              onEditorMount={handleEditorMount}
              onScrollChange={onScrollChange}
            />
          </div>
        </Popover>
      </div>
    </div>
  );
});

export default LocaleEditor;
