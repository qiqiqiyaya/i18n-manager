/**
 * Next.js 16.3.0 canary 兼容性修复
 *
 * AsyncLocalStorage 在 Node.js 中通过 require('async_hooks') 导入，
 * 不是全局变量。但 Next.js 检查 globalThis.AsyncLocalStorage。
 *
 * 此文件通过 --require 在 tsx/Node.js 加载任何模块之前执行，
 * 从而绕过 import hoisting 的限制。
 */
const { AsyncLocalStorage } = require('async_hooks');
if (typeof globalThis !== 'undefined' && !globalThis.AsyncLocalStorage) {
  globalThis.AsyncLocalStorage = AsyncLocalStorage;
}
