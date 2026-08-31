# Task 3 report: 设置页三段式外观选择

Status: complete

## RED

命令：

```powershell
npm test -- tests/settings-pages.test.ts -t appearance
```

结果：失败（预期）。测试首先因页面缺少 `appearanceOptions`、`onAppearanceSelect` 而失败，确认测试覆盖的是尚未实现的行为。

## GREEN

- 设置页新增固定顺序“浅色 / 深色 / 跟随系统”内联选择器。
- 选择器调用同一 `ThemeRuntime.setPreference()`，立即更新 `themePreference`/解析主题和选中态。
- 存储失败仍应用当前会话主题，并显示“外观设置未能保存，下次打开可能恢复为跟随系统”；不导航、不阻断。
- `pages/more/index.js` 由 `npm run build:wechat` 生成并与 TypeScript 保持一致。

验证命令：

```powershell
npm test -- tests/settings-pages.test.ts tests/theme-runtime.test.ts
npm test
npm run typecheck
npm run build:wechat
git diff --check
```

结果：定向 2 suites / 22 tests 通过；全量 28 suites / 135 tests 通过；类型检查、微信构建和 diff 检查通过。

## Changed files

- `pages/more/index.ts`
- `pages/more/index.js`
- `pages/more/index.wxml`
- `pages/more/index.wxss`
- `tests/settings-pages.test.ts`

## Concerns

- 当前工作树在 Task 3 开始前已有设置页 Sunlit UI 样式和设置测试改动；本任务保留这些改动，未清理或回退。
- 本地测试、类型检查和构建不替代微信开发者工具/真机对主题切换、原生区域和持久化的验收。

## Fix round 1

### RED

新增回归覆盖：

- 深色偏好下，`dataset.value` 为 `sepia` 或缺失时，主题、存储值和 `setData` 均保持不变。
- 读取生产 `pages/more/index.wxml`，约束外观选择器为内联固定顺序数据循环，绑定 `onAppearanceSelect`、每项 `data-value`、当前 `themePreference` 选中类和错误提示。
- 通过 `withThemePage` 包装真实设置页，验证已存储的深色偏好进入页面初始状态。

命令：

```powershell
npm test -- tests/settings-pages.test.ts -t "appearance|production more page|markup"
```

结果：失败（预期）。两条非法值测试确认旧处理器将深色改为 `system` 并产生副作用；其余结构与包装回归通过。

### GREEN

`onAppearanceSelect` 现在只接受精确的 `light`、`dark`、`system`，其他值立即返回，不调用 `ThemeRuntime.setPreference()`，因此不会覆盖存储或调用 `setData`。

验证结果：

- 定向 Task 3/主题：2 suites / 26 tests 通过。
- 全量 Jest：28 suites / 139 tests 通过。
- `npm run typecheck`：通过。
- `npm run build:wechat`：通过。
- `git diff --check`：通过。

修复提交：`335dd82` — `fix: validate appearance preferences and markup`。

## Fix round 2

### RED

增强设置页回归：

- 非法值、接近当前值的 `dark ` 和缺失值都从已选深色开始，并 spy 实际 `ThemeRuntime.setPreference()`；要求调用次数为 0、存储和页面状态不变。
- WXML 断言先移除注释，再结构化定位 `appearance-control`，要求真实 warning `text` 节点带 `wx:if="{{themePersistenceWarning}}"`、精确 class 和文本绑定，位于 `appearance-selector` 之后且仍在外观控件内。
- 删除真实 warning 节点并留下注释诱饵的变异必须失败；同时验证生产页经 `withThemePage` 读取已存储主题。

为证明新增 spy 回归能够捕获退化，临时对生成 JS 做未提交回退后运行：

```powershell
npm test -- tests/settings-pages.test.ts -t "appearance|production more page|markup"
```

结果：失败（预期），三种非法输入均被旧实现写成 `system`；WXML 结构与包装页测试正常通过。随后由 TypeScript 重新生成 JS，未提交临时回退。

### GREEN

- `onAppearanceSelect` 的三值白名单及早退行为保持通过。
- 注释安全、结构化 WXML 契约和 spy 调用次数均通过。

验证结果：

- Task 3/主题定向：2 suites / 27 tests 通过。
- 全量 Jest：28 suites / 140 tests 通过。
- `npm run typecheck`：通过。
- `npm run build:wechat`：通过。
- `git diff --check`：通过。

修复轮次测试提交：`812994c` — `test: harden appearance selector contract`。

## Fix round 3

本轮仅增强测试，不修改运行时或页面 UI：

- warning 结构断言在解析前剥离注释，避免注释诱饵被误认作真实节点。
- 使用最小平衡 `<view>` 标签扫描确定 `.appearance-control` 与 `.appearance-selector` 的真实边界；warning 必须是精确的 `text` 节点，带 `wx:if="{{themePersistenceWarning}}"`、warning class 和文本绑定，嵌套在控件内且位于 selector 之后。
- 增加负向变异：将真实 warning 节点移动到 `.appearance-control` 外，断言必须失败；删除节点并保留注释诱饵的回归继续覆盖。

验证结果：

- Task 3/主题定向：2 suites / 27 tests 通过。
- 全量 Jest：28 suites / 140 tests 通过。
- `npm run typecheck`：通过。
- `npm run build:wechat`：通过。
- `git diff --check`：通过。

修复轮次测试提交：待提交。
