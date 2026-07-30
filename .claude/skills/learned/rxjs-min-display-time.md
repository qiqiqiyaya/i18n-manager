---
name: rxjs-min-display-time
description: "Use RxJS Subject + timer + switchMap to enforce a minimum display time for transient UI states like saving/success"
user-invocable: false
origin: auto-extracted
---

# RxJS 最小显示时间模式

**Extracted:** 2026-07-29
**Context:** UI 状态指示器（如"保存中→已保存"）需要至少显示 800ms 避免一闪而过

## Problem
异步操作完成太快时（如本地保存 <50ms），UI 过渡状态"保存中..."会一闪而过，用户看不到反馈。直接用 `setTimeout` 会导致复杂的竞态条件。

## Solution
用 RxJS Subject 流管理状态转换，`timer` + `switchMap` 确保最小显示时间：

```typescript
import { Subject, timer } from 'rxjs';
import { filter, switchMap, tap } from 'rxjs/operators';

const SAVING_MIN_DISPLAY = 800;
const SAVED_AUTO_CLEAR = 2000;

// 保存开始信号
const savingStart$ = new Subject<number>();
// 保存结果信号
const saveResult$ = new Subject<{ success: boolean; error?: string }>();

let lastSavingStart = 0;
savingStart$.subscribe((ts) => { lastSavingStart = ts; });

saveResult$
  .pipe(
    switchMap((result) => {
      const elapsed = Date.now() - lastSavingStart;
      const delay = Math.max(0, SAVING_MIN_DISPLAY - elapsed);
      return timer(delay).pipe(
        tap(() => {
          if (result.success) {
            setStatus('saved');
            // 2s 后自动清除（仅当状态未被覆盖时）
            timer(SAVED_AUTO_CLEAR)
              .pipe(filter(() => getStatus() === 'saved'))
              .subscribe(() => setStatus('idle'));
          } else {
            setStatus('error', result.error);
          }
        })
      );
    })
  )
  .subscribe();

// 使用：
function onSave(data) {
  savingStart$.next(Date.now());
  setStatus('saving');
  socket.emit('save', data);
}

function onSaved(result) {
  saveResult$.next(result); // 自动延迟到满 800ms 后处理
}
```

## When to Use
- 任何需要"保存中→已保存"过渡动画/状态的 UI
- WebSocket/API 回执太快导致状态一闪而过
- 替代 `setTimeout` + `clearTimeout` 的竞态方案
- 其他需要最小显示时间的 transient 状态（如"已复制"、"已发送"等）