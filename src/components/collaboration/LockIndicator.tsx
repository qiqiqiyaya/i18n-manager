'use client';

import { Tooltip, Tag } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useCollaborationStore } from '@/stores/collaborationStore';

interface LockIndicatorProps {
  language: string;
  keyPath: string;
  myIp: string;
}

export default function LockIndicator({ language, keyPath, myIp }: LockIndicatorProps) {
  const isLockedByOther = useCollaborationStore((s) =>
    s.isLockedByOther(language, keyPath, myIp)
  );
  if (!isLockedByOther) return null;

  return (
    <Tooltip title="他人正在编辑此节点">
      <Tag color="warning" icon={<LockOutlined />} style={{ fontSize: 11, lineHeight: '16px' }}>
        已锁定
      </Tag>
    </Tooltip>
  );
}
