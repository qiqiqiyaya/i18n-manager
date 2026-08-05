import { describe, expect, it, vi, beforeEach } from 'vitest';
import path from 'path';

const mockFs = {
  ensureDir: vi.fn(),
  pathExists: vi.fn(),
  writeJSON: vi.fn(),
  readJson: vi.fn(),
  move: vi.fn(),
};

const mockLockfile = {
  lock: vi.fn(),
};

vi.mock('fs-extra', () => ({ default: mockFs, ...mockFs }));
vi.mock('proper-lockfile', () => ({ default: mockLockfile, ...mockLockfile }));

const { atomicWriteJson, readJson, ensureProjectDir } = await import('./io');

describe('io', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('atomicWriteJson', () => {
    it('creates empty file first if not exists, then locks and writes', async () => {
      mockFs.pathExists.mockResolvedValue(false);
      mockLockfile.lock.mockResolvedValue(vi.fn());
      mockFs.writeJSON.mockResolvedValue(undefined);
      mockFs.move.mockResolvedValue(undefined);

      await atomicWriteJson('/data/projects/test/meta.json', { key: 'value' });

      // Creates empty file first
      expect(mockFs.pathExists).toHaveBeenCalledWith('/data/projects/test/meta.json');
      expect(mockFs.writeJSON).toHaveBeenNthCalledWith(1, '/data/projects/test/meta.json', {}, { spaces: 2 });
      expect(mockLockfile.lock).toHaveBeenCalled();
      // Writes to tmp, then moves
      expect(mockFs.writeJSON).toHaveBeenNthCalledWith(2, '/data/projects/test/meta.json.tmp', { key: 'value' }, { spaces: 2 });
      expect(mockFs.move).toHaveBeenCalledWith('/data/projects/test/meta.json.tmp', '/data/projects/test/meta.json', { overwrite: true });
    });

    it('skips empty file creation if already exists', async () => {
      mockFs.pathExists.mockResolvedValue(true);
      mockLockfile.lock.mockResolvedValue(vi.fn());
      mockFs.writeJSON.mockResolvedValue(undefined);
      mockFs.move.mockResolvedValue(undefined);

      await atomicWriteJson('/data/projects/test/meta.json', {});

      // Should not create empty file
      expect(mockFs.writeJSON).toHaveBeenCalledTimes(1); // only the tmp write
      expect(mockFs.writeJSON).toHaveBeenCalledWith('/data/projects/test/meta.json.tmp', {}, { spaces: 2 });
    });

    it('releases lock after write', async () => {
      const release = vi.fn();
      mockFs.pathExists.mockResolvedValue(true);
      mockLockfile.lock.mockResolvedValue(release);
      mockFs.writeJSON.mockResolvedValue(undefined);
      mockFs.move.mockResolvedValue(undefined);

      await atomicWriteJson('/data/projects/test/meta.json', {});

      expect(release).toHaveBeenCalledOnce();
    });

    it('releases lock on error', async () => {
      const release = vi.fn();
      mockFs.pathExists.mockResolvedValue(true);
      mockLockfile.lock.mockResolvedValue(release);
      mockFs.writeJSON.mockRejectedValueOnce(new Error('write error'));

      await expect(atomicWriteJson('/data/projects/test/meta.json', {})).rejects.toThrow('write error');
      expect(release).toHaveBeenCalledOnce();
    });

    it('handles lock release failure gracefully', async () => {
      const release = vi.fn(() => { throw new Error('release failed'); });
      mockFs.pathExists.mockResolvedValue(true);
      mockLockfile.lock.mockResolvedValue(release);
      mockFs.writeJSON.mockResolvedValue(undefined);
      mockFs.move.mockResolvedValue(undefined);

      await expect(atomicWriteJson('/data/projects/test/meta.json', {})).resolves.toBeUndefined();
      expect(release).toHaveBeenCalledOnce();
    });

    it('handles lock acquisition failure (releaseLock stays null)', async () => {
      mockFs.pathExists.mockResolvedValue(true);
      mockLockfile.lock.mockRejectedValueOnce(new Error('lock failed'));

      await expect(atomicWriteJson('/data/projects/test/meta.json', {})).rejects.toThrow('lock failed');
    });
  });

  describe('readJson', () => {
    it('reads file if exists', async () => {
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readJson.mockResolvedValue({ key: 'value' });

      const result = await readJson('/data/projects/test/meta.json', {});
      expect(result).toEqual({ key: 'value' });
    });

    it('returns default if file does not exist', async () => {
      mockFs.pathExists.mockResolvedValue(false);

      const result = await readJson('/data/projects/test/meta.json', { default: true });
      expect(result).toEqual({ default: true });
    });

    it('returns default on read error', async () => {
      mockFs.pathExists.mockResolvedValue(true);
      mockFs.readJson.mockRejectedValueOnce(new Error('read error'));

      const result = await readJson('/data/projects/test/meta.json', null);
      expect(result).toBeNull();
    });
  });

  describe('ensureProjectDir', () => {
    it('creates project directory with locales subdir', async () => {
      mockFs.ensureDir.mockResolvedValue(undefined);

      const result = await ensureProjectDir('test-proj');
      expect(result).toBe(path.join('data', 'projects', 'test-proj'));
      expect(mockFs.ensureDir).toHaveBeenCalledWith(path.join('data', 'projects', 'test-proj', 'locales'));
    });
  });
});
