# Family Ledger WeChat AI and Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the already-working WeChat Mini Program MVP with the confirmed J visual system, automatic system dark mode, AI receipt/bill draft parsing, private multi-turn read-only chat, and dashboard insights.

**Architecture:** Keep the Mini Program frontend in `D:\self\家庭手账APP-wechat` and the existing NestJS/PostgreSQL API in `D:\self\家庭手账APP`. Raw images/PDFs and natural-language input use a separate AI ingestion path that produces a `TransactionDraft`; only human-confirmed transactions enter the ledger. Chat uses a separate member-private conversation store and a whitelist of read-only report/search tools, so chat never receives raw attachments and cannot mutate financial data.

**Tech Stack:** WeChat native Mini Program, TypeScript, WXML, WXSS, Jest + ts-jest, NestJS 11, Prisma, PostgreSQL, MiniMax M3, existing `wx.uploadFile`/`wx.request` client.

## Global Constraints

- Frontend remains a native TypeScript WeChat Mini Program and never connects directly to PostgreSQL.
- Currency remains NZD represented as integer NZ cents; display/statistics timezone remains `Pacific/Auckland`.
- The J palette is the source of truth: primary `#155EEF`, secondary `#4A9BFF`, light background `#F3F7FF`, dark background `#0B1220`, light text `#17263F`, dark text `#F3F7FF`, expense `#F15B6C`, income `#138A72`.
- `app.json` enables system dark-mode support; WXSS must switch automatically from the system preference without a manual toggle.
- Images/PDFs/natural language create drafts only; no AI result may write a transaction before explicit user confirmation.
- Chat history is private to the initiating member, stored server-side for 90 days by default, deletable, and never shared with other household members.
- Chat may analyze only confirmed data visible to the member’s household membership; it cannot read raw attachments, execute SQL, or call write APIs.
- All AI output is validated against a JSON schema; malformed or unavailable AI responses preserve the original input and expose a retry/manual-entry path.
- AppSecret, MiniMax key, database URLs, access tokens, and refresh tokens must not enter frontend code, tracked files, or logs.
- Offline mode remains read-only cache access; imports, writes, and AI requests require a live network.

---

## File Map Before Coding

### WeChat repository: `D:\self\家庭手账APP-wechat`

```text
app.json, app.wxss                         # dark-mode switch and global J tokens
src/shared/theme.ts                        # typed light/dark palette tokens
src/api/contracts.ts                       # draft, chat, insight DTOs
src/api/client.ts                          # parse, conversation, insight methods
pages/imports/index.ts,wxml,wxss           # natural-language and attachment staging
pages/ai/index.ts,wxml,wxss                # multi-turn private chat UI
pages/dashboard/index.ts,wxml,wxss         # read-only 本月关注 cards
tests/theme.test.ts                         # token and dark-mode contract
tests/imports-ai.test.ts                    # parse/stage error and retry behavior
tests/ai-page.test.ts                       # conversation hydration/deletion/offline
tests/dashboard-insights.test.ts            # insight rendering and cache behavior
```

### API repository: `D:\self\家庭手账APP`

```text
apps/api/prisma/schema.prisma                # AiConversation/AiMessage relations
apps/api/prisma/migrations/0003_ai_chat/     # conversation/message tables and indexes
apps/api/src/ai/minimax.client.ts            # structured parse/chat responses
apps/api/src/ai/ai-chat.service.ts            # tools, history, isolation, retention
apps/api/src/ai/ai.controller.ts             # parse/chat/conversation/insight routes
apps/api/src/ai/*.test.ts                    # schema, safety, privacy, and tool tests
```

---

### Task 1: Replace the legacy green theme with J and system dark mode

**Files:**
- Create: `D:\self\家庭手账APP-wechat\src\shared\theme.ts`
- Create: `D:\self\家庭手账APP-wechat\tests\theme.test.ts`
- Modify: `D:\self\家庭手账APP-wechat\app.json`
- Modify: `D:\self\家庭手账APP-wechat\app.wxss`
- Modify: `D:\self\家庭手账APP-wechat\pages\**\*.wxss`
- Modify: `D:\self\家庭手账APP-wechat\components\**\*.wxss`

**Interfaces:**
- Produces `ThemeTokens`, `LIGHT_TOKENS`, `DARK_TOKENS`, and a CSS-variable contract used by every page/component stylesheet.

- [ ] **Step 1: Write the failing token test**

