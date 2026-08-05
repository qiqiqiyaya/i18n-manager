'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Button, Input, Card, Modal, Form, message, Empty, Spin } from 'antd';
import { PlusOutlined, SearchOutlined, EditOutlined, DeleteOutlined, FolderOpenOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import SearchHighlight from '@/components/common/SearchHighlight';

/** 搜索防抖延迟（毫秒） */
const SEARCH_DEBOUNCE = 300;
/** 后台静默刷新间隔（毫秒）：缓存未过期时可后台刷新，避免频繁全量请求 */
const STALE_REFRESH_INTERVAL = 30_000;

interface ProjectItem {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export default function HomePage() {
  const router = useRouter();
  const [allProjects, setAllProjects] = useState<ProjectItem[]>([]); // 全量缓存
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const searchSubjectRef = useRef<Subject<string> | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectItem | null>(null);
  const [form] = Form.useForm();

  // RxJS Subject 用于搜索防抖（替代手动 setTimeout + 去重 ref）
  useEffect(() => {
    const subject = new Subject<string>();
    searchSubjectRef.current = subject;

    const subscription = subject.pipe(
      debounceTime(SEARCH_DEBOUNCE),
      distinctUntilChanged()
    ).subscribe((value) => {
      setDebouncedKeyword(value);
    });

    return () => {
      subscription.unsubscribe();
      searchSubjectRef.current = null;
    };
  }, []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setKeyword(value);
    searchSubjectRef.current?.next(value);
  };

  // 首次加载 + 后台静默刷新全量列表
  const loadAllProjects = useCallback(async () => {
    try {
      const res = await axios.get('/api/projects');
      setAllProjects(res.data.data.list || []);
    } catch { message.error('加载项目列表失败'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAllProjects(); }, [loadAllProjects]);

  // 后台静默刷新：已有缓存时，每隔 STALE_REFRESH_INTERVAL 在后台拉取最新列表
  // （不显示 loading 状态，静默替换缓存）
  useEffect(() => {
    if (loading || allProjects.length === 0) return;
    const interval = setInterval(async () => {
      try {
        const res = await axios.get('/api/projects');
        setAllProjects(res.data.data.list || []);
      } catch { /* 静默失败，保留旧缓存 */ }
    }, STALE_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [loading, allProjects.length]);

  // 本地过滤（基于缓存，不再发 HTTP 搜索请求）
  const filteredProjects = useMemo(() => {
    if (!debouncedKeyword.trim()) return allProjects;
    const lower = debouncedKeyword.toLowerCase();
    return allProjects.filter(
      (p) =>
        p.title.toLowerCase().includes(lower) ||
        (p.description && p.description.toLowerCase().includes(lower))
    );
  }, [allProjects, debouncedKeyword]);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      const res = await axios.post('/api/projects', values);
      message.success('项目创建成功');
      setCreateModalOpen(false);
      form.resetFields();
      router.push(`/projects/${res.data.data.id}`);
    } catch (err: any) {
      if (err.response) message.error(err.response.data?.message || '创建失败');
    }
  };

  const handleEdit = async () => {
    if (!editingProject) return;
    try {
      const values = await form.validateFields();
      await axios.put(`/api/projects/${editingProject.id}`, values);
      message.success('更新成功');
      setEditModalOpen(false);
      setEditingProject(null);
      form.resetFields();
      loadAllProjects();
    } catch (err: any) {
      if (err.response) message.error(err.response.data?.message || '更新失败');
    }
  };

  const handleDelete = (project: ProjectItem) => {
    Modal.confirm({
      title: `确定删除项目 "${project.title}"？`,
      content: '此操作不可恢复，所有翻译数据将被永久删除。',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try { await axios.delete(`/api/projects/${project.id}`); message.success('项目已删除'); loadAllProjects(); }
        catch { message.error('删除失败'); }
      },
    });
  };

  const showHighlight = !!debouncedKeyword.trim();

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '40px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>多语言管理平台</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setCreateModalOpen(true); }}>
          创建项目
        </Button>
      </div>
      <Input placeholder="搜索项目..." prefix={<SearchOutlined />} value={keyword}
        onChange={handleSearchChange} allowClear style={{ marginBottom: 24, maxWidth: 400 }} />
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      ) : filteredProjects.length === 0 ? (
        <Empty description={keyword ? '未找到匹配的项目' : '暂无项目，点击"创建项目"开始'} />
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {filteredProjects.map((project) => (
            <Card key={project.id} hoverable onClick={() => router.push(`/projects/${project.id}`)}
              actions={[
                <EditOutlined key="edit" onClick={(e) => { e.stopPropagation(); setEditingProject(project); form.setFieldsValue(project); setEditModalOpen(true); }} />,
                <DeleteOutlined key="delete" onClick={(e) => { e.stopPropagation(); handleDelete(project); }} />,
              ]}>
              <Card.Meta avatar={<FolderOpenOutlined style={{ fontSize: 24, color: '#1677ff' }} />}
                title={showHighlight ? <SearchHighlight text={project.title} keyword={debouncedKeyword} /> : project.title}
                description={
                  <div>
                    <p style={{ margin: 0, color: '#666' }}>
                      {showHighlight && project.description
                        ? <SearchHighlight text={project.description} keyword={debouncedKeyword} />
                        : (project.description || '暂无描述')}
                    </p>
                    <p style={{ margin: '8px 0 0', fontSize: 12, color: '#999' }}>
                      更新于 {new Date(project.updatedAt).toLocaleString('zh-CN')}
                    </p>
                  </div>
                } />
            </Card>
          ))}
        </div>
      )}
      {/* 创建/编辑 Modal 保持不变 */}
      <Modal title="创建项目" open={createModalOpen} onOk={handleCreate}
        onCancel={() => setCreateModalOpen(false)} okText="创建" cancelText="取消">
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="项目标题" rules={[{ required: true, message: '请输入标题' }, { max: 50 }]}>
            <Input placeholder="输入项目标题" />
          </Form.Item>
          <Form.Item name="description" label="描述（可选）" rules={[{ max: 200 }]}>
            <Input.TextArea rows={3} placeholder="输入项目描述" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal title="编辑项目" open={editModalOpen} onOk={handleEdit}
        onCancel={() => { setEditModalOpen(false); setEditingProject(null); }} okText="保存" cancelText="取消">
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="项目标题" rules={[{ required: true, message: '请输入标题' }, { max: 50 }]}>
            <Input placeholder="输入项目标题" />
          </Form.Item>
          <Form.Item name="description" label="描述（可选）" rules={[{ max: 200 }]}>
            <Input.TextArea rows={3} placeholder="输入项目描述" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
