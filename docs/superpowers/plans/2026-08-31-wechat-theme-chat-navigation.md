# 微信主题、AI 聊天与导航 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变账务模型、AI 只读权限和人工确认边界的前提下，实现三态主题、五槽导航、微信式 AI 对话、可靠键盘布局及三种图片来源。

**Architecture:** `ThemeRuntime` 是页面、自定义 tabBar 和微信原生区域的唯一主题源。四个真实 tab 保持不变，中间槽只打开现有记账页；聊天布局和图片来源仅修改客户端适配层。

**Tech Stack:** 原生微信小程序、TypeScript 5.8、WXML/WXSS、Jest 29、微信 `wx` API。

## Global Constraints

- 规划与审查使用 **GPT-5.6 Sol**；实施、编码和修复使用 **GPT-5.6 Luna**。
- 只修改任务列出的文件，不清理或还原用户现有改动。
- `.ts` 是源文件；通过 `npm run build:wechat` 生成对应 `.js`。
- 不新增 UI 框架、状态管理或运行时依赖。
- 主题值仅为 `light | dark | system`，存储键为 `family-ledger.theme.v1`。
- AI 保持只读；图片仍走“识别为草稿 → 用户核对 → 人工保存”。
- 离线禁止 AI、图片识别、导入和其他写操作。
- 四个真实 tab 保持首页、账目、AI 聊天、设置；“记账”只打开 `/pages/entry/index`。
- 未获用户针对生产 API 的单独明确授权，不得重建、部署或重启 VPS 服务。

---

### Task 1: 建立唯一主题运行层

**Files:**

- Create: `src/shared/theme-runtime.ts`
- Modify: `src/shared/theme.ts`
- Modify: `src/runtime/app-runtime.ts`
- Modify: `app.ts`
- Test: `tests/theme-runtime.test.ts`
- Test: `tests/runtime-bootstrap.test.ts`
- Generate: 对应 `.js`

**Interfaces:**

- Consumes: `StorageLike`, `LIGHT_TOKENS`, `DARK_TOKENS`
- Produces: `ThemePreference`, `ResolvedTheme`, `ThemeSnapshot`
- Produces: `ThemeRuntime.getSnapshot()`, `setPreference()`, `subscribe()`, `dispose()`
- Produces: `AppRuntime.theme`

- [ ] **Step 1: Write the failing tests**

测试缺失、损坏和未知偏好回退 `system`；手动主题忽略系统变化；存储失败仍应用当前会话；同一个 resolved theme 驱动订阅者和原生颜色接口。

- [ ] **Step 2: Run the test to verify RED**

```powershell
npm test -- tests/theme-runtime.test.ts
```

Expected: FAIL with `Cannot find module '../src/shared/theme-runtime'`。

- [ ] **Step 3: Write the minimal implementation**

```ts
export const THEME_STORAGE_KEY = 'family-ledger.theme.v1';
export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

setPreference(value: ThemePreference) {
  this.preference = value;
  let persisted = true;
  try {
    this.storage.setStorageSync(THEME_STORAGE_KEY, JSON.stringify(value));
  } catch {
    persisted = false;
  }
  return { persisted, snapshot: this.publish() };
}
```

仅 `system` 响应 `wx.onThemeChange`。`publish()` 同时更新订阅者、`wx.setNavigationBarColor` 和 `wx.setBackgroundColor`；原生接口失败不得阻断页面主题。

- [ ] **Step 4: Run GREEN verification**

```powershell
npm test -- tests/theme-runtime.test.ts tests/runtime-bootstrap.test.ts tests/theme.test.ts
npm run typecheck
npm run build:wechat
```

Expected: 所有测试通过，类型检查与构建退出码为 0。

- [ ] **Step 5: Commit**

```powershell
git add app.ts app.js src/shared/theme* src/runtime/app-runtime.* tests/theme-runtime.test.ts tests/runtime-bootstrap.test.ts
git diff --cached --check
git commit -m "feat: add persisted theme runtime"
```

### Task 2: 统一 page-meta、原生栏和回弹色

**Files:**

