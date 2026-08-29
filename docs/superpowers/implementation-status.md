# 微信小程序实现状态

本页记录当前会话内按计划执行的本地证据。每个任务都经过独立的测试、差异审查和小提交；没有把外部设备、凭据或部署状态假报为完成。

| 任务 | 本地结果 | 提交 |
|---|---|---|
| 1. 工程底座 | 5 个前置测试/类型检查通过 | `f4c3f11` |
| 2. 契约与 Mock 登录 | 4 个聚焦测试通过 | `6ec3609` |
| 3. API 微信身份 | Prisma 校验、21 套件/63 测试、API 构建通过 | `087a270`（现有 API 仓库） |
| 4. API 客户端/缓存/金额/周期 | 9 个聚焦测试、类型检查通过 | `08b2669` |
| 5. 登录/驾驶舱/记账 | 7 套件/20 测试、类型检查通过 | `7acf939` |
| 6. 导入/草稿复核 | 9 套件/27 测试、类型检查通过 | `b12dad9` |
| 7. 报表/周期/家庭/导出 | 11 套件/33 测试、类型检查通过 | `c34c2a3` |
| 8. AI/全局错误 | 12 套件/39 测试、类型检查通过 | `60f26f8` |
| 9. J 配色与系统暗夜模式 | 主题令牌测试、类型检查、旧颜色扫描通过 | `fc588ae` |
| 10. AI 票据/自然语言草稿 | API 5 个聚焦测试、小程序导入测试和两端构建通过 | `af05174`, `ef326d9` |
| 11. 私有多轮 AI 聊天 | Prisma 校验、AI 7 个聚焦测试、API 构建通过 | `6306a82`, `81f7807` |
| 12. 小程序 AI 契约/驾驶舱洞察 | API 契约、AI 页面和洞察测试通过，微信构建通过 | `bbef85e`, `06ea76d` |

## 当前验证命令

```powershell
npm ci
npm test -- --runInBand
npm run typecheck
npm run build:wechat
```

现有 API 仓库另行执行：

```powershell
$env:DATABASE_URL='postgresql://ledger:ledger@localhost:5432/ledger'
npx prisma validate --schema prisma/schema.prisma
npx prisma generate
npm test -- --runInBand
npm run build
```

## 外部门槛

- 真实 `wx.login` 需要 AppID、后端 AppSecret、合法 request/upload 域名和 HTTPS。
- 需要在微信开发者工具/真机完成页面编译、权限和设备验收。
- MiniMax 真实票据/聊天冒烟测试需要服务端凭据；本地测试默认使用模拟响应。
- API、PostgreSQL、Redis/BullMQ 和附件存储仍需在目标 VPS 做隔离部署、备份恢复与资源观察。
- 本仓库没有包含 `project.private.config.json`、AppSecret、MiniMax Key、数据库 URL 或 token。
