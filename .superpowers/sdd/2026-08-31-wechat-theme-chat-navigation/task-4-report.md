# Task 4 report: 五槽自定义底部导航

Status: complete with local verification; device acceptance remains pending

## RED

先加入 custom tab bar、配置、首页旧入口和四个主页面 `onShow` 的回归测试，再运行：

```powershell
npm test -- tests/custom-tab-bar.test.ts tests/app-config.test.ts tests/dashboard-page.test.ts
```

结果按预期失败：`app.json` 没有 `tabBar.custom`，`custom-tab-bar` 尚不存在，首页仍包含 `floating-add`/`onQuickEntry`，设置页没有 `onShow` 选中同步。

## GREEN

- `app.json` 开启 custom tab bar，仍保留且仅保留四个真实 tab 页面：首页、账目、AI 聊天、设置。
- 新增五个固定视觉槽：首页、账目、记账、AI聊天、设置；普通槽 `switchTab`，中心槽只 `navigateTo('/pages/entry/index')`。
- 中心槽使用 `openingEntry` 防重复进入，完成回调解除 guard；中心槽没有 selected 状态。
- custom tab bar 从 `getRuntime().theme` 订阅共享主题运行层，组件 detached 时解除订阅；浅色/深色样式使用语义变量。
- 首页、账目、AI 聊天、设置的 `onShow` 分别同步 selected 0、1、3、4。
- 删除首页旧浮动加号的 WXML、专属 WXSS 和 `onQuickEntry` 处理器；更新旧 runtime-pages 测试以覆盖保留的入口行为。
- 将 custom tab bar 加入小程序 TypeScript 构建输入，并生成 `custom-tab-bar/index.js`。

## Verification

```powershell
npm test -- tests/custom-tab-bar.test.ts tests/app-config.test.ts tests/dashboard-page.test.ts
npm test -- --runInBand
npm run typecheck
npm run build:wechat
git diff --check
```

结果：定向 3 suites / 19 tests、全量 29 suites / 147 tests、TypeScript 检查和微信构建均通过；`git diff --check` 通过，仅报告仓库既有的 LF/CRLF 转换警告。

## Concerns

- 微信开发者工具/真机仍需验收五槽布局、凸起中心按钮、安全区、主题切换和二级页面返回；本地 Jest、类型检查和构建不能替代设备验收。
- 工作树在 Task 4 前已有大量用户批准的 Sunlit UI、主题、API 和测试改动；本任务未清理、还原、reset、rebase 或 amend 这些改动。

## Sol review fix round 1

### RED

新增回归覆盖：

- 从 `app.json` 收集 `themeLocation`、所有 `iconPath` 和 `selectedIconPath`，逐一断言文件存在且已由 `git ls-tree HEAD` 跟踪。
- 断言四个主页面预留至少 `144rpx + env(safe-area-inset-bottom)` 底部空间；AI composer 位于 `112rpx` custom tab bar 及间距之上。
- 断言 dark custom tab bar 为普通/选中 PNG 图标提供不同主题 filter；中心入口完成回调后可重试，同步抛错后也释放 guard。
- 断言 `custom-tab-bar/index.js` 与 TypeScript 按 `tsconfig.miniprogram.json` 转译结果一致，以及 app/component 使用精确文案 `AI 聊天`。

运行定向测试时，旧提交按预期失败：资源尚未在 HEAD，AI 文案仍无空格，底部安全区和 dark icon 断言不满足；修正测试解析规则后，失败收敛为 HEAD tracking 缺口。

### GREEN

- 提交 `d06c2f0`：将 `theme.json` 与 8 个 tabbar PNG 纳入 Git；`git ls-tree -r --name-only HEAD -- theme.json assets/tabbar` 已确认 9 个资源均存在。
- 四个主页面补充统一底部留白；AI composer 的基础位置改为 `calc(112rpx + 20rpx + env(safe-area-inset-bottom))`，避免被 custom tab bar 覆盖。
- dark tab bar 为普通和 selected 图标增加语义 filter 变量和选择器，WXML 对 selected 图标增加 class；更新 app/component 精确显示 `AI 聊天`。
- 增加同步导航异常与完成后的 guard 重试测试；已有实现已通过，无需改变业务导航边界。
- 增加 custom tabbar JS/TS artifact parity 测试。

验证结果：

```powershell
npm test -- tests/custom-tab-bar.test.ts tests/app-config.test.ts tests/build-artifacts.test.ts
npm run typecheck
```

定向 3 suites / 18 tests 通过，类型检查通过。完整回归、微信构建和 diff 检查在本轮末尾复跑。