- Create: `src/shared/themed-page.ts`
- Modify: `app.wxss`
- Modify: `pages/login/index.ts`, `pages/login/index.wxml`
- Modify: `pages/dashboard/index.ts`, `pages/dashboard/index.wxml`
- Modify: `pages/entry/index.ts`, `pages/entry/index.wxml`
- Modify: `pages/entry/photo/index.ts`, `pages/entry/photo/index.wxml`
- Modify: `pages/ledger/index.ts`, `pages/ledger/index.wxml`
- Modify: `pages/ledger/edit/index.ts`, `pages/ledger/edit/index.wxml`
- Modify: `pages/imports/index.ts`, `pages/imports/index.wxml`
- Modify: `pages/drafts/index.ts`, `pages/drafts/index.wxml`
- Modify: `pages/reports/index.ts`, `pages/reports/index.wxml`
- Modify: `pages/ai/index.ts`, `pages/ai/index.wxml`
- Modify: `pages/recurring/index.ts`, `pages/recurring/index.wxml`
- Modify: `pages/household/index.ts`, `pages/household/index.wxml`
- Modify: `pages/more/index.ts`, `pages/more/index.wxml`
- Modify: `pages/settings/categories/index.ts`, `pages/settings/categories/index.wxml`
- Modify: `pages/settings/assets/index.ts`, `pages/settings/assets/index.wxml`
- Modify: `pages/settings/term-deposits/index.ts`, `pages/settings/term-deposits/index.wxml`
- Test: `tests/themed-pages.test.ts`
- Test: `tests/build-artifacts.test.ts`
- Generate: 对应 `.js`

**Interfaces:**

- Consumes: `ThemeRuntime.subscribe()`, `ThemeSnapshot`
- Produces: `withThemePage(definition, theme)`
- Produces page data: `themePreference`, `resolvedTheme`, `themeClass`, `themeBackground`, `themePageStyle`

- [ ] **Step 1: Write the failing tests**

测试包装器保留既有生命周期并只取消订阅一次；枚举 `app.json.pages` 中每个页面，断言 WXML 首节点是绑定 `themePageStyle` 的 `page-meta`。

- [ ] **Step 2: Run the test to verify RED**

```powershell
npm test -- tests/themed-pages.test.ts
```

Expected: FAIL because `themed-page.ts` and first-node `page-meta` do not exist。

- [ ] **Step 3: Write the minimal implementation**

```ts
type ThemedPageContext = {
  setData(data: ThemeSnapshot): void;
  __offTheme?: () => void;
};

export function withThemePage(
  definition: Record<string, unknown> & {
    data?: Record<string, unknown>;
    onLoad?: (...args: unknown[]) => unknown;
    onUnload?: (...args: unknown[]) => unknown;
  },
  theme: ThemeRuntime,
) {
  const originalOnLoad = definition.onLoad;
  const originalOnUnload = definition.onUnload;
  return {
    ...definition,
    data: { ...definition.data, ...theme.getSnapshot() },
    onLoad(this: ThemedPageContext, ...args: unknown[]) {
      this.__offTheme = theme.subscribe((snapshot) => this.setData(snapshot));
      return originalOnLoad?.apply(this, args);
    },
    onUnload(this: ThemedPageContext, ...args: unknown[]) {
      try {
        return originalOnUnload?.apply(this, args);
      } finally {
        this.__offTheme?.();
        this.__offTheme = undefined;
      }
    },
  };
}
```

每页首节点加入：

```xml
<page-meta page-style="{{themePageStyle}}" />
```

根容器绑定 `themeClass`。`page-meta` 与 Task 1 的原生颜色接口必须同时存在；包装函数必须合并而不是覆盖页面原有 `onLoad`、`onShow`、`onUnload`。

- [ ] **Step 4: Run GREEN verification**

```powershell
npm test -- tests/themed-pages.test.ts tests/build-artifacts.test.ts
npm run typecheck
npm run build:wechat
```

Expected: 页面结构与生命周期测试通过。

- [ ] **Step 5: Commit**

```powershell
git add app.wxss src/shared/themed-page.* pages tests/themed-pages.test.ts tests/build-artifacts.test.ts
git diff --cached --check
git commit -m "feat: apply themes to mini program pages"
```

### Task 3: 设置页增加三段式外观选择

**Files:**

- Modify: `pages/more/index.ts`
- Modify: `pages/more/index.wxml`
- Modify: `pages/more/index.wxss`
- Test: `tests/settings-pages.test.ts`
- Generate: `pages/more/index.js`

**Interfaces:**

- Consumes: `ThemeRuntime.setPreference()`
- Produces: fixed-order `appearanceOptions`
- Produces: `onAppearanceSelect()`, `themePersistenceWarning`

- [ ] **Step 1: Write the failing tests**

断言顺序为“浅色 / 深色 / 跟随系统”；点击立即切换；持久化失败显示指定非阻断提示。

- [ ] **Step 2: Run the test to verify RED**

```powershell
npm test -- tests/settings-pages.test.ts -t "appearance"
```

Expected: FAIL because the selector and handler are absent。

- [ ] **Step 3: Write the minimal implementation**

