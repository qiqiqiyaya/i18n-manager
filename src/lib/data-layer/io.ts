import fs from 'fs-extra';
import path from 'path';
import * as properLockfile from 'proper-lockfile';

const DATA_DIR = process.env.DATA_DIR || './data';

/**
 * 获取项目数据根目录
 */
function getProjectDir(projectId: string): string {
  return path.join(DATA_DIR, 'projects', projectId);
}

/**
 * 确保项目目录存在
 */
async function ensureProjectDir(projectId: string): Promise<string> {
  const dir = getProjectDir(projectId);
  await fs.ensureDir(path.join(dir, 'locales'));
  return dir;
}

/**
 * 原子写入 JSON 文件
 * 使用 proper-lockfile 防止并发写冲突
 */
async function atomicWriteJson(filePath: string, data: any): Promise<void> {
  await fs.ensureDir(path.dirname(filePath));

  // 若文件不存在则先创建空文件，否则 proper-lockfile.lock 会因 lstat 失败而报错
  if (!(await fs.pathExists(filePath))) {
    await fs.writeJSON(filePath, {}, { spaces: 2 });
  }

  let releaseLock: (() => void) | null = null;
  try {
    releaseLock = await properLockfile.lock(filePath, {
      retries: {
        retries: 5,
        minTimeout: 50,
        maxTimeout: 200,
      },
      realpath: false,
    });

    const tmpPath = filePath + '.tmp';
    await fs.writeJSON(tmpPath, data, { spaces: 2 });
    await fs.move(tmpPath, filePath, { overwrite: true });
  } finally {
    if (releaseLock) {
      try {
        releaseLock();
      } catch {
        // 锁释放失败可忽略
      }
    }
  }
}

/**
 * 读取 JSON 文件，不存在时返回默认值
 */
async function readJson<T>(filePath: string, defaultValue: T): Promise<T> {
  try {
    if (await fs.pathExists(filePath)) {
      return await fs.readJson(filePath);
    }
    return defaultValue;
  } catch {
    return defaultValue;
  }
}

export { DATA_DIR, getProjectDir, ensureProjectDir, atomicWriteJson, readJson };
