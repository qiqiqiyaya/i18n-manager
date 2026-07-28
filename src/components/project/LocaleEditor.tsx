'use client';

import { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Alert, Popover, Tag, Typography } from 'antd';
import { CheckCircleFilled, CloseCircleFilled } from '@ant-design/icons';
import { useEditorStore } from '@/stores/editorStore';
import { useCollaborationStore } from '@/stores/collaborationStore';
import MonacoEditor, { type MonacoEditorHandle } from '@/components/json-editor/MonacoEditor';
import { flattenObject } from '@/lib/utils';

const { Text } = Typography;

/** 与自动保存防抖一致 */
const PARSE_DEBOUNCE = parseInt(
  process.env.NEXT_PUBLIC_AUTO_SAVE_DEBOUNCE || '1000',
  10
);

interface LocaleEditorProps {
  sendLocaleSave?: (lang: string, translations: Record<string, any>) => void;
}

export default function LocaleEditor({ sendLocaleSave }: LocaleEditorProps) {
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
  // 用 ref 追踪最新 editorText，避免 blur handler 闭包过期
  const editorTextRef = useRef(editorText);
  editorTextRef.current = editorText;

  // 翻译参考浮层状态
  const [referenceKey, setReferenceKey] = useState<string | null>(null);
  const [referenceVisible, setReferenceVisible] = useState(false);

  // 当前语言的所有锁定键
  const locks = useCollaborationStore((s) => s.locks);
  const activeLocks = activeLang ? locks[activeLang] || {} : {};

  // Schema 变更警告（用户编辑中时外部更新了数据）
  const [schemaChangeWarning, setSchemaChangeWarning] = useState(false);

  // ---------- 切换语言或外部数据更新时同步到编辑器 ----------
  // 仅在用户未主动编辑时覆盖编辑器内容
  useEffect(() => {
    if (isEditingRef.current) {
      // 用户正在编辑，不刷新编辑器，显示警告
      setSchemaChangeWarning(true);
      return;
    }

    setSchemaChangeWarning(false);

    if (activeLang && openLocales[activeLang]) {
      const formatted = JSON.stringify(openLocales[activeLang], null, 2);
      if (formatted !== editorText) {
        // 保存当前光标和滚动位置
        const editor = editorRef.current?.getEditor();
        const position = editor?.getPosition();
        const scrollTop = editor?.getScrollTop();
        const scrollLeft = editor?.getScrollLeft();

        setEditorText(formatted);
        lastSyncedRef.current = formatted;
        setValidationError(null);
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
    } else if (!activeLang) {
      setEditorText('');
    }
  }, [activeLang, openLocales]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- RxJS 防抖解析 JSON 并同步到 store ----------
  // 使用 Subject + debounceTime + distinctUntilChanged 替代手动 setTimeout/clearTimeout
  const parseLogic = useMemo(() => {
    return (rawText: string) => {
      if (!activeLang) return;

      try {
        const parsed = JSON.parse(rawText);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const cleanHash = JSON.stringify(parsed);
          if (cleanHash === lastSyncedRef.current) {
            setValidationError(null);
            return;
          }

          updateTranslation(activeLang, parsed);
          lastSyncedRef.current = cleanHash;
          setValidationError(null);

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
  }, [activeLang, updateTranslation, sendLocaleSave]);

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
      isEditingRef.current = true;
      setEditorText(value);
      setValidationError(null);
      parseSubjectRef.current?.next(value);
    },
    []  // parseSubjectRef 是 ref，不需要依赖
  );

  // ---------- 失去焦点时校验 ----------
  // 注：使用 ref 而非 editorText state，因为 blur handler 在
  // onEditorMount 中注册（仅一次），闭包会捕获过期的 editorText
  const handleBlur = useCallback(() => {
    isEditingRef.current = false;
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
  }, []); // 空依赖：editorTextRef.current 始终保持最新

  // ---------- 推断光标位置的键路径 ----------
  const inferKeyPath = useCallback((lineContent: string): string | null => {
    const keyMatch = lineContent.match(/^\s*"([^"]+)"\s*:/);
    if (keyMatch) {
      return keyMatch[1];
    }
    return null;
  }, []);

  const handleCursorPosition = useCallback(() => {
    const editor = editorRef.current?.getEditor();
    if (!editor || !activeLang) return;

    const position = editor.getPosition();
    if (!position) return;

    const lineContent = editor.getModel()?.getLineContent(position.lineNumber) || '';
    const key = inferKeyPath(lineContent);
    if (key) {
      setReferenceKey(key);
      setReferenceVisible(true);
    } else {
      setReferenceVisible(false);
    }
  }, [activeLang, inferKeyPath]);

  // ---------- Monaco 编辑器挂载时注册事件监听 ----------
  // 稳定引用：配合 MonacoEditor 的 React.memo 防止不必要的重渲染级联
  const handleEditorMount = useCallback((editor: any) => {
    editor.onDidChangeCursorPosition(() => {
      handleCursorPosition();
    });
    editor.onDidBlurEditorText(() => {
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
          <p>请点击 "+" 按钮添加语言</p>
        </div>
      </div>
    );
  }

  const referenceData = getReferenceData();
  const hasLocks = Object.keys(activeLocks).length > 0;

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
      {/* 锁定提示 */}
      {hasLocks && (
        <div style={{ padding: '4px 12px', background: '#fff7e6', borderBottom: '1px solid #ffd591', fontSize: 12, color: '#d46b08', flexShrink: 0 }}>
          <span role="img" aria-label="lock">🔒</span> 有 {Object.keys(activeLocks).length} 个键正在被他人编辑
        </div>
      )}

      {/* Schema 变更警告（用户编辑中时外部 Schema 更新） */}
      {schemaChangeWarning && (
        <div style={{ padding: '4px 12px', background: '#fffbe6', borderBottom: '1px solid #ffe58f', fontSize: 12, color: '#d48806', flexShrink: 0 }}>
          <span role="img" aria-label="warning">⚠️</span> Schema 已更新，完成编辑后保存以应用新结构
        </div>
      )}

      {/* JSON 校验提示 */}
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
            flexShrink: 0,
          }}
        />
      )}

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
            />
          </div>
        </Popover>
      </div>

      {/* JSON 状态指示器 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '2px 8px',
          borderTop: '1px solid #303030',
          background: '#252526',
          flexShrink: 0,
          gap: 6,
        }}
      >
        {validationError ? (
          <span style={{ fontSize: 11, color: '#f48771', display: 'flex', alignItems: 'center', gap: 4 }}>
            <CloseCircleFilled style={{ color: '#f44747' }} />
            JSON 错误
          </span>
        ) : (
          <span style={{ fontSize: 11, color: '#6a9955', display: 'flex', alignItems: 'center', gap: 4 }}>
            <CheckCircleFilled style={{ color: '#4ec9b0' }} />
            JSON 有效
          </span>
        )}
      </div>
    </div>
  );
}
