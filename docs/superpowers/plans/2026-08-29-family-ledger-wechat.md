# 家庭手账微信小程序 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a native TypeScript WeChat Mini Program that uses the existing family-ledger API and PostgreSQL database, with Mock login available before a WeChat AppID exists.

**Architecture:** The new repository contains only the Mini Program frontend, its API client, Mock adapters, tests, and API contract. The existing `D:\self\家庭手账APP` repository remains the source of truth for NestJS/PostgreSQL ledger rules; it receives a focused `WechatIdentity` migration and `/v1/auth/wechat/login` endpoint. The Mini Program never connects to PostgreSQL and never contains `AppSecret` or MiniMax keys.

**Tech Stack:** WeChat native Mini Program, TypeScript, WXML, WXSS, Jest + ts-jest for pure TypeScript tests, existing NestJS 11/Prisma/PostgreSQL API, `wx.login`, `wx.request`, `wx.uploadFile`, and `wx.setStorageSync`.

## Global Constraints

- 前端：微信原生小程序 + TypeScript、WXML、WXSS。
- 仓库：独立前端仓库 `home-financial-assistance-wechat`；不复制 API 或数据库。
- 货币与统计：继续使用 NZD、整数 NZ 分、`Pacific/Auckland` 展示和统计。
- 登录：`wx.login`，由服务端换取微信身份；首次无邀请码时创建“我的家庭”并成为 owner，有邀请码时加入已有家庭。
- AppID：当前没有，先保留环境变量和 Mock 登录模式，正式环境再启用微信身份交换。
- AI 聊天：第一版使用普通请求返回完整回答；保留后端流式接口，不把分块流式作为小程序 MVP 阻塞项。
- 视觉与交互：青绿色家庭驾驶舱、单页快速记账、单页导入工作台、单项草稿复核、摘要优先报表、快捷问题 + 交易引用的 AI 聊天。
- MVP 不做：离线写入、AI 自动入账、Open Banking、投资/房产、多币种、预算、公开发布。
- 任何交易写入必须经现有 API；草稿在人工确认前不影响余额或报表。
- AppSecret、MiniMax Key、数据库连接串绝不进入小程序代码、构建产物或日志。

---

## File Map Before Coding

The following files are the planned ownership boundaries. A task may add a file only when it owns the responsibility listed here.

### New repository: `D:\self\家庭手账APP-wechat`

```text
app.json                         # page list, tab bar, window defaults
app.ts                           # app bootstrap and global session wiring
app.wxss                         # global tokens and accessible defaults
package.json                     # TypeScript/Jest tooling only
tsconfig.json                    # strict TS settings for src/tests
project.config.json              # WeChat DevTools project settings
src/api/client.ts                # wx.request wrapper, auth retry, error mapping
src/api/contracts.ts             # API DTOs and response types
src/auth/session-store.ts        # token storage and login state
src/auth/wechat-auth.ts          # wx.login and Mock login adapters
src/cache/read-cache.ts          # timestamped read-only cache
src/domain/money.ts              # NZ cents formatting and parsing
src/domain/period.ts             # month/quarter/year boundaries
src/shared/config.ts             # injected API URL and Mock flags
src/shared/copy.ts               # Simplified Chinese copy
src/shared/guards.ts             # response and input guards
components/amount-card/          # dashboard amount card
components/period-switch/        # month/quarter/year switch
components/transaction-row/      # transaction list row
components/draft-review-card/    # draft and duplicate review card
pages/login/                     # wx.login onboarding and invite flow
pages/dashboard/                 # household cockpit
pages/ledger/                    # transaction list and single-page entry
pages/imports/                   # photo/file/CSV workbench
pages/drafts/                    # one-at-a-time draft review
pages/reports/                   # summary and drill-down
pages/ai/                        # read-only AI chat
pages/recurring/                 # recurring templates
pages/household/                 # members and invites
pages/more/                      # export, settings, logout
tests/                           # pure TypeScript contract and domain tests
docs/api/wechat-auth.md          # frontend-visible auth contract
```

### Existing API repository: `D:\self\家庭手账APP`

