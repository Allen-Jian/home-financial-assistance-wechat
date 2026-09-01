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