```ts
onAppearanceSelect(event) {
  const result = runtime.theme.setPreference(event.currentTarget.dataset.value);
  this.setData({
    ...result.snapshot,
    themePersistenceWarning: result.persisted ? '' : THEME_SAVE_WARNING,
  });
}
```

WXML 使用内联三段选择器，不跳转、不打开底部面板。失败提示为：“外观设置未能保存，下次打开可能恢复为跟随系统”。

- [ ] **Step 4: Run GREEN verification**

```powershell
npm test -- tests/settings-pages.test.ts tests/theme-runtime.test.ts
npm run typecheck
npm run build:wechat
```

Expected: 顺序、选中态、即时切换和失败提示全部通过。

- [ ] **Step 5: Commit**

```powershell
git add pages/more/index.* tests/settings-pages.test.ts
git diff --cached --check
git commit -m "feat: add appearance preference selector"
```

### Task 4: 实现五槽 custom-tab-bar 并移除首页旧加号

**Files:**

- Create: `custom-tab-bar/index.ts`
- Create: `custom-tab-bar/index.json`
- Create: `custom-tab-bar/index.wxml`
- Create: `custom-tab-bar/index.wxss`
- Modify: `app.json`
- Modify: `pages/dashboard/index.ts`, `index.wxml`, `index.wxss`
- Modify: `pages/ledger/index.ts`
- Modify: `pages/ai/index.ts`
- Modify: `pages/more/index.ts`
- Test: `tests/custom-tab-bar.test.ts`
- Test: `tests/app-config.test.ts`
- Test: `tests/dashboard-page.test.ts`
- Generate: corresponding `.js`

**Interfaces:**

- Consumes: theme subscription and four real tab paths
- Produces: `selectTab(index)`, `openEntry()`
- Produces: main-page `onShow -> getTabBar()?.setData({ selected })`

- [ ] **Step 1: Write the failing tests**

断言 `tabBar.custom=true`、四个真实 tab、五个视觉槽；普通槽调用 `switchTab`；中心槽仅调用一次 `navigateTo('/pages/entry/index')`；首页不再包含旧 FAB。

- [ ] **Step 2: Run the test to verify RED**

```powershell
npm test -- tests/custom-tab-bar.test.ts tests/app-config.test.ts tests/dashboard-page.test.ts
```

Expected: FAIL because custom tab bar is absent and the old plus remains。

- [ ] **Step 3: Write the minimal implementation**

```ts
openEntry() {
  if (this.data.openingEntry) return;
  this.setData({ openingEntry: true });
  wx.navigateTo({
    url: '/pages/entry/index',
    complete: () => this.setData({ openingEntry: false }),
  });
}
```

五槽固定为：首页、账目、记账、AI 聊天、设置。中心槽不持有选中态，向上凸出约一半；tabBar 订阅唯一主题源。移除旧加号 WXML、专属样式及处理器。

- [ ] **Step 4: Run GREEN verification**

```powershell
npm test -- tests/custom-tab-bar.test.ts tests/app-config.test.ts tests/dashboard-page.test.ts
npm run typecheck
npm run build:wechat
```

Expected: 五槽、选中态、单实例跳转和旧加号移除全部通过。

- [ ] **Step 5: Commit**

```powershell
git add app.json custom-tab-bar pages/dashboard/index.* pages/ledger/index.* pages/ai/index.* pages/more/index.* tests/custom-tab-bar.test.ts tests/app-config.test.ts tests/dashboard-page.test.ts
git diff --cached --check
git commit -m "feat: add custom ledger tab bar"
```

### Task 5: 将 AI 消息改为微信式气泡

**Files:**

- Modify: `pages/ai/index.ts`
- Modify: `pages/ai/index.wxml`
- Modify: `pages/ai/index.wxss`
- Test: `tests/ai-page.test.ts`
- Test: `tests/ai-security.test.ts`
- Generate: `pages/ai/index.js`

**Interfaces:**

- Consumes: existing `content`, `scope`, `insights`, `citations`, `role`
- Produces: `.message-row.user|assistant`, `.message-bubble`
- Produces AI-bubble children: `scope-row`, `insight-block`, `citation-row`

- [ ] **Step 1: Write the failing tests**

断言用户消息右对齐、AI 消息左对齐、气泡 `max-width: 78%`；scope、insight detail 和 citations 均位于同一 AI 气泡内。

- [ ] **Step 2: Run the test to verify RED**

```powershell
npm test -- tests/ai-page.test.ts -t "message bubble"
```

Expected: FAIL because the current whole-message element owns alignment and is about 88% wide。

- [ ] **Step 3: Write the minimal implementation**