```text
apps/api/prisma/schema.prisma
apps/api/prisma/migrations/0002_add_wechat_identity/migration.sql
apps/api/src/auth/auth.service.ts
apps/api/src/auth/auth.controller.ts
apps/api/src/auth/wechat-session.client.ts
apps/api/src/auth/wechat-session.client.test.ts
apps/api/src/auth/auth.service.test.ts
apps/api/src/app.module.ts
apps/api/.env.example
```

---

### Task 1: Scaffold the native Mini Program and test harness

**Files:**
- Create: `app.json`
- Create: `app.ts`
- Create: `app.wxss`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `project.config.json`
- Create: `src/shared/config.ts`
- Create: `tests/bootstrap.test.ts`

**Interfaces:**
- Produces `AppConfig.apiBaseUrl`, `AppConfig.mockAuth`, and a strict Jest command used by every later task.

- [ ] **Step 1: Write the failing bootstrap test**

```ts
import { getAppConfig } from '../src/shared/config';

test('uses a safe mock configuration when no AppID exists', () => {
  expect(getAppConfig({ API_BASE_URL: 'https://ledger-api.test/v1' })).toEqual({
    apiBaseUrl: 'https://ledger-api.test/v1',
    mockAuth: true,
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- --runInBand tests/bootstrap.test.ts`

Expected: FAIL because `src/shared/config.ts` does not exist.

- [ ] **Step 3: Add the minimal project files**

`src/shared/config.ts` must parse only an injected API URL and a boolean Mock flag; production builds must throw if the URL is empty or if Mock is explicitly enabled with `NODE_ENV=production`.

`app.json` must register these pages in order: `pages/login/index`, `pages/dashboard/index`, `pages/ledger/index`, `pages/imports/index`, `pages/drafts/index`, `pages/reports/index`, `pages/ai/index`, `pages/recurring/index`, `pages/household/index`, `pages/more/index` and define the four-tab navigation `首页`, `账目`, `报表`, `更多`.

`package.json` must expose:

```json
{
  "scripts": {
    "test": "jest --runInBand",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -- --runInBand tests/bootstrap.test.ts` and `npm run typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add app.json app.ts app.wxss package.json tsconfig.json project.config.json src/shared/config.ts tests/bootstrap.test.ts
git commit -m "chore: scaffold wechat mini program"
```

### Task 2: Build contracts, session storage, and Mock/WeChat login adapters

**Files:**
- Create: `src/api/contracts.ts`
- Create: `src/auth/session-store.ts`
- Create: `src/auth/wechat-auth.ts`
- Create: `src/shared/copy.ts`
- Create: `tests/session-store.test.ts`
- Create: `tests/wechat-auth.test.ts`
- Create: `docs/api/wechat-auth.md`

**Interfaces:**
- Produces `SessionStore.save(pair)`, `SessionStore.read()`, `SessionStore.clear()`, `WechatAuth.login(options)`, and `WechatAuthResult { accessToken, refreshToken, householdId, isNewUser }`.

- [ ] **Step 1: Write failing storage and adapter tests**

```ts
test('stores and clears tokens without exposing the refresh token in logs', () => {
  const storage = new MemoryStorage();
  const sessions = new SessionStore(storage);
  sessions.save({ accessToken: 'a', refreshToken: 'r', householdId: 'h' });
  expect(sessions.read()).toEqual({ accessToken: 'a', refreshToken: 'r', householdId: 'h' });
  sessions.clear();
  expect(sessions.read()).toBeNull();
});

test('Mock login creates the first household owner', async () => {
  const auth = new WechatAuth(mockConfig, wxLoginMock({ householdId: 'h-1', isNewUser: true }));
  await expect(auth.login({ householdName: '我的家庭' })).resolves.toEqual(
    expect.objectContaining({ householdId: 'h-1', isNewUser: true }),
  );
});
```

- [ ] **Step 2: Run tests to verify the missing interfaces fail**

Run: `npm test -- --runInBand tests/session-store.test.ts tests/wechat-auth.test.ts`

Expected: FAIL with missing module/interface errors.

- [ ] **Step 3: Implement the adapters**

`SessionStore` must use a single namespaced storage key, return `null` for malformed values, and never call `console.log` with token values. `WechatAuth.login` must call `wx.login`, then the API callback with `{ code, inviteCode?, householdName? }`; when `mockAuth` is true it must use a deterministic Mock adapter and never call a real WeChat API.

