# Final fix report: adapt nested import staging response

日期：2026-08-30

## 实现

- `StageResult` 同时描述后端嵌套 `{ batch, draft, drafts, reused }` 响应与已有 flat mock 字段，保留兼容性。
- 图片/PDF staging 优先使用 `draft.id`，仅在存在有效草稿 ID 时上传附件；`reused` 结果不上传。
- ANZ CSV staging 视为批量草稿结果，不调用单附件上传，也不把 `batch.id` 冒充 `draftId`。
- 同步生成 `pages/imports/index.js`，并增加嵌套 photo/CSV 回归测试。

## TDD 证据

### RED

```powershell
npm test -- --runInBand tests/imports-page.test.ts
```

输出：FAIL，7 tests 中 2 个新增回归测试失败。嵌套 photo 收到 `draftId: undefined`；嵌套 CSV 错误调用了一次附件上传。

### GREEN

```powershell
npm test -- --runInBand tests/imports-page.test.ts tests/imports-ai.test.ts
```

输出：PASS，2 suites、8 tests。

## 完整验证

```powershell
npm test -- --runInBand
npm run typecheck
npm run build:wechat
git diff --check
```

输出：25 suites、91 tests PASS；TypeScript typecheck 成功；微信构建成功；`git diff --check` 无错误（构建时仅有既有 LF/CRLF 提示）。

## Concerns

本次未修改 API。真实后端/微信 DevTools 与真机上传、CSV 批量草稿确认仍属于外部验收；本地测试仅验证客户端 staging/上传决策。
