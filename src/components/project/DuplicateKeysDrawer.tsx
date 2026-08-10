'use client';

import { useMemo, useState } from 'react';
import { Drawer, Table, Button, Input, Tag, Tooltip, Alert, Empty } from 'antd';
import type { TableColumnsType } from 'antd';
import {
  ExpandAltOutlined,
  ShrinkOutlined,
  EnterOutlined,
} from '@ant-design/icons';
import type { DuplicateGroup, KeyOccurrence } from '@/lib/duplicate-keys';

interface DuplicateKeysDrawerProps {
  open: boolean;
  onClose: () => void;
  groups: DuplicateGroup[];
  /** 把源文本 offset 换算成 1-based 行号；返回 null 表示无法定位 */
  getLineNumber: (offset: number) => number | null;
  /** 跳转到编辑器中该 offset 所在位置 */
  onJumpTo: (offset: number) => void;
}

/** 等宽字体栈，路径与键名用它对齐 */
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/**
 * 重复键检测结果抽屉。
 *
 * 为什么用 Drawer 而不是底部面板：页面是 100vh 的 flex 布局，
 * 底部面板会挤压左右两个编辑器的高度；抽屉浮在右侧，
 * 用户可以边看列表边改左栏 Schema。
 */
export default function DuplicateKeysDrawer({
  open,
  onClose,
  groups,
  getLineNumber,
  onJumpTo,
}: DuplicateKeysDrawerProps) {
  const [keyword, setKeyword] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<readonly string[]>([]);

  const totalCount = useMemo(
    () => groups.reduce((sum, g) => sum + g.count, 0),
    [groups]
  );

  const filtered = useMemo(() => {
    const term = keyword.trim().toLowerCase();
    if (!term) return groups;
    return groups.filter((g) => g.keyName.toLowerCase().includes(term));
  }, [groups, keyword]);

  /** 全部展开 / 全部收起：只对当前过滤结果生效，符合「所见即所展」 */
  const isAllExpanded =
    filtered.length > 0 && expandedKeys.length >= filtered.length;

  const handleToggleAll = () => {
    setExpandedKeys(isAllExpanded ? [] : filtered.map((g) => g.keyName));
  };

  const columns: TableColumnsType<DuplicateGroup> = [
    {
      title: '键名',
      dataIndex: 'keyName',
      key: 'keyName',
      render: (keyName: string) => (
        <span style={{ fontFamily: MONO, fontSize: 13 }}>{keyName}</span>
      ),
    },
    {
      title: '出现',
      dataIndex: 'count',
      key: 'count',
      width: 80,
      align: 'right',
      sorter: (a, b) => a.count - b.count,
      defaultSortOrder: 'descend',
      render: (count: number) => `${count} 处`,
    },
    {
      title: '类型',
      key: 'kinds',
      width: 130,
      render: (_, group) => {
        const leaves = group.occurrences.filter((o) => o.kind === 'leaf').length;
        const branches = group.count - leaves;
        return (
          <>
            {leaves > 0 && <Tag>叶子 {leaves}</Tag>}
            {branches > 0 && <Tag color="blue">分组 {branches}</Tag>}
          </>
        );
      },
    },
  ];

  /** 子行：该组下每一处出现的完整路径 + 行号 + 跳转 */
  const renderOccurrences = (group: DuplicateGroup) => (
    <Table<KeyOccurrence>
      size="small"
      rowKey={(o) => `${o.path}@${o.offset}`}
      dataSource={group.occurrences}
      pagination={false}
      showHeader={false}
      columns={[
        {
          title: '路径',
          dataIndex: 'path',
          key: 'path',
          ellipsis: true,
          render: (path: string, occurrence) => (
            <Tooltip title={path}>
              <span style={{ fontFamily: MONO, fontSize: 12 }}>
                {path}
                {occurrence.kind === 'branch' && (
                  <Tag color="blue" style={{ marginLeft: 6 }}>
                    分组
                  </Tag>
                )}
              </span>
            </Tooltip>
          ),
        },
        {
          title: '行号',
          key: 'line',
          width: 70,
          align: 'right',
          render: (_, occurrence) => {
            const line = getLineNumber(occurrence.offset);
            return (
              <span style={{ fontFamily: MONO, fontSize: 12, color: '#888' }}>
                {line === null ? '—' : `L${line}`}
              </span>
            );
          },
        },
        {
          title: '操作',
          key: 'action',
          width: 76,
          render: (_, occurrence) => (
            <Button
              type="link"
              size="small"
              icon={<EnterOutlined />}
              onClick={() => onJumpTo(occurrence.offset)}
            >
              跳转
            </Button>
          ),
        },
      ]}
    />
  );

  return (
    <Drawer
      title={`重复键检测（${groups.length} 组 / ${totalCount} 处）`}
      placement="right"
      // antd 6：width 已弃用，改用 size（接受预设字符串或具体数值）
      size={560}
      open={open}
      onClose={onClose}
      // antd 6.3+：maskClosable 已弃用，须用 mask 对象
      mask={{ closable: true }}
      styles={{ body: { padding: 12 } }}
    >
      <Alert
        type="info"
        showIcon
        // antd 6：Alert 的 message 已弃用，改用 title
        title="结果基于点击检测时的内容，编辑 Schema 后请重新检测"
        style={{ marginBottom: 12 }}
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Button
          size="small"
          icon={isAllExpanded ? <ShrinkOutlined /> : <ExpandAltOutlined />}
          onClick={handleToggleAll}
          disabled={filtered.length === 0}
        >
          {isAllExpanded ? '全部收起' : '全部展开'}
        </Button>
        <Input
          size="small"
          allowClear
          placeholder="搜索键名"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={{ flex: 1 }}
        />
      </div>

      <Table<DuplicateGroup>
        size="small"
        rowKey="keyName"
        dataSource={filtered}
        columns={columns}
        pagination={false}
        locale={{ emptyText: <Empty description="没有匹配的键名" /> }}
        expandable={{
          expandedRowKeys: expandedKeys as string[],
          // antd 回调签名是 readonly Key[]（Key = string | number），
          // 但 rowKey="keyName" 保证这里恒为 string
          onExpandedRowsChange: (keys) => setExpandedKeys(keys as string[]),
          expandedRowRender: renderOccurrences,
        }}
      />
    </Drawer>
  );
}
