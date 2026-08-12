'use client';

import { useEffect, useState, useCallback, useReducer, use, useRef, useMemo } from 'react';
import { Button, Space, Spin, Input, Popover, Tooltip } from 'antd';
import { ArrowLeftOutlined, ImportOutlined, ExportOutlined, SearchOutlined, EyeOutlined } from '@ant-design/icons';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { useEditorStore } from '@/stores/editorStore';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { useProjectEditor } from '@/hooks/useProjectEditor';
import { useSocket } from '@/hooks/useSocket';
import { useSearch, type SearchResult } from '@/hooks/useSearch';
import SchemaEditor, { type SchemaEditorHandle } from '@/components/project/SchemaEditor';
import LocaleEditor, { type LocaleEditorHandle } from '@/components/project/LocaleEditor';
import LanguageTabs from '@/components/project/LanguageTabs';
import OnlineBadge from '@/components/collaboration/OnlineBadge';
import ImportPreviewDialog from '@/components/project/ImportPreviewDialog';
import ExportSelectorDialog from '@/components/project/ExportSelectorDialog';
import GlobalSearchResults from '@/components/project/GlobalSearchResults';
import CrossReferencePopover from '@/components/project/CrossReferencePopover';
import LocaleStatusBar from '@/components/project/LocaleStatusBar';
import { lookupToken } from '@/lib/reference-lookup';
import { referenceReducer, initialState } from '@/lib/reference-state';
import type { ReferenceTokenPayload } from '@/types/reference';

/** 全局搜索防抖延迟（毫秒），与首页项目搜索一致 */
const SEARCH_DEBOUNCE = 300;

interface Props {
  params: Promise<{ id: string }>;
}

