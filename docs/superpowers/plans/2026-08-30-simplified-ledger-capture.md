# 简化记账与资产管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复微信真机导航和空选择器问题，并交付不显示账户/转账的拍照记账、手动记账、分类管理、账目筛选和定期存款资产记录。

**Architecture:** 共用 NestJS/Prisma API 保留账户表作为内部账本，仅给每个家庭暴露一个 `systemKey=PRIMARY` 的隐藏账户。微信小程序通过 HTTPS API 读写，不直接访问数据库；账目 tab 变为查询列表，手动表单和 AI 拍照流程放到独立非 tabBar 页面。现有 Flutter/API 的显式 `accountId` 调用继续兼容。

**Tech Stack:** 微信原生小程序 TypeScript/WXML/WXSS、Jest + ts-jest、NestJS 11、Prisma 6、PostgreSQL 17、现有 MiniMax 客户端和 `wx.chooseMedia`/`wx.chooseMessageFile`。

## Global Constraints

- 货币为 NZD 整数分；展示与统计时区为 `Pacific/Auckland`。
- 小程序只允许查看缓存离线数据；新增、导入、AI 和设置写入必须联网。
- AI 只生成草稿；用户明确确认前不得影响余额、报表或最近收支。
- 不在小程序、构建产物或日志中保存 MiniMax Key、微信 AppSecret、数据库 URL 或 token。
- 小程序不展示账户和转账；API 保留旧的显式账户/转账兼容能力。
- 定期存款本金是总资产组成部分，不作为支出，也不再次加到总资产；利息实际收到后按收入记账。
- 每项实现遵循 RED 测试 → 最小实现 → GREEN 测试 → 全量验证 → 小提交。

---

## File Map Before Coding

### API repository `D:\self\家庭手账APP`

```text
apps/api/prisma/schema.prisma                         # Account.systemKey, Category.active, TermDeposit
apps/api/prisma/migrations/0004_simplified_ledger/    # schema migration
apps/api/src/accounts/account.service.ts              # PRIMARY/default categories bootstrap and category lifecycle
apps/api/src/accounts/account.controller.ts           # category lifecycle and bootstrap endpoint
apps/api/src/ledger/ledger.service.ts                 # optional accountId resolution
apps/api/src/ledger/ledger.controller.ts              # optional accountId DTO
apps/api/src/drafts/draft.service.ts                  # optional accountId on confirmation
apps/api/src/drafts/draft.controller.ts               # optional accountId DTO
apps/api/src/term-deposits/                            # term deposit module
apps/api/src/app.module.ts                             # register new module
```

### Mini Program repository `D:\self\家庭手账APP-wechat`

```text
app.json                                             # four tabBar pages and new entry/settings pages
src/api/client.ts                                    # bootstrap, optional accountId, category/term-deposit APIs
src/api/contracts.ts                                 # new DTOs
pages/dashboard/                                     # home cockpit and quick entry
pages/entry/                                         # choose photo/manual
pages/entry/photo/                                   # AI photo overview and confirm/edit
pages/ledger/                                        # tabBar period list and detail entry point
pages/ledger/edit/                                   # manual income/expense form
pages/settings/                                      # settings tab, categories, assets, term deposits
pages/imports/                                       # photo/album/WeChat file/CSV workbench
tests/                                               # regression and integration-style page tests
```

---

### Task 1: Add hidden PRIMARY ledger and idempotent household bootstrap

**Files:**
- Modify: `D:\self\家庭手账APP\apps\api\prisma\schema.prisma`
- Create: `D:\self\家庭手账APP\apps\api\prisma\migrations\0004_simplified_ledger\migration.sql`
- Modify: `D:\self\家庭手账APP\apps\api\src\accounts\account.service.ts`
- Modify: `D:\self\家庭手账APP\apps\api\src\accounts\account.controller.ts`
- Modify: `D:\self\家庭手账APP\apps\api\src\auth\auth.service.ts`
- Test: `D:\self\家庭手账APP\apps\api\src\accounts\account.service.test.ts`
- Test: `D:\self\家庭手账APP\apps\api\src\auth\auth.service.test.ts`