`contracts.ts` must define the exact token, dashboard, account, category, transaction, draft, duplicate, report, recurring, member, invite, AI and export DTOs already described by the existing `/v1` API.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -- --runInBand tests/session-store.test.ts tests/wechat-auth.test.ts` and `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/contracts.ts src/auth src/shared/copy.ts tests/session-store.test.ts tests/wechat-auth.test.ts docs/api/wechat-auth.md
git commit -m "feat: add wechat session and mock auth"
```

### Task 3: Add the existing API’s WeChat identity endpoint

**Files:**
- Modify: `D:\self\家庭手账APP\apps/api/prisma/schema.prisma`
- Create: `D:\self\家庭手账APP\apps/api/prisma/migrations/0002_add_wechat_identity/migration.sql`
- Create: `D:\self\家庭手账APP\apps/api/src/auth/wechat-session.client.ts`
- Create: `D:\self\家庭手账APP\apps/api/src/auth/wechat-session.client.test.ts`
- Modify: `D:\self\家庭手账APP\apps/api/src/auth/auth.service.ts`
- Modify: `D:\self\家庭手账APP\apps/api/src/auth/auth.controller.ts`
- Modify: `D:\self\家庭手账APP\apps/api/src/app.module.ts`
- Modify: `D:\self\家庭手账APP\apps/api/.env.example`
- Test: `D:\self\家庭手账APP\apps/api/src/auth/auth.service.test.ts`

**Interfaces:**
- Consumes `{ code, inviteCode?, householdName? }`.
- Produces `POST /v1/auth/wechat/login` with `{ accessToken, refreshToken, householdId, isNewUser }`.

- [ ] **Step 1: Write the failing API tests**

`WechatSessionClient` must be tested with a mocked HTTP client for success, malformed response, and WeChat error. `AuthService` tests must cover: existing identity token issue, new owner household creation, invite membership creation, expired invite rejection, and a race where only one transaction claims an invite.

- [ ] **Step 2: Run the focused API tests to verify they fail**

Run from `D:\self\家庭手账APP\apps\api`: `$env:DATABASE_URL='postgresql://ledger:ledger@localhost:5432/ledger'; npm test -- --runInBand src/auth/wechat-session.client.test.ts src/auth/auth.service.test.ts`

Expected: FAIL because the model, client, and service method do not exist.

- [ ] **Step 3: Add the Prisma model and migration**

Add `WechatIdentity` with `id`, `userId`, unique `openId`, optional `unionId`, `createdAt`, `updatedAt`, and a cascading User relation. Add the reverse relation to `User`. The migration must create the table, unique `openId` index, user foreign key, and timestamps without changing existing transaction tables.

- [ ] **Step 4: Implement the server-side code exchange and login**

`WechatSessionClient.exchangeCode(code)` must call the WeChat `jscode2session` endpoint only when `WECHAT_MOCK_MODE` is false. Mock mode must return `WECHAT_MOCK_OPENID` and a deterministic session key. `AuthService.loginWithWechat` must run first-user creation, invite claim, identity binding, membership creation, and token issuance in one Prisma transaction. A new user without an invite gets household name input or `我的家庭` and role `owner`; a new user with an invite gets role `member`. Existing users keep the first household membership behavior used by the current API.

- [ ] **Step 5: Run Prisma validation, tests, and build**

Run: `$env:DATABASE_URL='postgresql://ledger:ledger@localhost:5432/ledger'; npx prisma validate --schema prisma/schema.prisma; npx prisma generate; npm test -- --runInBand; npm run build`

Expected: schema valid, all existing tests plus new WeChat tests pass, and TypeScript build succeeds.

- [ ] **Step 6: Commit the API change in its existing repository**

```bash
git -C D:\self\家庭手账APP add apps/api/prisma apps/api/src/auth apps/api/src/app.module.ts apps/api/.env.example
git -C D:\self\家庭手账APP commit -m "feat: add wechat identity login"
```

### Task 4: Implement the shared API client, refresh, errors, and read cache

**Files:**
- Create: `src/api/client.ts`
- Create: `src/cache/read-cache.ts`
- Create: `src/domain/money.ts`
- Create: `src/domain/period.ts`
- Create: `src/shared/guards.ts`
- Create: `tests/api-client.test.ts`
- Create: `tests/money-period.test.ts`
- Modify: `src/auth/session-store.ts`

**Interfaces:**
- Produces `ApiClient.get(path, query)`, `ApiClient.post(path, body)`, `ApiClient.upload(path, file)`, and typed methods `fetchSummary`, `createTransaction`, `stageImport`, `confirmDraft`, `previewDuplicates`, `fetchReports`, `askAi`, `fetchMembers`, `createInvite`, `exportTransactions`.

- [ ] **Step 1: Write failing request tests**

Cover authorization headers, one refresh attempt after `401`, `409` duplicate mapping, JSON error extraction, multipart upload metadata, and no retry for a failed financial write. Cover `formatNzdMinor(8640) === 'NZ$86.40'`, negative liability formatting, and Auckland month/quarter/year UTC boundaries.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- --runInBand tests/api-client.test.ts tests/money-period.test.ts`