```xml
<view class="message-row {{item.role}}">
  <view class="message-bubble">
    <text class="message-content">{{item.content}}</text>
    <view wx:if="{{item.scope}}" class="scope-row">
      <text>分析范围：</text>
      <text>{{item.scope.from}} — {{item.scope.to}}</text>
    </view>
    <view wx:for="{{item.insights}}" wx:for-item="insight" wx:key="title" class="insight-block">
      <text>{{insight.title}}</text>
      <text wx:if="{{insight.value || insight.value === 0}}">{{insight.value}} {{insight.unit}}</text>
      <text wx:if="{{insight.detail}}">{{insight.detail}}</text>
    </view>
    <view wx:for="{{item.citations}}" wx:for-item="citation" wx:key="transactionId" class="citation-row">
      <text>{{citation.merchant || '未命名账目'}}</text>
      <text>{{citation.amountDisplay}}</text>
    </view>
  </view>
</view>
```

行容器负责左右对齐；气泡自然收缩并允许长文本换行。使用语义色和轻量分隔，不新增任何写账交互。

- [ ] **Step 4: Run GREEN verification**

```powershell
npm test -- tests/ai-page.test.ts tests/ai-security.test.ts tests/ai-api-contract.test.ts
npm run typecheck
npm run build:wechat
```

Expected: 气泡结构、结构化内容及 AI 只读边界全部通过。

- [ ] **Step 5: Commit**

```powershell
git add pages/ai/index.* tests/ai-page.test.ts tests/ai-security.test.ts
git diff --cached --check
git commit -m "feat: restyle AI chat as message bubbles"
```

### Task 6: 用键盘高度和 chat-end 锚点稳定聊天布局

**Files:**

- Modify: `pages/ai/index.ts`
- Modify: `pages/ai/index.wxml`
- Modify: `pages/ai/index.wxss`
- Test: `tests/ai-page.test.ts`
- Generate: `pages/ai/index.js`

**Interfaces:**

- Consumes: keyboard-height listener, `wx.nextTick`, safe-area bottom
- Produces: `keyboardHeightPx`, `composerHeightPx`, `composerBottomPx`, `listBottomInsetPx`, `scrollTarget`
- Produces: `calculateChatInsets()`

- [ ] **Step 1: Write the failing tests**

测试键盘和多行输入更新 inset；重复 `onShow` 只注册一次；隐藏和卸载复位并解绑；历史、新消息、AI 回答、失败和尺寸变化均滚到 `chat-end`。

- [ ] **Step 2: Run the test to verify RED**

```powershell
npm test -- tests/ai-page.test.ts -t "keyboard|scroll anchor"
```

Expected: FAIL because keyboard layout state and the stable anchor are absent。

- [ ] **Step 3: Write the minimal implementation**

```ts
export function calculateChatInsets(keyboard: number, composer: number, safe: number) {
  const composerBottomPx = keyboard > 0 ? keyboard + 8 : 64 + safe + 8;
  return {
    composerBottomPx,
    listBottomInsetPx: composerBottomPx + composer + 12,
  };
}
```

textarea 使用 `auto-height` 和 `adjust-position="{{false}}"`。删除固定视口高度及固定 bottom。视图更新完成后清空再设置 `scrollTarget='chat-end'`；键盘高度 0 按关闭处理。

- [ ] **Step 4: Run GREEN verification**

```powershell
npm test -- tests/ai-page.test.ts tests/ai-security.test.ts
npm run typecheck
npm run build:wechat
```

Expected: 键盘、输入框、多行、锚点和错误上下文测试全部通过。

- [ ] **Step 5: Commit**

```powershell
git add pages/ai/index.* tests/ai-page.test.ts
git diff --cached --check
git commit -m "fix: keep AI composer above keyboard"
```

### Task 7: 增加相机、相册、聊天图片及取消语义

**Files:**

- Modify: `pages/entry/photo/index.ts`
- Modify: `pages/entry/photo/index.wxml`
- Modify: `pages/entry/photo/index.wxss`
- Test: `tests/photo-entry.test.ts`
- Test: `tests/imports-ai.test.ts`
- Generate: `pages/entry/photo/index.js`

**Interfaces:**

- Consumes: existing byte read, 20 MB/signature/hash checks, `PhotoEntryPageModel.analyze()` and manual-confirm chain
- Produces: `ImageSource`, `chooseImage(source)`, `isPickerCancel(error)`
- Produces: `choosePhoto`, `chooseAlbum`, `chooseChatImage`

- [ ] **Step 1: Write the failing tests**

分别断言 camera/album 的 `chooseMedia` 参数和聊天入口的 `chooseMessageFile({ type:'image' })`；三种取消均不报错、不清状态、不分析；三种成功进入同一分析路径。