**Interfaces:** `ensureLedgerDefaults(actorId, householdId)` returns `{ accountId, createdAccount, createdCategories }`; `Account.systemKey` is nullable with a household composite unique index; `Account.version` defaults to 0; `Category.active` defaults true; `setInitialAsset(actorId, householdId, amountMinor, expectedVersion)` returns the updated PRIMARY account and writes an audit event.

- [ ] **Step 1: Write the failing test**

```ts
it('creates PRIMARY and default categories exactly once', async () => {
  const prisma = { membership: { findUnique: jest.fn().mockResolvedValue({ role: 'owner' }) }, account: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'primary-1' }) }, category: { count: jest.fn().mockResolvedValue(0), createMany: jest.fn().mockResolvedValue({ count: 15 }) } };
  const service = new AccountService(prisma as never);
  await expect(service.ensureLedgerDefaults('u-1', 'h-1')).resolves.toMatchObject({ accountId: 'primary-1', createdAccount: true, createdCategories: 15 });
  await service.ensureLedgerDefaults('u-1', 'h-1');
  expect(prisma.account.create).toHaveBeenCalledTimes(1);
  expect(prisma.category.createMany).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run RED**

Run from `D:\self\家庭手账APP\apps\api`: `npm test -- --runInBand src/accounts/account.service.test.ts src/auth/auth.service.test.ts`.

Expected: FAIL because the bootstrap method, schema fields, and endpoint do not exist.

- [ ] **Step 3: Implement the minimum**

Add the migration and `ensureLedgerDefaults`. Seed the confirmed 10 expense and 5 income categories with `createMany({ skipDuplicates: true })`. Call it in the new-household WeChat login transaction and expose authenticated `POST /accounts/bootstrap` for existing empty households. Add authenticated `PATCH /accounts/primary/opening-balance` with `{ amountMinor, expectedVersion }`; update PRIMARY conditionally, increment its version, and write `asset.initial-balance.updated`.

- [ ] **Step 4: Run GREEN**

Run `npx prisma validate --schema prisma/schema.prisma` and the focused Jest command above. Expected: schema valid and tests pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/prisma apps/api/src/accounts apps/api/src/auth
git commit -m "feat: bootstrap hidden primary ledger"
```

### Task 2: Allow account-less writes and manage active categories

**Files:**
- Modify: `D:\self\家庭手账APP\apps\api\src\ledger\ledger.controller.ts`
- Modify: `D:\self\家庭手账APP\apps\api\src\ledger\ledger.service.ts`
- Modify: `D:\self\家庭手账APP\apps\api\src\drafts\draft.controller.ts`
- Modify: `D:\self\家庭手账APP\apps\api\src\drafts\draft.service.ts`
- Modify: `D:\self\家庭手账APP\apps\api\src\accounts\account.controller.ts`
- Modify: `D:\self\家庭手账APP\apps\api\src\accounts\account.service.ts`
- Test: `D:\self\家庭手账APP\apps\api\src\ledger\ledger.service.test.ts`
- Test: `D:\self\家庭手账APP\apps\api\src\drafts\draft.service.test.ts`
- Test: `D:\self\家庭手账APP\apps\api\src\accounts\account.service.test.ts`

**Interfaces:** `CreateTransactionDto.householdId?: string` and `accountId?: string`; `ConfirmDraftDto.accountId?: string`; missing IDs resolve PRIMARY, explicit IDs retain old behavior; category lifecycle uses `PATCH /categories/:id` with `{ name?: string, active?: boolean }`.

- [ ] **Step 1: Write the failing test**

