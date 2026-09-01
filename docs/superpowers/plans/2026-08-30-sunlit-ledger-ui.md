# Sunlit Ledger UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已确认的 Sunlit Ledger 原型完整落地到微信小程序，并补齐账单文件录入、银行账单 AI 核对、账号密码登录和全局移动端状态规范。

**Architecture:** 保留现有页面模型、API 客户端和人工确认边界，新增最少的页面状态与路由行为；视觉通过 `app.wxss` 语义 token 和页面级 WXSS 实现，不引入 UI 依赖。TypeScript 是源码，微信 JS 由现有 `build:wechat` 生成。

**Tech Stack:** 微信原生小程序 TypeScript/WXML/WXSS、Jest/ts-jest、现有 NestJS REST API。

## Global Constraints

- 唯一视觉基线为 `docs/superpowers/specs/2026-08-30-sunlit-ledger-ui-design.md`。
- NZD 使用整数分；显示与时间范围按 `Pacific/Auckland`。
- 小程序不展示账户或转账；AI 和导入都必须人工确认。
- 不新增 UI 框架、图标字体、远程字体或运行时主题依赖。
- 每个行为变更执行 RED → 最小实现 → GREEN；视觉修改后执行构建和窄屏审查。

---

### Task 1: 建立全局视觉 token 与共用交互规范

**Files:**
- Modify: `app.wxss`
- Modify: `app.json`
- Modify: `src/shared/theme.ts`
- Test: `tests/theme.test.ts`

**Interfaces:** `LIGHT_TOKENS` 与 `DARK_TOKENS` 继续提供现有字段；增加 accent、focus、success surface 等语义字段只在实际页面使用。

- [ ] 写主题行为测试，断言浅/深色 token 对象提供页面使用的完整语义字段，并先运行看到缺字段失败。
- [ ] 将确认的象牙白、桉树绿、杏桃色与深色 token 写入 `theme.ts`、`app.wxss`、`app.json`。
- [ ] 添加 88rpx 触控目标、button 重置、输入焦点、数字排版、页面安全区和 reduced-motion 规则。
- [ ] 运行 `npm test -- --runInBand tests/theme.test.ts` 与 `npm run build:wechat`。

### Task 2: 落地首页与账目页

**Files:**
- Modify: `pages/dashboard/index.ts`
- Modify: `pages/dashboard/index.wxml`
- Modify: `pages/dashboard/index.wxss`
- Modify: `pages/ledger/index.ts`
- Modify: `pages/ledger/index.wxml`
- Modify: `pages/ledger/index.wxss`
- Test: `tests/dashboard-page.test.ts`
- Test: `tests/ledger-list.test.ts`

**Interfaces:** 首页新增 `onPhotoEntry`、`onManualEntry`、`onOpenAi`；账目新增 `openBankImport`，继续使用现有期间与详情模型。

- [ ] 先写路由测试：两个首页快速入口分别打开拍照和手动页，账目银行入口打开导入页；运行并确认缺方法失败。
- [ ] 按原型重写页面结构和样式：50:50 快捷入口、最近收支、统计摘要、银行导入、交易详情和空状态。
- [ ] 复用格式化后的 state，避免 WXML 中调用方法或金额运算。
- [ ] 运行定向测试、类型检查和微信构建。

### Task 3: 合并三种记账方式与 AI 扫描到可编辑表单

**Files:**
- Modify: `pages/entry/index.ts`
- Modify: `pages/entry/index.wxml`
- Modify: `pages/entry/index.wxss`
- Modify: `pages/entry/photo/index.ts`
- Modify: `pages/entry/photo/index.wxml`
- Modify: `pages/entry/photo/index.wxss`
- Modify: `pages/ledger/edit/index.ts`
- Modify: `pages/ledger/edit/index.wxml`
- Modify: `pages/ledger/edit/index.wxss`
- Test: `tests/entry-page.test.ts`
- Test: `tests/photo-entry.test.ts`
- Test: `tests/manual-entry.test.ts`