Expected: FAIL with missing client and domain functions.

- [ ] **Step 3: Implement the minimal client**

Use `wx.request` for JSON and `wx.uploadFile` for multipart. Attach a `Bearer` header containing the current access token, refresh once on `401`, then replay only idempotent reads; return typed `ApiError` for `401`, `409`, `413`, `422`, timeout, and unavailable network. Store only timestamped read data through `ReadCache`; never use cache to report a successful write.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -- --runInBand tests/api-client.test.ts tests/money-period.test.ts` and `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api src/cache src/domain src/shared/guards.ts tests/api-client.test.ts tests/money-period.test.ts
git commit -m "feat: add typed api client and read cache"
```

### Task 5: Build login, tabs, dashboard, and single-page ledger entry

**Files:**
- Create: `pages/login/index.ts`, `pages/login/index.wxml`, `pages/login/index.wxss`, `pages/login/index.json`
- Create: `pages/dashboard/index.ts`, `pages/dashboard/index.wxml`, `pages/dashboard/index.wxss`, `pages/dashboard/index.json`
- Create: `pages/ledger/index.ts`, `pages/ledger/index.wxml`, `pages/ledger/index.wxss`, `pages/ledger/index.json`
- Create: `components/amount-card/*`
- Create: `components/period-switch/*`
- Create: `components/transaction-row/*`
- Create: `tests/dashboard-page.test.ts`
- Create: `tests/ledger-page.test.ts`

**Interfaces:**
- Consumes `WechatAuth`, `ApiClient.fetchSummary`, `fetchAccounts`, `fetchCategories`, and `createTransaction`.
- Produces the A visual direction: green cockpit, period switch, floating `+`, single-page entry and explicit duplicate handling.

- [ ] **Step 1: Write failing page-model tests**

Test that an unauthenticated app routes to login, a successful Mock login routes to dashboard, the dashboard renders cached data with a cache label after API failure, and the ledger model sends integer NZ cents, selected category, UTC date, and a generated idempotency key.

- [ ] **Step 2: Run the tests and verify failure**

Run: `npm test -- --runInBand tests/dashboard-page.test.ts tests/ledger-page.test.ts`

Expected: FAIL because page models/components do not exist.

- [ ] **Step 3: Implement the page models and WXML/WXSS**

The dashboard must render net worth, income, expense, pending drafts, duplicate count, recurring reminders, and a recent transaction summary. The ledger page must keep direction, amount, account, category, date, note, and attachment actions on one screen. Validation must reject zero/negative amounts and missing accounts before calling the API. A `409` response must show the existing transaction details and only offer `稍后处理` or `保留两笔`.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -- --runInBand tests/dashboard-page.test.ts tests/ledger-page.test.ts` and `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pages/login pages/dashboard pages/ledger components/amount-card components/period-switch components/transaction-row tests/dashboard-page.test.ts tests/ledger-page.test.ts app.json app.ts app.wxss
git commit -m "feat: add dashboard and single-page ledger entry"
```

### Task 6: Add the single-page import workbench and human-confirmed drafts

**Files:**
- Create: `pages/imports/index.ts`, `pages/imports/index.wxml`, `pages/imports/index.wxss`, `pages/imports/index.json`
- Create: `pages/drafts/index.ts`, `pages/drafts/index.wxml`, `pages/drafts/index.wxss`, `pages/drafts/index.json`
- Create: `components/draft-review-card/*`
- Create: `tests/imports-page.test.ts`
- Create: `tests/drafts-page.test.ts`

**Interfaces:**
- Consumes `wx.chooseMedia`, `wx.chooseMessageFile`, `wx.getFileSystemManager().readFile`, `ApiClient.previewDocument`, `stageImport`, `uploadAttachment`, `fetchPendingDrafts`, and `confirmDraft`.
- Produces a staged draft flow with no balance mutation before confirmation.

- [ ] **Step 1: Write failing import/review tests**

Cover image/PDF/CSV selection, 20 MB/type rejection, AI failure preserving the original file, stage idempotency by file hash, account selection before confirmation, and duplicate choice persistence through the API call.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- --runInBand tests/imports-page.test.ts tests/drafts-page.test.ts`

Expected: FAIL because import and draft pages do not exist.

- [ ] **Step 3: Implement file selection and staging**

Use one workbench with `拍照`, `文件`, and `CSV` actions. Validate file signatures and size before upload; call document preview for image/PDF and ANZ preview/stage for CSV. Show AI confidence, original name, merchant, amount, date, and category. Upload the encrypted original only after the draft is staged.

- [ ] **Step 4: Implement one-at-a-time review**

Show `1 / N`, source file, editable fields, account selector, attachment preview, duplicate reasons, and buttons `修改草稿`, `确认入账`, `稍后处理`, `保留两笔`. Do not remove a duplicate candidate from the client without a successful server response.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- --runInBand tests/imports-page.test.ts tests/drafts-page.test.ts` and `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add pages/imports pages/drafts components/draft-review-card tests/imports-page.test.ts tests/drafts-page.test.ts
git commit -m "feat: add import workbench and draft review"
```

### Task 7: Add reports, drill-down, recurring bills, household management, and export

**Files:**
- Create: `pages/reports/index.ts`, `pages/reports/index.wxml`, `pages/reports/index.wxss`, `pages/reports/index.json`
- Create: `pages/recurring/index.ts`, `pages/recurring/index.wxml`, `pages/recurring/index.wxss`, `pages/recurring/index.json`
- Create: `pages/household/index.ts`, `pages/household/index.wxml`, `pages/household/index.wxss`, `pages/household/index.json`
- Create: `pages/more/index.ts`, `pages/more/index.wxml`, `pages/more/index.wxss`, `pages/more/index.json`
- Create: `tests/reports-page.test.ts`
- Create: `tests/household-page.test.ts`

**Interfaces:**
- Consumes typed report, recurring, member, invite, remove-member, and export methods from `ApiClient`.
- Produces the A summary-first report and owner-gated household actions.

- [ ] **Step 1: Write failing tests**

Cover month/quarter/year query parameters, category drill-down preserving the current period, recurring template creation/advance, member rendering, owner-only invite action, member removal confirmation, and UTF-8 CSV/JSON export handoff.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- --runInBand tests/reports-page.test.ts tests/household-page.test.ts`

Expected: FAIL because the page models do not exist.

- [ ] **Step 3: Implement reports and recurring pages**

Reports must render net cash flow first, then category/account rows with drill-down. Recurring bills must remind and advance `nextDueAt` but never auto-create a transaction. Use the existing Auckland period helpers for all queries.

- [ ] **Step 4: Implement household and more pages**

Render member role and username; owner can create a 1–30 day invite and copy the one-time code; member removal requires a confirmation modal. More contains recurring, household, exports, settings, and logout only.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- --runInBand tests/reports-page.test.ts tests/household-page.test.ts` and `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add pages/reports pages/recurring pages/household pages/more tests/reports-page.test.ts tests/household-page.test.ts
git commit -m "feat: add reports household and export pages"
```

### Task 8: Add read-only AI chat and final safety/error behavior

**Files:**
- Create: `pages/ai/index.ts`, `pages/ai/index.wxml`, `pages/ai/index.wxss`, `pages/ai/index.json`
- Create: `tests/ai-page.test.ts`
- Modify: `src/shared/copy.ts`
- Modify: `src/api/client.ts`
- Modify: `app.ts`

**Interfaces:**
- Consumes `ApiClient.askAi(message)` and returns answer, scope, and transaction citations.
- Produces a normal request/response chat; it never exposes SQL/tool names as executable controls.

- [ ] **Step 1: Write failing AI tests**

Cover quick-question chips, loading/timeout/error states, rendering scope and citations, deleting local chat history, and refusal to submit while offline.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- --runInBand tests/ai-page.test.ts`

Expected: FAIL because the AI page is missing.

- [ ] **Step 3: Implement the page**

Use the A interaction: quick chips `本月花最多的分类？`, `找出异常支出`, and `比较本季与上季`; show each answer’s period and transaction references; show a read-only notice; call ordinary JSON `/v1/ai/chat`; disable send when no network is available.

- [ ] **Step 4: Add global error and logout handling**

Clear tokens and private AI cache on logout. Route unrecoverable `401` to login, show explicit `409` duplicate/version messages, and display `缓存数据` when a read is served from cache. Never claim a write succeeded until the API response is successful.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test -- --runInBand tests/ai-page.test.ts` and `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add pages/ai src/shared/copy.ts src/api/client.ts app.ts tests/ai-page.test.ts
git commit -m "feat: add read-only ai chat"
```

### Task 9: Verification, Mock acceptance flow, and GitHub publication

**Files:**
- Create: `docs/acceptance/mock-flow.md`
- Create: `.github/workflows/test.yml`
- Modify: `README.md`
- Modify: `docs/superpowers/implementation-status.md`

**Interfaces:**
- Consumes all earlier page/API contracts.
- Produces reproducible local verification and a clean public repository without credentials.

- [ ] **Step 1: Add the automated workflow**

The workflow must run `npm ci`, `npm test -- --runInBand`, and `npm run typecheck` on Windows and Ubuntu runners. It must not require an AppID, AppSecret, database, MiniMax key, or WeChat network call.

- [ ] **Step 2: Run the complete local suite**

Run from `D:\self\家庭手账APP-wechat`: `npm ci; npm test -- --runInBand; npm run typecheck`

Expected: all frontend tests pass and no TypeScript errors. Run the existing API suite separately from `D:\self\家庭手账APP\apps\api` with Prisma validation and build.

- [ ] **Step 3: Execute the Mock acceptance flow in DevTools**

Follow `docs/acceptance/mock-flow.md`: first Mock login creates `我的家庭`; create account/category and one transaction; repeat save with the same idempotency key; import a sample CSV; review one draft; trigger duplicate handling; view month/quarter/year reports; ask the three AI quick questions; create an invite; join with a second Mock user; verify cached read and rejected offline write.

- [ ] **Step 4: Run repository safety checks**

Run: `git diff --check`, `git status --short`, and a secret scan over tracked files. Confirm no `AppSecret`, MiniMax key, database URL, token, or `project.private.config.json` is tracked.

- [ ] **Step 5: Create and publish the new GitHub repository**

Only after the local checks pass and the remote is confirmed absent:

```bash
gh repo create Allen-Jian/home-financial-assistance-wechat --public --source . --remote origin --push
```

If the name is already taken, stop and report the exact conflict instead of choosing another name silently.

- [ ] **Step 6: Record external blockers**

Document that real `wx.login` requires an AppID/AppSecret, legal request/upload domains, HTTPS, WeChat DevTools device verification, real MiniMax credentials, and the existing API deployment. Do not mark these as locally verified.

---

## Plan Self-Review

- **Spec coverage:** Shared API/database boundary is covered by Tasks 3–4; authentication by Tasks 2–3; dashboard and entry by Task 5; attachments/imports/drafts/duplicates by Task 6; reports/recurring/household/export by Task 7; AI by Task 8; tests and external gates by Task 9.
- **Placeholder scan:** No unresolved placeholder or unassigned implementation step is used. The migration directory is fixed as `0002_add_wechat_identity` so the API change remains reviewable.
- **Type consistency:** `WechatAuthResult`, `SessionStore`, `ApiClient`, `ReadCache`, and the typed DTOs are defined as the cross-task boundaries. Later tasks use the exact method names from earlier tasks.
- **Scope:** The new repository remains frontend-only. The only cross-repository change is the minimum WeChat identity/auth endpoint required to preserve the same API and database.