```ts
it('writes a transaction to PRIMARY when accountId is omitted', async () => {
  const prisma = { membership: { findUnique: jest.fn().mockResolvedValue({ role: 'owner' }) }, account: { findFirst: jest.fn().mockResolvedValue({ id: 'primary-1' }) }, accountMovement: { create: jest.fn() }, transaction: { create: jest.fn() } };
  const service = new LedgerService(prisma as never);
  await service.createTransaction('u-1', { householdId: 'h-1', direction: 'expense', amountMinor: 1200, categoryId: 'c-1', idempotencyKey: 'k-1', occurredAt: new Date('2026-08-20T00:00:00Z') });
  expect(prisma.accountMovement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ accountId: 'primary-1' }) }));
});
```

- [ ] **Step 2: Run RED**

Run `npm test -- --runInBand src/ledger/ledger.service.test.ts src/drafts/draft.service.test.ts src/accounts/account.service.test.ts` from `D:\self\家庭手账APP\apps\api`. Expected: FAIL because account ID is still required and lifecycle methods are absent.

- [ ] **Step 3: Implement the minimum**

Resolve PRIMARY only when `accountId` is missing, including before duplicate preview in `LedgerController`, reject if bootstrap cannot find it, and add authenticated category rename/active updates. Inactive categories are omitted from new-entry lists and never physically deleted.

- [ ] **Step 4: Run GREEN**

