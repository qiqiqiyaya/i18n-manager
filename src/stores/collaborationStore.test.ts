import { describe, expect, it, beforeEach } from 'vitest';
import { useCollaborationStore } from './collaborationStore';

function initStore() {
  useCollaborationStore.setState({
    onlineCount: 0,
    locks: {},
    overwrittenMessage: null,
  });
}

describe('collaborationStore', () => {
  beforeEach(() => initStore());

  describe('setOnlineCount', () => {
    it('sets online count', () => {
      useCollaborationStore.getState().setOnlineCount(5);
      expect(useCollaborationStore.getState().onlineCount).toBe(5);
    });
  });

  describe('addLock / removeLock', () => {
    const lock = { keyPath: 'a.b', language: 'zh-CN', ip: '127.0.0.1', timestamp: Date.now() };

    it('adds a lock', () => {
      useCollaborationStore.getState().addLock(lock);
      expect(useCollaborationStore.getState().locks['zh-CN:a.b']).toEqual(lock);
    });

    it('removes a lock', () => {
      useCollaborationStore.getState().addLock(lock);
      useCollaborationStore.getState().removeLock('zh-CN', 'a.b');
      expect(useCollaborationStore.getState().locks['zh-CN:a.b']).toBeUndefined();
    });

    it('removes a lock that does not exist silently', () => {
      useCollaborationStore.getState().removeLock('zh-CN', 'nonexistent');
      expect(Object.keys(useCollaborationStore.getState().locks)).toHaveLength(0);
    });
  });

  describe('isLockedByOther', () => {
    const myIp = '192.168.1.1';
    const otherIp = '192.168.1.2';

    it('returns false when no lock exists', () => {
      expect(useCollaborationStore.getState().isLockedByOther('zh-CN', 'a.b', myIp)).toBe(false);
    });

    it('returns false when lock is owned by self', () => {
      useCollaborationStore.getState().addLock({ keyPath: 'a.b', language: 'zh-CN', ip: myIp, timestamp: Date.now() });
      expect(useCollaborationStore.getState().isLockedByOther('zh-CN', 'a.b', myIp)).toBe(false);
    });

    it('returns true when lock is owned by another', () => {
      useCollaborationStore.getState().addLock({ keyPath: 'a.b', language: 'zh-CN', ip: otherIp, timestamp: Date.now() });
      expect(useCollaborationStore.getState().isLockedByOther('zh-CN', 'a.b', myIp)).toBe(true);
    });
  });

  describe('setOverwrittenMessage', () => {
    it('sets the message', () => {
      useCollaborationStore.getState().setOverwrittenMessage('键已被他人更新');
      expect(useCollaborationStore.getState().overwrittenMessage).toBe('键已被他人更新');
    });

    it('clears the message with null', () => {
      useCollaborationStore.getState().setOverwrittenMessage('消息');
      useCollaborationStore.getState().setOverwrittenMessage(null);
      expect(useCollaborationStore.getState().overwrittenMessage).toBeNull();
    });
  });

  describe('reset', () => {
    it('resets all state', () => {
      useCollaborationStore.getState().setOnlineCount(10);
      useCollaborationStore.getState().addLock({ keyPath: 'a', language: 'en', ip: '1', timestamp: 1 });
      useCollaborationStore.getState().setOverwrittenMessage('msg');
      useCollaborationStore.getState().reset();
      expect(useCollaborationStore.getState().onlineCount).toBe(0);
      expect(useCollaborationStore.getState().locks).toEqual({});
      expect(useCollaborationStore.getState().overwrittenMessage).toBeNull();
    });
  });
});