- [ ] **Step 2: Run the test to verify RED**

```powershell
npm test -- tests/photo-entry.test.ts -t "album|chat image|cancel|three sources"
```

Expected: FAIL because album/chat-image handlers and cancellation semantics are absent。

- [ ] **Step 3: Write the minimal implementation**

```ts
export function isPickerCancel(error: unknown): boolean {
  const message = (error as { errMsg?: unknown })?.errMsg;
  return typeof message === 'string' && /cancel/i.test(message);
}
```

相机和相册调用 `chooseMedia`，聊天调用 `chooseMessageFile`。成功结果统一转换为既有文件描述并进入同一分析链。取消不 toast、不跳转、不清空；真实失败保留文件并允许重试。现有 PDF/CSV 账单文件分支不变。

- [ ] **Step 4: Run GREEN verification**

```powershell
npm test -- tests/photo-entry.test.ts tests/entry-page.test.ts tests/imports-page.test.ts tests/imports-ai.test.ts
npm run typecheck
npm run build:wechat
```

Expected: 三来源、取消、真实失败、20 MB、签名、幂等、原件保留和人工确认边界全部通过。

- [ ] **Step 5: Commit**

```powershell
git add pages/entry/photo/index.* tests/photo-entry.test.ts tests/imports-ai.test.ts
git diff --cached --check
git commit -m "feat: add receipt image sources"
```

### Task 8: 全量验证与授权后的 API/真机验收

**Files:**

- Modify: `docs/acceptance/full-functional-test-list.md`
- External reference after authorization only: `D:/self/家庭手账APP/apps/api/src/ai/minimax.client.ts`
- External reference after authorization only: `D:/self/家庭手账APP/apps/api/src/ai/ai-chat.service.ts`
- External reference after authorization only: corresponding tests

**Interfaces:**

- Consumes: Tasks 1–7 and existing verification scripts
- Produces: 分列的自动化、开发者工具、真机和生产 API 验收证据

- [ ] **Step 1: Verify the acceptance section is initially absent**

```powershell
$text = Get-Content -Raw docs/acceptance/full-functional-test-list.md
if ($text -notmatch '2026-08-31 主题、AI 聊天、图片来源与自定义导航') {
  throw 'missing acceptance section'
}
```

Expected: FAIL with `missing acceptance section`。

- [ ] **Step 2: Add the acceptance matrix**

新增验收矩阵，逐项记录三主题与重启、上下回弹、五槽和旧加号、短长气泡、键盘/输入法/多行、三来源及取消。结果只能是“未执行”“通过”或“失败（附复现）”；生产 502 标记为“待用户单独授权”。

- [ ] **Step 3: Run complete local verification**

```powershell
npm test -- --runInBand
npm run typecheck
npm run build:wechat
git diff --check
```

Expected: 所有 Jest suites 通过，类型检查和构建退出码为 0，无 whitespace errors。

- [ ] **Step 4: Run developer-tools and device acceptance**

在浅色、深色、跟随系统三种模式下验证原生栏、回弹、安全区、五槽、中心按钮快速点击、二级页返回、AI 气泡/键盘/多行以及三种图片来源。无设备或权限时明确标记为外部待验收。

- [ ] **Step 5: Stop at the production authorization gate**

生产 502 是共享 API 对 MiniMax `null scope` 的旧校验问题。先只读核对本地 API 测试和 build，然后停止并请求用户明确授权“仅重建并发布 VPS API 服务”。

获权后仅允许：

1. 重建并重启 `api` 服务，不触碰数据库、Redis、volume、migration 或凭据。
2. 检查容器健康状态和非敏感日志。
3. 使用空账本及有账目家庭的有效登录态验证 `/v1/ai/chat` 返回 HTTP 200。
4. 验证 `scope.from/to` 为字符串、回答只读、引用只包含当前成员获权记录。
5. 最后完成微信开发者工具和真机多轮对话验收。

未获授权或真机未通过时，不得称生产 502 已解决。

- [ ] **Step 6: Commit acceptance evidence**

```powershell
git add docs/acceptance/full-functional-test-list.md
git diff --cached --check
git commit -m "docs: record theme chat navigation acceptance"
```

## Final Review

由 GPT-5.6 Sol 对照规格检查八项任务覆盖、接口一致性和授权边界；任何实现修补继续使用 GPT-5.6 Luna。

```powershell
npm test -- --runInBand
npm run typecheck
npm run build:wechat
git diff --check
git status --short
```

Expected: 本地自动化、类型和构建通过；生产 API 与真机状态按真实证据单列，不以本地 PASS 替代。