Run the focused Jest command again followed by `npm run build`. Expected: all focused tests and the API build pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/ledger apps/api/src/drafts apps/api/src/accounts
git commit -m "feat: support account-less mini-program writes"
```

### Task 3: Add term-deposit asset records

**Files:**
- Modify: `D:\self\家庭手账APP\apps\api\prisma\schema.prisma`
- Create: `D:\self\家庭手账APP\apps\api\prisma\migrations\0005_term_deposits\migration.sql`
- Create: `D:\self\家庭手账APP\apps\api\src\term-deposits\term-deposit.service.ts`
- Create: `D:\self\家庭手账APP\apps\api\src\term-deposits\term-deposit.controller.ts`
- Create: `D:\self\家庭手账APP\apps\api\src\term-deposits\term-deposit.module.ts`
- Modify: `D:\self\家庭手账APP\apps\api\src\app.module.ts`
- Test: `D:\self\家庭手账APP\apps\api\src\term-deposits\term-deposit.service.test.ts`

**Interfaces:** `TermDepositService.list/create/update/close`; fields are `name`, `principalMinor`, `annualRateBasisPoints`, `startedAt`, `maturesAt`, `status`, `note`, `version`; routes are `GET/POST /term-deposits` and versioned close/update routes.

- [ ] **Step 1: Write the failing test**

```ts
it('creates term-deposit metadata without a transaction or income', async () => {
  const prisma = { membership: { findUnique: jest.fn().mockResolvedValue({ role: 'owner' }) }, termDeposit: { create: jest.fn().mockResolvedValue({ principalMinor: 100000, status: 'active' }) }, transaction: { create: jest.fn() } };
  const service = new TermDepositService(prisma as never);
  await expect(service.create('u-1', 'h-1', { name: '银行定存', principalMinor: 100000, annualRateBasisPoints: 375, startedAt: '2026-08-01', maturesAt: '2027-02-01', note: '' })).resolves.toMatchObject({ principalMinor: 100000, status: 'active' });
  expect(prisma.transaction.create).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run RED**

Run `npm test -- --runInBand src/term-deposits/term-deposit.service.test.ts` from `D:\self\家庭手账APP\apps\api`. Expected: FAIL because the module and model do not exist.

- [ ] **Step 3: Implement the minimum**

Validate positive principal, non-negative rate, and `maturesAt > startedAt`; enforce household membership and `expectedVersion`. Creating or closing metadata must not call transaction or movement creation.

- [ ] **Step 4: Run GREEN**

Run `npx prisma validate --schema prisma/schema.prisma`, the focused Jest command, and `npm run build`. Expected: all pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/prisma apps/api/src/term-deposits apps/api/src/app.module.ts
git commit -m "feat: track term deposit assets"
```

### Task 4: Replace tab navigation and add the entry chooser

**Files:**
- Modify: `D:\self\家庭手账APP-wechat\app.json`
- Modify: `D:\self\家庭手账APP-wechat\pages\dashboard\index.ts`
- Modify: `D:\self\家庭手账APP-wechat\pages\dashboard\index.wxml`
- Modify: `D:\self\家庭手账APP-wechat\pages\dashboard\index.js`
- Create: `D:\self\家庭手账APP-wechat\pages\entry\index.ts`
- Create: `D:\self\家庭手账APP-wechat\pages\entry\index.wxml`
- Create: `D:\self\家庭手账APP-wechat\pages\entry\index.wxss`
- Create: `D:\self\家庭手账APP-wechat\pages\entry\index.json`
- Test: `D:\self\家庭手账APP-wechat\tests\entry-page.test.ts`
- Modify: `D:\self\家庭手账APP-wechat\tests\runtime-pages.test.ts`

**Interfaces:** `createEntryPage()` exposes `openPhoto()` and `openManual()`. Dashboard `onQuickEntry()` navigates to `/pages/entry/index`; dashboard ledger links call `wx.switchTab({ url: '/pages/ledger/index' })`. `app.json` tabBar is exactly 首页、账目、AI聊天、设置.

- [ ] **Step 1: Write the failing test**

```ts
test('quick entry opens chooser and ledger links switch tab', () => {
  const navigateTo = jest.fn();
  const switchTab = jest.fn();
  (globalThis as { wx?: unknown }).wx = { navigateTo, switchTab };
  const page = createDashboardPage(new DashboardPageModel({ fetchSummary: jest.fn().mockResolvedValue({ netWorthMinor: 0, incomeMinor: 0, expenseMinor: 0, categoryBreakdown: [], accountBreakdown: [] }), fetchAccounts: jest.fn().mockResolvedValue([]), fetchCategories: jest.fn().mockResolvedValue([]) }));
  page.onQuickEntry();
  page.onOpenLedger();
  expect(navigateTo).toHaveBeenCalledWith({ url: '/pages/entry/index' });
  expect(switchTab).toHaveBeenCalledWith({ url: '/pages/ledger/index' });
});
```

- [ ] **Step 2: Run RED**

Run `npm test -- --runInBand tests/entry-page.test.ts tests/runtime-pages.test.ts` from `D:\self\家庭手账APP-wechat`. Expected: FAIL because the chooser and `onOpenLedger` do not exist and the plus button points to a tab page.

- [ ] **Step 3: Implement the minimum**

Add the two-card chooser and register its non-tabBar page. Replace every dashboard link to the ledger tab with `switchTab`; keep unrelated theme and cache code unchanged.

- [ ] **Step 4: Run GREEN**

Run the focused Jest command, `npm run typecheck`, and `npm run build:wechat`. Expected: all pass.

- [ ] **Step 5: Commit**

```powershell
git add app.json pages/dashboard pages/entry tests/entry-page.test.ts tests/runtime-pages.test.ts
git commit -m "fix: route quick entry through chooser"
```

### Task 5: Implement manual entry and AI photo confirmation

**Files:**
- Create: `D:\self\家庭手账APP-wechat\pages\ledger\edit\index.ts`
- Create: `D:\self\家庭手账APP-wechat\pages\ledger\edit\index.wxml`
- Create: `D:\self\家庭手账APP-wechat\pages\ledger\edit\index.wxss`
- Create: `D:\self\家庭手账APP-wechat\pages\ledger\edit\index.json`
- Create: `D:\self\家庭手账APP-wechat\pages\entry\photo\index.ts`
- Create: `D:\self\家庭手账APP-wechat\pages\entry\photo\index.wxml`
- Create: `D:\self\家庭手账APP-wechat\pages\entry\photo\index.wxss`
- Create: `D:\self\家庭手账APP-wechat\pages\entry\photo\index.json`
- Modify: `D:\self\家庭手账APP-wechat\src\api\client.ts`
- Modify: `D:\self\家庭手账APP-wechat\src\api\contracts.ts`
- Test: `D:\self\家庭手账APP-wechat\tests\manual-entry.test.ts`
- Test: `D:\self\家庭手账APP-wechat\tests\photo-entry.test.ts`

**Interfaces:** `ManualEntryPageModel.submit()` sends direction, amountMinor, categoryId, occurredAt, note, and idempotencyKey without accountId. `PhotoEntryPageModel` exposes `analyze(file)`, `updateDraft(patch)`, and `confirm()`; confirmation requires an explicit user action and omits accountId.

- [ ] **Step 1: Write the failing test**

```ts
test('manual entry sends no accountId', async () => {
  const createTransaction = jest.fn().mockResolvedValue({ id: 'tx-1' });
  const model = new ManualEntryPageModel({ createTransaction, fetchCategories: jest.fn().mockResolvedValue([{ id: 'c-1', name: '餐饮', direction: 'expense', active: true }]) }, () => 'idem-1');
  model.setAmount('18.90'); model.setCategory('c-1');
  await expect(model.submit()).resolves.toBe(true);
  expect(createTransaction).toHaveBeenCalledWith(expect.not.objectContaining({ accountId: expect.anything() }));
});

test('AI failure keeps the original selected file', async () => {
  const model = new PhotoEntryPageModel({ parseDraft: jest.fn().mockRejectedValue(new Error('AI unavailable')) });
  await expect(model.analyze({ path: '/tmp/receipt.jpg', name: 'receipt.jpg' })).resolves.toBe(false);
  expect(model.state.originalPreserved).toBe(true);
});
```

- [ ] **Step 2: Run RED**

Run `npm test -- --runInBand tests/manual-entry.test.ts tests/photo-entry.test.ts` from `D:\self\家庭手账APP-wechat`. Expected: FAIL because the new models do not exist.

- [ ] **Step 3: Implement the minimum**

Manual page loads only active categories and validates positive amount/date. Photo page reuses the current picker and draft API, renders an editable overview, preserves files on AI errors, and calls draft confirmation only from the confirm button.

- [ ] **Step 4: Run GREEN**

Run the focused tests plus `tests/api-client.test.ts`, then `npm run typecheck` and `npm run build:wechat`. Expected: all pass.

- [ ] **Step 5: Commit**

```powershell
git add pages/ledger/edit pages/entry/photo src/api tests/manual-entry.test.ts tests/photo-entry.test.ts
git commit -m "feat: add manual and photo ledger entry flows"
```

### Task 6: Add category, initial-asset, and term-deposit settings pages

**Files:**
- Modify: `D:\self\家庭手账APP-wechat\pages\more\index.ts`
- Modify: `D:\self\家庭手账APP-wechat\pages\more\index.wxml`
- Modify: `D:\self\家庭手账APP-wechat\pages\more\index.js`
- Create: `D:\self\家庭手账APP-wechat\pages\settings\categories\index.ts`
- Create: `D:\self\家庭手账APP-wechat\pages\settings\categories\index.wxml`
- Create: `D:\self\家庭手账APP-wechat\pages\settings\term-deposits\index.ts`
- Create: `D:\self\家庭手账APP-wechat\pages\settings\term-deposits\index.wxml`
- Create: `D:\self\家庭手账APP-wechat\pages\settings\assets\index.ts`
- Create: `D:\self\家庭手账APP-wechat\pages\settings\assets\index.wxml`
- Test: `D:\self\家庭手账APP-wechat\tests\settings-pages.test.ts`

**Interfaces:** category model methods are `load`, `create`, `rename`, `setActive`; asset model exposes `load` and audited `saveInitialAsset`, calling `PATCH /accounts/primary/opening-balance` with `{ amountMinor, expectedVersion }`; term-deposit model exposes `load`, `create`, `close(id, expectedVersion)`.

- [ ] **Step 1: Write the failing test**

```ts
test('category management deactivates without deleting history', async () => {
  const api = { updateCategory: jest.fn().mockResolvedValue({ id: 'c-1', active: false }) };
  await expect(new CategorySettingsModel(api).setActive('c-1', false)).resolves.toBe(true);
  expect(api.updateCategory).toHaveBeenCalledWith('c-1', { active: false });
});

test('term-deposit creation calls metadata API only', async () => {
  const api = { createTermDeposit: jest.fn().mockResolvedValue({ id: 'td-1', status: 'active' }) };
  await expect(new TermDepositSettingsModel(api).create({ name: '定存', principalMinor: 100000, annualRateBasisPoints: 375, startedAt: '2026-08-01', maturesAt: '2027-02-01' })).resolves.toBe(true);
  expect(api.createTermDeposit).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run RED**

Run `npm test -- --runInBand tests/settings-pages.test.ts`. Expected: FAIL because settings models and routes do not exist.

- [ ] **Step 3: Implement the minimum**

Repurpose `more` as 设置, link category/initial-asset/term-deposit pages, and render active/inactive states. Do not add account or transfer controls. The asset page sends the initial balance to the audited API endpoint.

- [ ] **Step 4: Run GREEN**

Run the focused test, `tests/theme.test.ts`, `npm run typecheck`, and `npm run build:wechat`. Expected: all pass.

- [ ] **Step 5: Commit**

```powershell
git add pages/more pages/settings src/api tests/settings-pages.test.ts
git commit -m "feat: add category and asset settings"
```

### Task 7: Make账目 a period list and add dashboard asset summary

**Files:**
- Modify: `D:\self\家庭手账APP-wechat\pages\ledger\index.ts`
- Modify: `D:\self\家庭手账APP-wechat\pages\ledger\index.wxml`
- Modify: `D:\self\家庭手账APP-wechat\pages\ledger\index.wxss`
- Modify: `D:\self\家庭手账APP-wechat\src\api\client.ts`
- Modify: `D:\self\家庭手账APP-wechat\src\api\contracts.ts`
- Modify: `D:\self\家庭手账APP-wechat\pages\dashboard\index.ts`
- Modify: `D:\self\家庭手账APP-wechat\pages\dashboard\index.wxml`
- Test: `D:\self\家庭手账APP-wechat\tests\ledger-list.test.ts`
- Test: `D:\self\家庭手账APP-wechat\tests\dashboard-page.test.ts`

**Interfaces:** `LedgerListPageModel.load(period)` and `setPeriod(mode, from?, to?)`; `ApiClient.fetchTransactions(period)`; `DashboardSummary` gains `totalAssetsMinor`, `initialAssetsMinor`, and `termDepositMinor` while retaining incomeMinor/expenseMinor.

- [ ] **Step 1: Write the failing test**

```ts
test('ledger defaults to Auckland month and accepts a custom range', async () => {
  const api = { fetchTransactions: jest.fn().mockResolvedValue([]) };
  const model = new LedgerListPageModel(api, () => new Date('2026-08-20T00:00:00Z'));
  await model.load(model.currentPeriod());
  expect(api.fetchTransactions).toHaveBeenCalledWith(expect.objectContaining({ from: expect.stringContaining('2026-08-01') }));
  model.setPeriod('custom', '2026-01-01', '2026-03-31');
  expect(model.state.period.from).toBe('2026-01-01');
});
```

- [ ] **Step 2: Run RED**

Run `npm test -- --runInBand tests/ledger-list.test.ts tests/dashboard-page.test.ts` from `D:\self\家庭手账APP-wechat`. Expected: FAIL because the tab page is still the manual form and asset overview fields are absent.

- [ ] **Step 3: Implement the minimum**

Repurpose `pages/ledger/index` as the list, retain Auckland boundaries from `src/domain/period.ts`, add month/year/custom filters and a read-only detail route, and show total assets plus term-deposit allocation on the dashboard.

- [ ] **Step 4: Run GREEN**

Run the focused tests, `tests/money-period.test.ts`, `npm run typecheck`, and `npm run build:wechat`. Expected: all pass.

- [ ] **Step 5: Commit**

```powershell
git add pages/ledger pages/dashboard src/api tests/ledger-list.test.ts tests/dashboard-page.test.ts
git commit -m "feat: add period ledger list and asset summary"
```

### Task 8: Update import choices and execute full verification

**Files:**
- Modify: `D:\self\家庭手账APP-wechat\pages\imports\index.ts`
- Modify: `D:\self\家庭手账APP-wechat\pages\imports\index.wxml`
- Modify: `D:\self\家庭手账APP-wechat\pages\imports\index.js`
- Modify: `D:\self\家庭手账APP-wechat\tests\imports-page.test.ts`
- Modify: `D:\self\家庭手账APP-wechat\app.json`
- Modify: `D:\self\家庭手账APP-wechat\docs\acceptance\full-functional-test-list.md`
- Test: `D:\self\家庭手账APP-wechat\tests\imports-page.test.ts`

**Interfaces:** `ImportPickerPort` adds `chooseAlbum()`; `ImportPageModel.chooseAlbum()` uses album-only `wx.chooseMedia`; `choosePhoto()` uses camera-only `wx.chooseMedia`; `chooseFile()` remains `wx.chooseMessageFile`. WXML labels are 拍照、相册、微信文件、CSV.

- [ ] **Step 1: Write the failing test**

```ts
test('album selection is distinct from camera and WeChat file selection', async () => {
  const { model, picker } = makeModel([image]);
  await expect(model.chooseAlbum()).resolves.toBe(true);
  expect(picker.chooseAlbum).toHaveBeenCalledTimes(1);
  expect(model.state.sourceType).toBe('manual-photo');
});
```

- [ ] **Step 2: Run RED**

Run `npm test -- --runInBand tests/imports-page.test.ts` from `D:\self\家庭手账APP-wechat`. Expected: FAIL because `chooseAlbum` is not present.

- [ ] **Step 3: Implement the minimum**

Add the album adapter and button while retaining the 20 MB limit, signature checks, hash idempotency, staging order, attachment upload and AI failure recovery. Do not claim that WeChat files are a general OS file picker.

- [ ] **Step 4: Run full verification**

Mini Program from `D:\self\家庭手账APP-wechat`:

```powershell
npm test -- --runInBand
npm run typecheck
npm run build:wechat
git diff --check
```

API from `D:\self\家庭手账APP\apps\api`:

```powershell
$env:DATABASE_URL='postgresql://ledger:ledger@localhost:5432/ledger'
npx prisma validate --schema prisma/schema.prisma
npx prisma generate --schema prisma/schema.prisma
npm test -- --runInBand
npm run build
git diff --check
```

Expected: all suites pass, TypeScript builds pass, Prisma schema is valid, and diff check is clean.

- [ ] **Step 5: Commit and record external gates**

```powershell
git add app.json pages/imports tests/imports-page.test.ts docs/acceptance/full-functional-test-list.md
git commit -m "feat: add album import option"
```

Then verify in WeChat DevTools: WXML compilation, dashboard plus, manual entry, default categories, category management, album picker and console errors. On a real device verify login, camera permission, album selection, a redacted receipt, AI failure fallback and date filters. Mark these as manual/external, not automated passes.

## Verification Matrix and Commit Order

1. API `feat: bootstrap hidden primary ledger`
2. API `feat: support account-less mini-program writes`
3. API `feat: track term deposit assets`
4. Mini Program `fix: route quick entry through chooser`
5. Mini Program `feat: add manual and photo ledger entry flows`
6. Mini Program `feat: add category and asset settings`
7. Mini Program `feat: add period ledger list and asset summary`
8. Mini Program `feat: add album import option`

Before pushing, verify both worktrees are clean, record local and remote HEADs, and mark only actually executed tests as passed. Production migrations require a database backup and rollback note; real WeChat login, camera, album, redacted receipt, HTTPS and backup-restore remain manual/external gates.