```ts
import { DARK_TOKENS, LIGHT_TOKENS } from '../src/shared/theme';

test('exposes the confirmed J light and dark tokens', () => {
  expect(LIGHT_TOKENS.primary).toBe('#155EEF');
  expect(LIGHT_TOKENS.background).toBe('#F3F7FF');
  expect(DARK_TOKENS.background).toBe('#0B1220');
  expect(DARK_TOKENS.primary).toBe('#5B9CFF');
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run from `D:\self\家庭手账APP-wechat`:

```powershell
npm test -- --runInBand tests/theme.test.ts
```

Expected: FAIL because `src/shared/theme.ts` does not exist.

- [ ] **Step 3: Add typed tokens and CSS variables**

Define the exact light/dark token objects above, export their union type, set `"darkmode": true` in `app.json`, and add `page` CSS variables plus `@media (prefers-color-scheme: dark)` overrides in `app.wxss`. Replace hard-coded legacy green colors in all listed WXSS files with the variables; preserve spacing, layout, and existing copy.

- [ ] **Step 4: Run tests, typecheck, and static color scan**

Run:

```powershell
npm test -- --runInBand tests/theme.test.ts
npm run typecheck
rg -n "#127c73|#43a58e|#f4fbf8|#123b38|#78918d|#e8f3ef" app.wxss pages components
```

Expected: tests and typecheck PASS; the legacy color scan returns no matches in active styles.

- [ ] **Step 5: Commit**

```powershell
git add app.json app.wxss src/shared/theme.ts pages components tests/theme.test.ts
git commit -m "feat: add J theme and automatic dark mode"
```

### Task 2: Harden AI receipt/bill and natural-language draft parsing

**Files:**
- Modify: `D:\self\家庭手账APP\apps\api\src\ai\minimax.client.ts`
- Modify: `D:\self\家庭手账APP\apps\api\src\ai\ai.controller.ts`
- Modify: `D:\self\家庭手账APP\apps\api\src\imports\document-parser.service.ts`
- Modify: `D:\self\家庭手账APP\apps\api\src\ai\minimax.client.test.ts`
- Modify: `D:\self\家庭手账APP\apps\api\src\imports\document-parser.service.test.ts`
- Modify: `D:\self\家庭手账APP-wechat\src\api\contracts.ts`
- Modify: `D:\self\家庭手账APP-wechat\src\api\client.ts`
- Modify: `D:\self\家庭手账APP-wechat\pages\imports\index.ts`
- Modify: `D:\self\家庭手账APP-wechat\pages\imports\index.wxml`
- Modify: `D:\self\家庭手账APP-wechat\pages\imports\index.wxss`
- Create: `D:\self\家庭手账APP-wechat\tests\imports-ai.test.ts`

**Interfaces:**
- `MiniMaxClient.parseDraft(input: string): Promise<StructuredDraft>` validates amount, direction, optional date/merchant/note, category/account suggestions, and field confidence.
- `MiniMaxClient.parseDocument(contentType: string, content: Buffer): Promise<StructuredDraft>` remains the raw-attachment ingestion path.
- `POST /v1/ai/parse-draft` accepts natural-language input; `POST /v1/imports/pdf/preview` remains the authorized binary image/PDF path.

- [ ] **Step 1: Write failing API schema tests**

Add tests for a valid draft containing `amountMinor`, `direction`, `occurredAt`, `merchant`, `note`, `categoryHint`, `accountHint`, and `fieldConfidence`; reject zero amount, unsupported direction, confidence outside 0–1, invalid JSON, and empty MiniMax content.

- [ ] **Step 2: Run focused API tests to verify failure**

Run from `D:\self\家庭手账APP\apps\api`:

```powershell
npm test -- --runInBand src/ai/minimax.client.test.ts src/imports/document-parser.service.test.ts
```

Expected: FAIL for the new fields and natural-language route contract.

- [ ] **Step 3: Implement structured parsing and the text route**

Extend `StructuredDraft` and `validateStructuredDraft`, make both text and document prompts require the same JSON shape, keep the 20 MB/signature checks in `DocumentParserService`, and add `@Post('parse-draft')` to `AiController` while retaining `/draft` as a compatibility alias. Return a 502-style structured error for invalid model output; do not log the input or document bytes.

- [ ] **Step 4: Add the Mini Program natural-language entry**

Add a text input/action to the existing import workbench. On submit call `parseDraft`, render the same preview fields as a receipt/PDF, and send the result through existing `stageImport` before attachment upload. Preserve the original file/input and show retry/manual entry when parsing fails.

- [ ] **Step 5: Run API/frontend tests and typecheck**

Run:

```powershell
cd D:\self\家庭手账APP\apps\api
npm test -- --runInBand src/ai/minimax.client.test.ts src/imports/document-parser.service.test.ts
npm run build
cd D:\self\家庭手账APP-wechat
npm test -- --runInBand tests/imports-ai.test.ts
npm run typecheck
```

Expected: all focused tests and both builds PASS.

- [ ] **Step 6: Commit each repository separately**

```powershell
git -C D:\self\家庭手账APP add apps/api/src/ai apps/api/src/imports
git -C D:\self\家庭手账APP commit -m "feat: harden ai draft parsing"
git add src/api pages/imports tests/imports-ai.test.ts
git commit -m "feat: add natural language draft entry"
```

### Task 3: Add private multi-turn chat, structured insights, and read-only tools

**Files:**
- Modify: `D:\self\家庭手账APP\apps\api\prisma\schema.prisma`
- Create: `D:\self\家庭手账APP\apps\api\prisma\migrations\0003_ai_chat\migration.sql`
- Modify: `D:\self\家庭手账APP\apps\api\src\ai\minimax.client.ts`
- Modify: `D:\self\家庭手账APP\apps\api\src\ai\ai-chat.service.ts`
- Modify: `D:\self\家庭手账APP\apps\api\src\ai\ai.controller.ts`
- Create/modify: `D:\self\家庭手账APP\apps\api\src\ai\ai-chat.service.test.ts`
- Create: `D:\self\家庭手账APP\apps\api\src\ai\ai.controller.test.ts`

**Interfaces:**
- `AiConversation` stores `id`, `memberId`, `title`, `createdAt`, `updatedAt`, and `expiresAt`.
- `AiMessage` stores `id`, `conversationId`, `role`, `contentJson`, and `createdAt`.
- `AiChatService.answer(actorId, householdId, conversationId, message): Promise<AiAnswer>` returns `answer`, `scope`, `insights`, and authorized citations.
- Routes: `POST /v1/ai/chat`, `GET /v1/ai/conversations`, `DELETE /v1/ai/conversations/:id`, and `GET /v1/ai/insights`.

- [ ] **Step 1: Write failing persistence, safety, and tool tests**

Cover conversation creation and follow-up context, same-member retrieval, cross-member `403`, deletion cascade, expired conversation cleanup, mutation/SQL refusal, period summary, category comparison, trend, anomaly, transaction search, citation authorization, and malformed MiniMax JSON.

- [ ] **Step 2: Run focused API tests to verify failure**

Run from `D:\self\家庭手账APP\apps\api`:

```powershell
npm test -- --runInBand src/ai/ai-chat.service.test.ts src/ai/ai.controller.test.ts
```

Expected: FAIL because conversation models, structured answer type, and routes are absent.

- [ ] **Step 3: Add Prisma models and migration**

Add the two tables with foreign keys to the existing membership/user boundary, an index on `memberId`, an index on `expiresAt`, and cascade from conversation to messages. Generate the migration without changing transaction or attachment tables.

- [ ] **Step 4: Implement the white-listed read-only context**

Refactor `AiChatService` so it validates the actor’s household membership, resolves only confirmed/non-deleted transactions, and calls explicit methods for period summary, category/account comparison, trend, anomaly, transaction search, and recurring-bill analysis. Never interpolate user input into SQL. Reject write verbs and direct-write intent before any model call.

- [ ] **Step 5: Implement structured MiniMax output and conversation routes**

Make `MiniMaxClient.chat` require JSON containing `answer`, `scope`, `insights`, and `citations`; validate every citation against the tool result. Persist user and assistant messages as JSON, set `expiresAt` to 90 days, list/delete only the actor’s conversations, and expose dashboard insights as a read-only endpoint. Keep `/chat/stream` as a compatibility route returning the same structured payload.

- [ ] **Step 6: Run migration validation, tests, and build**

Run:

```powershell
cd D:\self\家庭手账APP\apps\api
$env:DATABASE_URL='postgresql://ledger:ledger@localhost:5432/ledger'
npx prisma validate --schema prisma/schema.prisma
npx prisma generate
npm test -- --runInBand src/ai
npm run build
```

Expected: schema validation, AI tests, all existing tests, and build PASS.

- [ ] **Step 7: Commit the API repository**

```powershell
git -C D:\self\家庭手账APP add apps/api/prisma apps/api/src/ai
git -C D:\self\家庭手账APP commit -m "feat: add private structured ai chat"
```

### Task 4: Wire typed contracts, conversation APIs, and draft previews in the Mini Program

**Files:**
- Modify: `D:\self\家庭手账APP-wechat\src\api\contracts.ts`
- Modify: `D:\self\家庭手账APP-wechat\src\api\client.ts`
- Modify: `D:\self\家庭手账APP-wechat\pages\imports\index.ts`
- Modify: `D:\self\家庭手账APP-wechat\pages\imports\index.wxml`
- Modify: `D:\self\家庭手账APP-wechat\pages\imports\index.wxss`
- Create: `D:\self\家庭手账APP-wechat\tests\ai-api-contract.test.ts`

**Interfaces:**
- `AiConversationSummary { id: string; title?: string; updatedAt: string; expiresAt: string }`.
- `AiInsight { type: string; title: string; value?: number; unit?: string; detail?: string }`.
- `AiAnswer { conversationId: string; answer: string; scope: { from: string; to: string }; insights: AiInsight[]; citations: AiCitation[] }`.
- `ApiClient.askAi(input: { conversationId?: string; message: string }): Promise<AiAnswer>`.
- `ApiClient.listAiConversations()`, `deleteAiConversation(id)`, `fetchAiInsights(period)`, and `parseDraft(input)` use the routes from Task 3.

- [ ] **Step 1: Write failing contract/client tests**

Assert that chat requests include `conversationId` on follow-up, responses preserve insights/citations, delete uses `DELETE`, insights use `GET`, and parse-draft maps a validation error without pretending a draft was staged.

- [ ] **Step 2: Run focused tests to verify failure**

Run from `D:\self\家庭手账APP-wechat`:

```powershell
npm test -- --runInBand tests/ai-api-contract.test.ts
```

Expected: FAIL for missing DTOs and client methods.

- [ ] **Step 3: Implement DTOs and client methods**

Extend `DocumentDraft` with `categoryHint`, `accountHint`, and `fieldConfidence`; add the conversation/insight DTOs; implement the typed methods using the existing auth retry and error mapping. Do not add a second transport or expose MiniMax configuration.

- [ ] **Step 4: Run tests and typecheck**

Run:

```powershell
npm test -- --runInBand tests/ai-api-contract.test.ts tests/imports-ai.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/api pages/imports tests/ai-api-contract.test.ts tests/imports-ai.test.ts
git commit -m "feat: wire structured ai api contracts"
```

### Task 5: Upgrade the AI page and dashboard with private history and insights

**Files:**
- Modify: `D:\self\家庭手账APP-wechat\pages\ai\index.ts`
- Modify: `D:\self\家庭手账APP-wechat\pages\ai\index.wxml`
- Modify: `D:\self\家庭手账APP-wechat\pages\ai\index.wxss`
- Modify: `D:\self\家庭手账APP-wechat\pages\dashboard\index.ts`
- Modify: `D:\self\家庭手账APP-wechat\pages\dashboard\index.wxml`
- Modify: `D:\self\家庭手账APP-wechat\pages\dashboard\index.wxss`
- Modify: `D:\self\家庭手账APP-wechat\src\shared\copy.ts`
- Modify: `D:\self\家庭手账APP-wechat\tests\ai-page.test.ts`
- Create: `D:\self\家庭手账APP-wechat\tests\dashboard-insights.test.ts`

**Interfaces:**
- `AiPageModel` owns `conversationId`, server-hydrated messages, quick questions, loading/error state, and `deleteHistory(): Promise<boolean>`.
- Dashboard state owns `insights: AiInsight[]` and an `insightsFromCache` label without treating insights as a write result.

- [ ] **Step 1: Write failing page-model tests**

Cover loading the latest member-private conversation, sending a first message then a follow-up with the same conversation ID, rendering scope/insights/citations, deleting server history plus local cache, refusing offline send, and rendering the dashboard insight card after a successful read.

- [ ] **Step 2: Run focused tests to verify failure**

Run from `D:\self\家庭手账APP-wechat`:

```powershell
npm test -- --runInBand tests/ai-page.test.ts tests/dashboard-insights.test.ts
```

Expected: FAIL because the current page only stores local plain-text history and the dashboard has no insight state.

- [ ] **Step 3: Implement private multi-turn chat**

Hydrate the newest server conversation when online, keep only a timestamped local read cache for display, pass `conversationId` on follow-up requests, render structured insight cards and transaction citations, and make “删除聊天记录” call the server before clearing local storage. Keep the current quick questions and read-only notice.

- [ ] **Step 4: Implement dashboard “本月关注” cards**

Fetch `fetchAiInsights` when the dashboard loads, render anomaly/category-change/recurring-bill cards as read-only content, display a cache label only when a cached read is used, and hide the section when no insight is available. Do not add push notifications or a manual theme toggle.

- [ ] **Step 5: Run tests, typecheck, and Mini Program build**

Run:

```powershell
npm test -- --runInBand tests/ai-page.test.ts tests/dashboard-insights.test.ts
npm run typecheck
npm run build:wechat
```

Expected: all focused tests, typecheck, and generated Mini Program JavaScript PASS.

- [ ] **Step 6: Commit**

```powershell
git add pages/ai pages/dashboard src/shared/copy.ts tests/ai-page.test.ts tests/dashboard-insights.test.ts
git commit -m "feat: add private ai chat and dashboard insights"
```

### Task 6: Run full regression, security review, and record acceptance evidence

**Files:**
- Modify: `D:\self\家庭手账APP-wechat\docs\superpowers\implementation-status.md`
- Modify: `D:\self\家庭手账APP-wechat\docs\acceptance\mock-flow.md`
- Modify: `D:\self\家庭手账APP-wechat\README.md`
- Create: `D:\self\家庭手账APP-wechat\tests\ai-security.test.ts`

**Interfaces:**
- Produces reproducible local evidence for theme, draft ingestion, chat privacy, dashboard insights, and existing ledger flows.

- [ ] **Step 1: Add adversarial frontend safety tests**

Test that no tracked frontend file contains `MINIMAX_API_KEY`, `WECHAT_APP_SECRET`, `DATABASE_URL`, bearer token literals, or raw AI prompt logging; test that offline imports/chat fail before transport calls.

- [ ] **Step 2: Run the complete frontend suite**

Run from `D:\self\家庭手账APP-wechat`:

```powershell
npm ci
npm test -- --runInBand
npm run typecheck
npm run build:wechat
git diff --check
```

Expected: every frontend test, typecheck, build, and diff check PASS.

- [ ] **Step 3: Run the complete API suite**

Run from `D:\self\家庭手账APP\apps\api`:

```powershell
$env:DATABASE_URL='postgresql://ledger:ledger@localhost:5432/ledger'
npx prisma validate --schema prisma/schema.prisma
npx prisma generate
npm test -- --runInBand
npm run build
```

Expected: schema validation, all API tests, and build PASS.

- [ ] **Step 4: Execute the documented Mock acceptance flow**

Update `docs/acceptance/mock-flow.md` and run the flow in WeChat DevTools: Mock login, manual income/expense/transfer, repeated idempotent save, receipt/PDF/natural-language draft, AI retry/manual fallback, human confirmation, duplicate choices, month/quarter/year reports, multi-turn chat follow-up, history deletion, dashboard insight card, second-member isolation, and offline rejection.

- [ ] **Step 5: Record results and external blockers**

Update `implementation-status.md` with commit hashes and commands. Explicitly leave real AppID/AppSecret exchange, legal request/upload domains, live MiniMax smoke tests, VPS migration/backup restore, and iPhone/device acceptance as external gates.

- [ ] **Step 6: Commit the verification evidence**

```powershell
git add docs README.md tests/ai-security.test.ts
git commit -m "test: verify ai theme and privacy flows"
```

---

## Plan Self-Review

- **Spec coverage:** J theme and automatic dark mode are covered by Task 1; attachment/natural-language AI drafts by Task 2 and Task 4; private multi-turn chat, 90-day retention, read-only tools, citations, and deletion by Task 3–5; dashboard recommendations by Task 5; tests, offline behavior, secrets, and external blockers by Task 6.
- **Placeholder scan:** Every step names exact files, commands, expected results, and concrete behavior; there are no `TODO`, `TBD`, or “implement later” steps.
- **Type consistency:** `StructuredDraft`, `AiAnswer`, `AiInsight`, `AiConversationSummary`, and the `ApiClient` method signatures are defined before page tasks consume them. `AiChatService.answer` uses the same `conversationId` and `AiAnswer` shape as the frontend client.
- **Scope:** This is a focused delta plan for the already-completed WeChat MVP; it does not repeat the baseline authentication, ledger, import, report, or household tasks in `docs/superpowers/plans/2026-08-29-family-ledger-wechat.md`.
