'use client';

import { Badge, Tooltip } from 'antd';
import { TeamOutlined } from '@ant-design/icons';
import { useCollaborationStore } from '@/stores/collaborationStore';

export default function OnlineBadge() {
  const onlineCount = useCollaborationStore((s) => s.onlineCount);

  return (
    <Tooltip title={`${onlineCount} 人在线`}>
      <Badge
        count={onlineCount}
        showZero
        color={onlineCount > 0 ? '#52c41a' : '#d9d9d9'}
        overflowCount={999}
        size="small"
      >
        <TeamOutlined style={{ fontSize: 18, cursor: 'pointer' }} />
      </Badge>
    </Tooltip>
  );
}
