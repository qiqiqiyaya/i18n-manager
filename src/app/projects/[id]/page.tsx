'use client';

import { useEffect, useState, useCallback, use, useRef } from 'react';
import { Button, Space, Spin, Input } from 'antd';
import { ArrowLeftOutlined, ImportOutlined, ExportOutlined, SearchOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { useEditorStore } from '@/stores/editorStore';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { useProjectEditor } from '@/hooks/useProjectEditor';
import { useSocket } from '@/hooks/useSocket';
import SchemaEditor, { type SchemaEditorHandle } from '@/components/project/SchemaEditor';
import LocaleEditor, { type LocaleEditorHandle } from '@/components/project/LocaleEditor';
import LanguageTabs from '@/components/project/LanguageTabs';
import OnlineBadge from '@/components/collaboration/OnlineBadge';
import ImportPreviewDialog from '@/components/project/ImportPreviewDialog';
import ExportSelectorDialog from '@/components/project/ExportSelectorDialog';
import LocaleStatusBar from '@/components/project/LocaleStatusBar';

interface Props {
  params: Promise<{ id: string }>;
}

export default function ProjectEditorPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [globalSearchKeyword, setGlobalSearchKeyword] = useState('');

  const { loadProject } = useProjectEditor({ projectId: id });
  const { sendSchemaUpdated, sendSchemaSave, sendLocaleSave, socketId } = useSocket({ projectId: id });
  const isLoading = useEditorStore((s) => s.isLoading);
  const projectTitle = useEditorStore((s) => s.projectTitle);
  const availableLocales = useEditorStore((s) => s.availableLocales);
  const overwrittenMessage = useCollaborationStore((s) => s.overwrittenMessage);
  const setOverwrittenMessage = useCollaborationStore((s) => s.setOverwrittenMessage);

  // 左右编辑器同步滚动
  const schemaEditorRef = useRef<SchemaEditorHandle>(null);
  const localeEditorRef = useRef<LocaleEditorHandle>(null);
  const scrollRatioRef = useRef<number>(0);
  const isScrollingRef = useRef(false);

  const handleSchemaScroll = useCallback((ratio: number) => {
    if (isScrollingRef.current) return;
    isScrollingRef.current = true;
    scrollRatioRef.current = ratio;
    localeEditorRef.current?.scrollToRatio(ratio);
    // 微任务重置：MonacoEditor 内部 scrollToRatio 通过 queueMicrotask 重置其内部 flag，
    // 此处同样用微任务，保证下一轮事件循环即可恢复滚动同步
    queueMicrotask(() => { isScrollingRef.current = false; });
  }, []);

  const handleLocaleScroll = useCallback((ratio: number) => {
    if (isScrollingRef.current) return;
    isScrollingRef.current = true;
    scrollRatioRef.current = ratio;
    schemaEditorRef.current?.scrollToRatio(ratio);
    queueMicrotask(() => { isScrollingRef.current = false; });
  }, []);

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
        <Input placeholder="全局搜索译文内容..." prefix={<SearchOutlined />}
          value={globalSearchKeyword} onChange={(e) => setGlobalSearchKeyword(e.target.value)}
          allowClear style={{ maxWidth: 300, marginLeft: 'auto' }} />
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
          <div style={{ flex: 1, overflow: 'auto' }}><SchemaEditor ref={schemaEditorRef} sendSchemaUpdated={sendSchemaUpdated} sendSchemaSave={sendSchemaSave} socketId={socketId} onScrollChange={handleSchemaScroll} /></div>
        </div>
        <div style={{ flex: '0 0 50%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 40, display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0, boxSizing: 'border-box', overflow: 'hidden' }}>
            <LanguageTabs projectId={id} availableLocales={availableLocales} onRefreshLocales={loadProject} />
          </div>
          <LocaleStatusBar />
          <div style={{ flex: 1, overflow: 'auto' }}><LocaleEditor ref={localeEditorRef} sendLocaleSave={sendLocaleSave} onScrollChange={handleLocaleScroll} /></div>
        </div>
      </div>
      <ImportPreviewDialog projectId={id} open={importOpen}
        onClose={() => setImportOpen(false)} onImported={loadProject} />
      <ExportSelectorDialog projectId={id} open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
}
