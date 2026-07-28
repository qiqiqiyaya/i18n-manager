'use client';

import { Modal, Checkbox, Button, message, Space } from 'antd';
import { useState, useEffect } from 'react';
import axios from 'axios';
import { saveAs } from 'file-saver';

interface ExportSelectorDialogProps {
  projectId: string;
  open: boolean;
  onClose: () => void;
}

export default function ExportSelectorDialog({ projectId, open, onClose }: ExportSelectorDialogProps) {
  const [locales, setLocales] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { if (open) loadLocales(); }, [open, projectId]);

  const loadLocales = async () => {
    try {
      const res = await axios.get(`/api/projects/${projectId}/locales`);
      setLocales(res.data.data.locales || []);
      setSelected([]);
    } catch { message.error('加载语言列表失败'); }
  };

  const handleExport = async () => {
    if (selected.length === 0) { message.warning('请至少选择一个语言'); return; }
    setExporting(true);
    try {
      const res = await axios.post(`/api/projects/${projectId}/export`, { languages: selected },
        { responseType: 'blob' });
      saveAs(res.data, `project-${projectId}-locales.zip`);
      message.success('导出成功'); onClose();
    } catch (err: any) { message.error(err.response?.data?.message || '导出失败'); }
    finally { setExporting(false); }
  };

  const allSelected = locales.length > 0 && selected.length === locales.length;
  const indeterminate = selected.length > 0 && selected.length < locales.length;

  return (
    <Modal title="导出翻译文件" open={open} onCancel={onClose} footer={null}>
      <div style={{ marginBottom: 16 }}>
        <Checkbox indeterminate={indeterminate} checked={allSelected}
          onChange={() => setSelected(allSelected ? [] : [...locales])}>全选</Checkbox>
      </div>
      <div style={{ marginBottom: 24 }}>
        {locales.map((lang) => (
          <div key={lang} style={{ marginBottom: 8 }}>
            <Checkbox checked={selected.includes(lang)}
              onChange={(e) => setSelected(e.target.checked ? [...selected, lang] : selected.filter((l) => l !== lang))}>
              {lang}
            </Checkbox>
          </div>
        ))}
        {locales.length === 0 && <p style={{ color: '#999' }}>暂无语言</p>}
      </div>
      <div style={{ textAlign: 'right' }}>
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={exporting} onClick={handleExport}>导出 ZIP</Button>
        </Space>
      </div>
    </Modal>
  );
}
