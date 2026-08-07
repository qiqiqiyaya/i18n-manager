'use client';

import { Modal, Upload, Select, message, Tabs } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import axios from 'axios';
import { createNestedFromPaths } from '@/lib/utils';

const { Dragger } = Upload;

// 动态导入 Monaco DiffEditor（SSR 安全）
const DiffEditor = dynamic(() => import('@monaco-editor/react').then((mod) => mod.DiffEditor), {
  ssr: false,
});

interface ImportPreviewDialogProps {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

interface ImportPreview {
  addedKeys: string[];
  diffKeys: Array<{ key: string; oldVal: any; newVal: any }>;
}

export default function ImportPreviewDialog({
  projectId, open, onClose, onImported,
}: ImportPreviewDialogProps) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importedLang, setImportedLang] = useState('');
  const [strategy, setStrategy] = useState<'overwrite' | 'skip' | 'merge'>('merge');
  const [importing, setImporting] = useState(false);
  const [fileContent, setFileContent] = useState<Record<string, any> | null>(null);
  const [fileName, setFileName] = useState('');

  const handleFile = async (file: File) => {
    const text = await file.text();
    let content: Record<string, any>;
    try { content = JSON.parse(text); }
    catch { message.error('文件不是合法 JSON'); return false; }
    setFileContent(content);
    setFileName(file.name);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await axios.post(`/api/projects/${projectId}/import`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }, validateStatus: (s) => s < 500,
      });
      if (res.status === 409) { setPreview(res.data.data.preview); setImportedLang(res.data.data.lang); }
      else if (res.status === 200) { message.success('导入成功'); onImported(); onClose(); }
    } catch (err: any) { message.error(err.response?.data?.message || '导入失败'); }
    return false;
  };

  const handleConfirmImport = async () => {
    if (!fileContent || !fileName) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', new File([JSON.stringify(fileContent)], fileName));
      formData.append('strategy', strategy);
      formData.append('confirmed', 'true');
      await axios.post(`/api/projects/${projectId}/import`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      message.success('导入成功'); onImported(); onClose();
    } catch (err: any) { message.error(err.response?.data?.message || '导入失败'); }
    finally { setImporting(false); }
  };

  const reset = () => { setPreview(null); setFileContent(null); setFileName(''); setImportedLang(''); };

  // 构建旧值和新值的完整 JSON，用于 DiffEditor 对比
  const buildDiffJson = useCallback(() => {
    if (!preview || !fileContent) return { oldJson: '', newJson: '' };
    const oldObj: Record<string, any> = {};
    const newObj: Record<string, any> = {};
    for (const dk of preview.diffKeys) {
      oldObj[dk.key] = dk.oldVal;
      newObj[dk.key] = dk.newVal;
    }
    return {
      oldJson: JSON.stringify(oldObj, null, 2),
      newJson: JSON.stringify(newObj, null, 2),
    };
  }, [preview, fileContent]);

  const diffData = buildDiffJson();

  return (
    <Modal title="导入翻译文件" open={open} onCancel={() => { onClose(); reset(); }} footer={null} width={720} mask={{ closable: false }}>
      {!preview ? (
        <Dragger accept=".json" beforeUpload={handleFile} showUploadList={false}>
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text">点击或拖拽 JSON 文件到此区域</p>
          <p className="ant-upload-hint">仅支持 .json 格式，文件名将作为语言标识</p>
        </Dragger>
      ) : (
        <div>
          <p>语言标识: <strong>{importedLang}</strong></p>

          <Tabs
            items={[
              ...(preview.addedKeys.length > 0 ? [{
                key: 'added',
                label: `新增键 (${preview.addedKeys.length})`,
                children: (
                  <div style={{ maxHeight: 300, overflow: 'auto' }}>
                    <pre style={{ fontSize: 13, background: '#f6f8fa', border: '1px solid #d0d7de', borderRadius: 6, padding: 12 }}>
                      {JSON.stringify(createNestedFromPaths(preview.addedKeys), null, 2)}
                    </pre>
                  </div>
                ),
              }] : []),
              ...(preview.diffKeys.length > 0 ? [{
                key: 'diff',
                label: `差异键 (${preview.diffKeys.length})`,
                children: (
                  <div style={{ height: 350, border: '1px solid #d0d7de', borderRadius: 6, overflow: 'hidden' }}>
                    <DiffEditor
                      original={diffData.oldJson}
                      modified={diffData.newJson}
                      language="json"
                      theme="vs-dark"
                      options={{
                        readOnly: true,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        fontSize: 13,
                        renderSideBySide: true,
                      }}
                    />
                  </div>
                ),
              }] : []),
              {
                key: 'preview',
                label: '完整文件预览',
                children: (
                  <div style={{ maxHeight: 300, overflow: 'auto' }}>
                    <pre style={{ fontSize: 13, background: '#f6f8fa', border: '1px solid #d0d7de', borderRadius: 6, padding: 12 }}>
                      {JSON.stringify(fileContent, null, 2)}
                    </pre>
                  </div>
                ),
              },
            ]}
          />

          <div style={{ margin: '12px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>合并策略: </span>
            <Select value={strategy} onChange={setStrategy} style={{ width: 160 }}>
              <Select.Option value="merge">仅新增（保留现有）</Select.Option>
              <Select.Option value="overwrite">覆盖（以文件为准）</Select.Option>
              <Select.Option value="skip">跳过（保留现有）</Select.Option>
            </Select>
          </div>
          <div style={{ textAlign: 'right', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={reset} style={{ padding: '4px 16px', cursor: 'pointer' }}>重新选择</button>
            <button onClick={handleConfirmImport} disabled={importing}
              style={{ padding: '4px 16px', background: '#1677ff', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
              {importing ? '导入中...' : '确认导入'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
