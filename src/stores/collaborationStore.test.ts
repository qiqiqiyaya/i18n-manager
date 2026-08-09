import { describe, expect, it, beforeEach } from 'vitest';
import { useCollaborationStore } from './collaborationStore';

function initStore() {
  useCollaborationStore.setState({
    onlineCount: 0,
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
      useCollaborationStore.getState().setOverwrittenMessage('msg');
      useCollaborationStore.getState().reset();
      expect(useCollaborationStore.getState().onlineCount).toBe(0);
      expect(useCollaborationStore.getState().overwrittenMessage).toBeNull();
    });
  });
});
