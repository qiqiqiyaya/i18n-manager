'use client';

import { Tabs, Button, Dropdown, Modal, Input, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useState } from 'react';
import axios from 'axios';
import { useEditorStore } from '@/stores/editorStore';

interface LanguageTabsProps {
  projectId: string;
  availableLocales: string[];
  onRefreshLocales: () => void;
}

export default function LanguageTabs({
  projectId,
  availableLocales,
  onRefreshLocales,
}: LanguageTabsProps) {
  const [addLangModalOpen, setAddLangModalOpen] = useState(false);
  const [newLang, setNewLang] = useState('');
  const [adding, setAdding] = useState(false);

  const openLocales = useEditorStore((s) => s.openLocales);
  const activeLang = useEditorStore((s) => s.activeLang);
  const openLocale = useEditorStore((s) => s.openLocale);
  const closeLocale = useEditorStore((s) => s.closeLocale);
  const setActiveLang = useEditorStore((s) => s.setActiveLang);

  const unopenedLocales = availableLocales.filter((lang) => !(lang in openLocales));

  const handleOpenLocale = async (lang: string) => {
    try {
      const res = await axios.get(`/api/projects/${projectId}/locales/${lang}`);
      openLocale(lang, res.data.data.translations || {});
    } catch { message.error(`打开语言 ${lang} 失败`); }
  };

  const handleAddLanguage = async () => {
    if (!newLang.trim()) return;
    setAdding(true);
    try {
      const res = await axios.post(`/api/projects/${projectId}/locales`, { lang: newLang.trim() });
      openLocale(newLang.trim(), res.data.data.translations || {});
      setAddLangModalOpen(false); setNewLang('');
      message.success(`语言 "${newLang}" 已添加`);
      onRefreshLocales();
    } catch (err: any) { message.error(err.response?.data?.message || '添加失败'); }
    finally { setAdding(false); }
  };

  const tabItems = Object.keys(openLocales).map((lang) => ({
    key: lang,
    label: (
      <span>
        {lang}
        <Button type="text" size="small" danger onClick={(e) => { e.stopPropagation(); closeLocale(lang); }}
          style={{ marginLeft: 4, fontSize: 12, padding: 0, width: 18, height: 18 }}>×</Button>
      </span>
    ),
  }));

  const dropdownItems = [
    ...unopenedLocales.map((lang) => ({ key: lang, label: lang, onClick: () => handleOpenLocale(lang) })),
    ...(unopenedLocales.length > 0 ? [{ type: 'divider' as const, key: 'divider' }] : []),
    { key: 'add-new', label: '添加新语言', onClick: () => setAddLangModalOpen(true) },
  ];

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Tabs activeKey={activeLang || undefined} onChange={setActiveLang}
          items={tabItems} type="card" size="small" style={{ flex: 1 }} hideAdd />
        <Dropdown menu={{ items: dropdownItems }} trigger={['click']}>
          <Button type="text" icon={<PlusOutlined />}
            disabled={availableLocales.length > 0 && unopenedLocales.length === 0} />
        </Dropdown>
      </div>
      <Modal title="添加新语言" open={addLangModalOpen} onOk={handleAddLanguage}
        onCancel={() => { setAddLangModalOpen(false); setNewLang(''); }}
        confirmLoading={adding} okText="添加" cancelText="取消">
        <Input placeholder="输入语言标识，如 zh-CN" value={newLang}
          onChange={(e) => setNewLang(e.target.value)} onPressEnter={handleAddLanguage} />
      </Modal>
    </>
  );
}
