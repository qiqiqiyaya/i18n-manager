'use client';

import { useEffect, useState, useCallback, use } from 'react';
import { Button, Space, Spin, Input } from 'antd';
import { ArrowLeftOutlined, ImportOutlined, ExportOutlined, SearchOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { useEditorStore } from '@/stores/editorStore';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { useProjectEditor } from '@/hooks/useProjectEditor';
import { useSocket } from '@/hooks/useSocket';
import SchemaEditor from '@/components/project/SchemaEditor';
import LocaleEditor from '@/components/project/LocaleEditor';
import LanguageTabs from '@/components/project/LanguageTabs';
import OnlineBadge from '@/components/collaboration/OnlineBadge';
import ImportPreviewDialog from '@/components/project/ImportPreviewDialog';
import ExportSelectorDialog from '@/components/project/ExportSelectorDialog';

interface Props {
  params: Promise<{ id: string }>;
}

export default function ProjectEditorPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [globalSearchKeyword, setGlobalSearchKeyword] = useState('');
  const [availableLocales, setAvailableLocales] = useState<string[]>([]);
  const [projectTitle, setProjectTitle] = useState('');

  const { loadProject } = useProjectEditor({ projectId: id });
  const { sendLock, sendUnlock, sendSchemaUpdated, sendSchemaSave, sendLocaleSave, socketId } = useSocket({ projectId: id });
  const isLoading = useEditorStore((s) => s.isLoading);
  const overwrittenMessage = useCollaborationStore((s) => s.overwrittenMessage);
  const setOverwrittenMessage = useCollaborationStore((s) => s.setOverwrittenMessage);

  const loadLocales = useCallback(async () => {
    try {
      const res = await axios.get(`/api/projects/${id}/locales`);
      setAvailableLocales(res.data.data.locales || []);
    } catch { /* ignore */ }
  }, [id]);

  const loadProjectTitle = useCallback(async () => {
    try {
      const res = await axios.get(`/api/projects/${id}`);
      setProjectTitle(res.data.data.meta?.title || '');
    } catch { /* ignore */ }
  }, [id]);

  useEffect(() => { loadProjectTitle(); loadLocales(); }, [loadProjectTitle, loadLocales]);

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
          <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0', fontWeight: 600, fontSize: 14 }}>主表 Schema</div>
          <div style={{ flex: 1, overflow: 'auto' }}><SchemaEditor sendSchemaUpdated={sendSchemaUpdated} sendSchemaSave={sendSchemaSave} socketId={socketId} /></div>
        </div>
        <div style={{ flex: '0 0 50%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ borderBottom: '1px solid #f0f0f0' }}>
            <LanguageTabs projectId={id} availableLocales={availableLocales} onRefreshLocales={loadLocales} />
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}><LocaleEditor sendLocaleSave={sendLocaleSave} /></div>
        </div>
      </div>
      <ImportPreviewDialog projectId={id} open={importOpen}
        onClose={() => setImportOpen(false)} onImported={() => { loadProject(); loadLocales(); }} />
      <ExportSelectorDialog projectId={id} open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
}