export default function ProjectEditorPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const { keyword, setKeyword, results } = useSearch({ projectId: id });

  const { loadProject } = useProjectEditor({ projectId: id });
  const { sendSchemaUpdated, sendSchemaSave, sendLocaleUpdated, sendLocaleSave, sendProjectSettings } = useSocket({ projectId: id });
  const isLoading = useEditorStore((s) => s.isLoading);
  const projectTitle = useEditorStore((s) => s.projectTitle);
  const availableLocales = useEditorStore((s) => s.availableLocales);
  const schema = useEditorStore((s) => s.schema);
  const openLocales = useEditorStore((s) => s.openLocales);
  const referenceEnabled = useEditorStore((s) => s.referenceEnabled);
  const setReferenceEnabled = useEditorStore((s) => s.setReferenceEnabled);
  const setActiveLang = useEditorStore((s) => s.setActiveLang);
  const openLocale = useEditorStore((s) => s.openLocale);
  const overwrittenMessage = useCollaborationStore((s) => s.overwrittenMessage);
  const setOverwrittenMessage = useCollaborationStore((s) => s.setOverwrittenMessage);

  // 左右编辑器同步滚动
  const schemaEditorRef = useRef<SchemaEditorHandle>(null);
  const localeEditorRef = useRef<LocaleEditorHandle>(null);
  const scrollRatioRef = useRef<number>(0);
  const isScrollingRef = useRef(false);
  // 全局搜索防抖 Subject
  const searchSubjectRef = useRef<Subject<string> | null>(null);

  // 「速查」浮层状态（hidden ⇄ expanded ⇄ collapsed）+ hover 桥接引用
  const [referenceState, dispatchReference] = useReducer(referenceReducer, initialState);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const handleSchemaScroll = useCallback((ratio: number) => {
    if (isScrollingRef.current) return;
    isScrollingRef.current = true;
    scrollRatioRef.current = ratio;
    localeEditorRef.current?.scrollToRatio(ratio);
    // 微任务重置：MonacoEditor 内部 scrollToRatio 通过 queueMicrotask 重置其内部 flag，
    // 此处同样用微任务，保证下一轮事件循环即可恢复滚动同步
    queueMicrotask(() => { isScrollingRef.current = false; });
    // 速查：源编辑器滚动 → 折叠成屏幕固定标记（见 referenceReducer SCROLL）
    dispatchReference({ type: 'SCROLL' });
  }, []);

  const handleLocaleScroll = useCallback((ratio: number) => {
    if (isScrollingRef.current) return;
    isScrollingRef.current = true;
    scrollRatioRef.current = ratio;
    schemaEditorRef.current?.scrollToRatio(ratio);
    queueMicrotask(() => { isScrollingRef.current = false; });
    dispatchReference({ type: 'SCROLL' });
  }, []);

  // 全局搜索防抖：输入 → Subject → debounceTime → setKeyword 驱动 useSearch 重算 results
  useEffect(() => {
    const subject = new Subject<string>();
    searchSubjectRef.current = subject;

    const subscription = subject.pipe(
      debounceTime(SEARCH_DEBOUNCE),
      distinctUntilChanged()
    ).subscribe((value) => {
      setKeyword(value);
    });

    return () => {
      subscription.unsubscribe();
      searchSubjectRef.current = null;
    };
  }, [setKeyword]);

  // 点击搜索结果：切语言 Tab → 等 Monaco 同步到目标语言后精确 reveal + 打开 find 高亮该语言内全部匹配
  const handleSearchSelect = useCallback((result: SearchResult) => {
    const keywordAtClick = searchInput;
    setActiveLang(result.lang);
    requestAnimationFrame(() => {
      localeEditorRef.current?.revealKey(result.key);
      localeEditorRef.current?.find(keywordAtClick);
    });
    setSearchInput('');
    setKeyword('');
  }, [setActiveLang, searchInput, setKeyword]);

  // ---------- 「速查」：查询、跳转、复制、hover 桥接、开关 ----------
  const referenceLookup = useMemo(() => {
    if (!referenceState.token) return { schemaHits: [], translationHits: [] };
    return lookupToken(referenceState.token.token, schema, openLocales);
  }, [referenceState.token, schema, openLocales]);

  // 编辑器上报 token → 命中才弹，无命中/开关关闭不弹
  const handleReferenceToken = useCallback((payload: ReferenceTokenPayload | null, source: 'schema' | 'locale') => {
    if (!useEditorStore.getState().referenceEnabled) return;
    if (!payload) { dispatchReference({ type: 'MISS' }); return; }
    const { schema: curSchema, openLocales: curLocales } = useEditorStore.getState();
    const hits = lookupToken(payload.token, curSchema, curLocales);
    if (hits.schemaHits.length === 0 && hits.translationHits.length === 0) {
      dispatchReference({ type: 'MISS' });
      return;
    }
    dispatchReference({ type: 'SET_TOKEN', token: { ...payload, source } });
  }, []);

  const jumpToSchema = useCallback((key: string) => {
    schemaEditorRef.current?.revealKey(key);
    dispatchReference({ type: 'CLOSE' });
  }, []);

  const jumpToTranslation = useCallback(async (lang: string, key: string) => {
    const state = useEditorStore.getState();
    // 目标语言未打开则先打开，再切 Tab 定位
    if (!(lang in state.openLocales)) {
      try {
        const res = await axios.get(`/api/projects/${id}/locales/${lang}`);
        state.openLocale(lang, res.data.data.translations || {});
      } catch { /* 打开失败则不跳转 */ }
    }
    setActiveLang(lang);
    requestAnimationFrame(() => {
      localeEditorRef.current?.revealKey(key);
    });
    dispatchReference({ type: 'CLOSE' });
  }, [id, setActiveLang]);

  const handleReferenceCopy = useCallback((text: string) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  }, []);

  // hover 桥接：离开双区（编辑器 + 浮层/标记，含 16px 间隙）400ms 后关闭
  const cancelClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    if (closeTimerRef.current !== null) return;
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      dispatchReference({ type: 'LEAVE' });
    }, 400);
  }, []);

  useEffect(() => {
    if (referenceState.mode === 'hidden') return;
    const BRIDGE = 16;
    const handleMove = (e: MouseEvent) => {
      const editorNode = (referenceState.token?.source === 'schema'
        ? schemaEditorRef.current?.getEditor()?.getDomNode()
        : localeEditorRef.current?.getEditor()?.getDomNode());
      const layerNode = popoverRef.current;
      const rects: DOMRect[] = [];
      if (editorNode) rects.push(editorNode.getBoundingClientRect());
      if (layerNode) rects.push(layerNode.getBoundingClientRect());
      const inside = rects.some((r) =>
        e.clientX >= r.left - BRIDGE && e.clientX <= r.right + BRIDGE &&
        e.clientY >= r.top - BRIDGE && e.clientY <= r.bottom + BRIDGE
      );
      if (inside) cancelClose();
      else scheduleClose();
    };
    document.addEventListener('mousemove', handleMove);
    return () => document.removeEventListener('mousemove', handleMove);
  }, [referenceState.mode, referenceState.token, cancelClose, scheduleClose]);

  // 每项目「速查」开关：本地 store + Socket 广播（last-write-wins），关闭时浮层完全抑制
  const handleToggleReference = useCallback(() => {
    const next = !useEditorStore.getState().referenceEnabled;
    setReferenceEnabled(next);
    sendProjectSettings(next);
    dispatchReference({ type: 'CLOSE' });
  }, [setReferenceEnabled, sendProjectSettings]);

  // Ctrl+S 手动保存：调用子级组件的 flushSave（内部含去重，无变化不保存）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();  // 阻止浏览器默认"保存网页"
        schemaEditorRef.current?.flushSave();
        localeEditorRef.current?.flushSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);  // 捕获阶段，优先拦截
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  useEffect(() => {
    if (overwrittenMessage) {
      const timer = setTimeout(() => setOverwrittenMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [overwrittenMessage, setOverwrittenMessage]);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 24px',
        borderBottom: '1px solid #f0f0f0', background: '#fff', flexShrink: 0 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push('/')} />
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{projectTitle || '编辑器'}</h2>
        <Popover
          open={searchInput.trim().length > 0}
          trigger={[]}
          placement="bottomLeft"
          content={
            <GlobalSearchResults results={results} keyword={keyword} onSelect={handleSearchSelect} />
          }
        >
          <Input placeholder="搜索译文内容..." prefix={<SearchOutlined />}
            value={searchInput}
            onChange={(e) => { setSearchInput(e.target.value); searchSubjectRef.current?.next(e.target.value); }}
            allowClear style={{ maxWidth: 300, marginLeft: 'auto' }} />
        </Popover>
        <Tooltip title={referenceEnabled ? '关闭速查（指向/选中键值即查）' : '开启速查（指向/选中键值即查）'}>
          <Button
            type={referenceEnabled ? 'primary' : 'text'}
            size="small"
            icon={<EyeOutlined />}
            onClick={handleToggleReference}
          >
            速查
          </Button>
        </Tooltip>
        <OnlineBadge />
        <Space>
          <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>导入</Button>
          <Button icon={<ExportOutlined />} onClick={() => setExportOpen(true)}>导出</Button>
        </Space>
      </div>
      {overwrittenMessage && (
        <div style={{ background: '#fff7e6', border: '1px solid #ffd591', padding: '8px 24px', color: '#d46b08', fontSize: 13, textAlign: 'center' }}>
          {overwrittenMessage}
        </div>
      )}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: '0 0 50%', display: 'flex', flexDirection: 'column', borderRight: '1px solid #f0f0f0' }}>
          <div style={{ height: 40, display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid #f0f0f0', fontWeight: 600, fontSize: 14, flexShrink: 0, boxSizing: 'border-box', overflow: 'hidden' }}>主表 Schema</div>
          <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}><SchemaEditor ref={schemaEditorRef} sendSchemaUpdated={sendSchemaUpdated} sendSchemaSave={sendSchemaSave} onScrollChange={handleSchemaScroll} onReferenceToken={(p) => handleReferenceToken(p, 'schema')} /></div>
        </div>
        <div style={{ flex: '0 0 50%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 40, display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0, boxSizing: 'border-box', overflow: 'hidden' }}>
            <LanguageTabs projectId={id} availableLocales={availableLocales} onRefreshLocales={loadProject} />
          </div>
          <LocaleStatusBar />
          <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}><LocaleEditor ref={localeEditorRef} sendLocaleSave={sendLocaleSave} sendLocaleUpdated={sendLocaleUpdated} onScrollChange={handleLocaleScroll} onReferenceToken={(p) => handleReferenceToken(p, 'locale')} /></div>
        </div>
      </div>
      <ImportPreviewDialog projectId={id} open={importOpen}
        onClose={() => setImportOpen(false)} onImported={loadProject} />
      <ExportSelectorDialog projectId={id} open={exportOpen} onClose={() => setExportOpen(false)} />
      {/* 「速查」浮层（唯一实例，editor 只上报 token，跳转由页面跨栏协调） */}
      {referenceState.token && (
        <CrossReferencePopover
          layerRef={popoverRef}
          mode={referenceState.mode === 'hidden' ? 'expanded' : referenceState.mode}
          anchor={referenceState.token.anchor}
          token={referenceState.token.token}
          lookup={referenceLookup}
          onJumpSchema={jumpToSchema}
          onJumpTranslation={jumpToTranslation}
          onCopy={handleReferenceCopy}
          onHoverMarker={() => dispatchReference({ type: 'HOVER_MARKER' })}
          onEnterPopover={() => { cancelClose(); dispatchReference({ type: 'ENTER_POPOVER' }); }}
          onLeave={scheduleClose}
        />
      )}
    </div>
  );
}
