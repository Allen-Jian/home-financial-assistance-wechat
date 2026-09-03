# Task 8 验收报告

日期：2026-09-02
范围：2026-08-31 主题、AI 聊天、图片来源与自定义导航的本地/验收记录。

## 微信仓库执行前状态

目标仓库：`D:\self\家庭手账APP-wechat`

```powershell
git status --short --branch
```

输出：`## feat/wechat-production-wiring...origin/feat/wechat-production-wiring [ahead 38]`，无工作树修改（clean committed HEAD）。

## 微信仓库验证命令及结果

```powershell
npm test -- --runInBand
```

输出：PASS，29 suites、186 tests；无失败测试。

```powershell
npm run typecheck
```

输出：退出码 0。

```powershell
npm run build:wechat
```

输出：退出码 0。

```powershell
git diff --check
```

输出：退出码 0，无 whitespace error。

验收清单：`docs/acceptance/full-functional-test-list.md` 已新增 `2026-08-31 主题、AI 聊天、图片来源与自定义导航` 矩阵。自动化与视觉/平台项目已拆分：源码契约（包括用户/AI 对齐 class、fit-content/max-width 声明）使用 `通过`，短消息真实视觉收缩、输入法/真实图片选择器使用 `未执行`；生产授权说明放在证据/限制栏，生产项目状态为 `未执行`。

## 共享 API 只读核验

目标仓库：`D:\self\家庭手账APP`

本地工作树在核验前已有用户修改：`apps/api/src/ai/ai-chat.service.ts`、`apps/api/src/ai/minimax.client.ts`、对应 AI 测试及认证文件。本轮没有编辑这些文件，也没有部署或重启服务。

```powershell
npm test -- --runInBand src/ai/minimax.client.test.ts src/ai/ai-chat.service.test.ts
```

输出：PASS，2 suites、12 tests。

```powershell
npm test -- --runInBand
```

输出：PASS，25 suites、110 tests。

```powershell
npm run build
```

输出：退出码 0。

只读检查确认 `MiniMaxClient.validateAiChatAnswer` 不接受 `null` 的 `scope.from/to`，`AiChatService.normalizeAnswer` 在这种情况下回退到可信报告期间，因此本地响应仍提供字符串 `scope.from/to`。API `git diff --check` 退出码为 0；仅有 Git LF/CRLF 行尾提示，且既有修改仍保留。

## 外部限制与授权门槛

- 未连接当前微信开发者工具会话，未采集新的编译/运行日志；DevTools 状态为 `未执行`。
- 未连接 iOS/Android 真机，未验证输入法、相机、相册、微信聊天图片、权限、安全区或网络错误；设备状态为 `未执行`。
- 未访问、重建或重启 VPS API，也未触碰数据库、Redis、volume、migration 或凭据。
- 生产 `/v1/ai/chat` 的 502/null-scope 验收状态保持 `未执行`；继续操作前需要用户单独明确授权“仅重建并发布 VPS API 服务”。本报告不宣称生产 502 已解决。
- 未使用真实家庭财务数据、真实 MiniMax 生产密钥或真实图片选择器；本地 PASS 不替代真实服务和设备验收。