**Interfaces:** `createEntryPage().openBillFile()` 打开 `entry/photo?source=bill`；照片页根据 `source` 使用相机或微信文件选择，分析成功后直接显示表单；分类用按钮网格选择。

- [ ] 写失败测试覆盖账单文件路由、账单选择器、分析期间 loading、分析后直接可编辑和显式保存。
- [ ] 实现入口页三种方式、关闭图标、AI 扫描状态和统一表单结构。
- [ ] 金额展示从分转换为可编辑 NZD 文本，提交时仍保持整数分；保留原件、重试、重复处理和人工确认。
- [ ] 运行三组定向测试、类型检查和构建。

### Task 4: 实现银行账单核对状态

**Files:**
- Modify: `pages/imports/index.ts`
- Modify: `pages/imports/index.wxml`
- Modify: `pages/imports/index.wxss`
- Modify: `src/api/contracts.ts`
- Test: `tests/imports-page.test.ts`
- Test: `tests/imports-ai.test.ts`

**Interfaces:** `ImportPageState` 增加 `mode: 'bill'|'statement'`、`view: 'upload'|'analyzing'|'results'` 和核对分组；`confirmSelectedMissing()` 只 staging 用户勾选的缺失项。现有 API 尚未返回服务端匹配分组时，以 `previewDuplicates` 对预览行逐笔生成候选，不静默补录。

- [ ] 写失败测试覆盖账单模式和银行模式、AI 加载态、缺失项默认勾选、只确认勾选项、重复项人工决定。
- [ ] 实现 query mode 初始化、文件选择、动画状态、核对结果渲染与选择计数。
- [ ] 保留 20MB、签名、文件哈希幂等、附件顺序和失败原件恢复。
- [ ] 运行导入定向测试、类型检查和构建。

### Task 5: 落地 AI、设置与双登录界面

**Files:**
- Modify: `pages/ai/index.wxml`
- Modify: `pages/ai/index.wxss`
- Modify: `pages/more/index.wxml`
- Modify: `pages/more/index.wxss`
- Modify: `pages/login/index.ts`
- Modify: `pages/login/index.wxml`
- Modify: `pages/login/index.wxss`
- Modify: `src/api/client.ts`
- Modify: `src/api/contracts.ts`
- Test: `tests/ai-page.test.ts`
- Test: `tests/settings-pages.test.ts`
- Test: `tests/dashboard-page.test.ts`
- Test: `tests/api-client.test.ts`

**Interfaces:** `ApiClient.loginWithPassword({username,password})` 调用 `/auth/login`；`LoginPageModel.passwordLogin()` 保存 token 并跳转，密码只保存在页面内存并在成功后清空。

- [ ] 先写账号密码登录 RED 测试：有效输入调用 API、保存 session、清空密码；无效输入不发送请求。
- [ ] 实现双登录表单，保留现有微信邀请码能力；按原型改造 AI 消息、固定输入区和设置分组。
- [ ] 不添加尚无后端能力的“修改密码”写操作，仅把现有可用入口和说明呈现为受控状态。
- [ ] 运行定向测试、类型检查和构建。

### Task 6: 全页面一致性与交付验证

**Files:**
- Modify: `pages/settings/**/index.wxss`
- Modify: `pages/household/index.wxss`
- Modify: `pages/recurring/index.wxss`
- Modify: `pages/reports/index.wxss`
- Modify: `pages/drafts/index.wxss`
- Modify: `components/**/index.wxss`
- Modify: `docs/acceptance/full-functional-test-list.md`

**Interfaces:** 无新增业务接口；仅把剩余页面迁移到同一 token、焦点、空状态和触控规范。

- [ ] 对剩余页面逐个检查按钮文字、卡片层级、溢出、图标、色系、空状态和焦点态，并只修改实际不符合项。
- [ ] 运行 `npm test -- --runInBand`、`npm run typecheck`、`npm run build:wechat`、`git diff --check`。
- [ ] 使用微信开发者工具检查编译、Console、320/375px 视口、深浅色与减弱动画；真机相机/文件/MiniMax/银行账单作为外部验收单列。
- [ ] 对照设计规格逐条复核，不把未执行的真机或生产验证写成通过。
