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

# Final fix report: avoid double-counting metadata-only term deposits

日期：2026-08-30

API commit：`a1aa314 fix: avoid double-counting term deposits`

## 实现

- 报告中的 `totalAssetsMinor` 与 `netWorthMinor` 继续以账户资产/负债账本计算，不再额外加上 metadata-only 定存本金。
- `termDepositMinor` 保留为 active/matured 定存本金展示字段；closed 定存仍排除。
- 新增回归测试：账户资产余额 `100000`、active 定存本金 `100000` 且无账户 movement 时，资产总额与净资产均为 `100000`，避免双计。
- 账户/负债计算语义未改变；旧定存报告测试同步改为验证定存展示不改变账户派生资产。

## TDD 证据

### RED

```powershell
npm test -- --runInBand src/reports/report.service.test.ts
```

输出：FAIL，3 tests 中新增回归测试失败；收到 `netWorthMinor: 200000`、`totalAssetsMinor: 200000`，预期均为 `100000`。其余 2 tests 通过。

### GREEN

```powershell
npm test -- --runInBand src/reports/report.service.test.ts
```

输出：PASS，1 suite、3 tests。

## 完整验证

```powershell
npm test -- --runInBand
npm run build
$env:DATABASE_URL = 'postgresql://ledger:ledger@localhost:5432/ledger'; npx prisma validate
$env:DATABASE_URL = 'postgresql://ledger:ledger@localhost:5432/ledger'; npx prisma generate
git diff --check
```

输出：25 suites、104 tests PASS；TypeScript build 成功；Prisma schema valid；Prisma Client v6.19.3 生成成功；`git diff --check` 无空白错误（仅有 LF/CRLF 行尾提示）。

## Concerns

本修复假设账户余额是资产/净资产的权威账本，定存记录仅作 metadata 展示；因此若调用方把本金排除在账户余额之外，报告不会再从定存 metadata 额外补入资产。真实数据库、部署与客户端验收仍需外部验证。
