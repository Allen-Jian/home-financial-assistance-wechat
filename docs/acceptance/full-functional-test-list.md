# 家庭手账微信小程序全功能测试清单

范围：微信小程序客户端 `home-financial-assistance-wechat` 与共用 NestJS/PostgreSQL API `home-financial-assistance`。本清单不把 Flutter/iOS 真机验收计入微信版本的完成度。

## MiniMax 配置

MiniMax 密钥只配置在 API 服务端，绝不写入小程序、`project.private.config.json`、Git 或日志。

本地/部署配置文件使用 API 仓库中的未跟踪文件：

```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

填写：

```text
MINIMAX_API_KEY=你的服务端密钥
MINIMAX_MODEL=你的 MiniMax 控制台显示的准确模型 ID
MINIMAX_ENDPOINT=https://api.minimaxi.com/v1/text/chatcompletion_v2
```

直接在 Windows 本地运行 API 时，NestJS 不会自行读取该文件；从 `apps/api` 启动：

```powershell
npm run build
node --env-file=.env dist/main.js
```

Docker Compose 使用同一个文件：

```powershell
.\scripts\verify-deployment.ps1 -EnvFile apps/api/.env -CheckCompose
docker compose --env-file apps/api/.env -f infra/docker-compose.yml up -d --build api
```

注意：当前生产账号使用中国站端点和 `MiniMax-M3`。模型可用性仍取决于账号控制台；更换账号时必须用该账号实际可用的模型 ID 覆盖 `MINIMAX_MODEL`。没有密钥时 API 应返回 `503 AI service is not configured`。

## 结果标记

- `自动`：由 Jest、TypeScript、Prisma 或静态检查覆盖，本轮应执行。
- `手工`：需要微信开发者工具或设备操作。
- `真实`：需要真实微信、MiniMax、VPS、HTTPS、数据库或样本。
- `待补`：当前自动化没有充分覆盖，不能标记为通过。

## 本轮执行记录（2026-08-29）

- 小程序：20/20 Jest suites、54/54 tests、TypeScript typecheck 和微信构建通过。
- 微信开发者工具：AppID `wxff77e75108c26871` 编译成功，WXML 错误 0；登录页运行时采集 8 秒，console error/warning/exception 均为 0。
- API：22/22 Jest suites、69/69 tests、TypeScript build、Prisma validate/generate 通过。
- 线上只读检查：`https://ledger-api.allenjian.fun/v1/health` 返回 200/`{"status":"ok"}`；未带 token 的 `/v1/ai/parse-draft`、`/v1/ai/conversations` 和 `/v1/ai/insights` 返回预期 401。
- Hostinger 真实 MiniMax 冒烟：`MiniMax-M3` 经中国站端点完成自然语言草稿和只读聊天结构校验；未使用真实家庭财务数据。

## 功能清单

| ID | 功能 | 验收标准 | 方式 | 本轮结果 |
|---|---|---|---|---|
| CFG-01 | 服务端 MiniMax 配置 | 密钥只从后端环境变量读取；缺失时清晰返回 503 | 自动 | 自动通过 |
| CFG-02 | 前端密钥隔离 | 小程序跟踪文件不含 MiniMax/AppSecret/数据库/token | 自动 | 自动通过 |
| CFG-03 | 模型与端点可用 | 使用账号实际模型 ID 完成一次低成本请求 | 真实 | 中国站 MiniMax-M3 通过 |
| AUTH-01 | Mock 登录 | 无 AppID 开发环境可创建首个 owner/家庭 | 自动 | 自动通过 |
| AUTH-02 | 微信登录 | `wx.login` code 只发到后端；后端交换 openid | 自动+真实 | 自动通过；真实待测 |
| AUTH-03 | 邀请加入家庭 | 有效一次性邀请码创建 member；过期/竞态领取被拒绝 | 自动 | 自动通过 |
| AUTH-04 | 会话刷新 | 读请求 401 只刷新一次并保留 householdId | 自动 | 自动通过 |
| AUTH-05 | 写请求安全 | 失败的财务写入不在客户端自动重试 | 自动 | 自动通过 |
| AUTH-06 | 退出登录 | 撤销会话并清除 token、本地 AI 私有缓存 | 自动+手工 | 自动通过；手工待测 |
| HOME-01 | 家庭驾驶舱 | 显示净资产、期间收入/支出、草稿/重复/周期待办 | 自动+手工 | 自动通过；手工待测 |
| HOME-02 | 离线缓存 | 读取失败显示带时间的缓存标签 | 自动 | 自动通过 |
| HOME-03 | 离线只读 | 离线新增、编辑、导入和 AI 均被拒绝 | 自动+手工 | 自动通过；手工待测 |
| HOME-04 | J 主题 | 浅色/暗夜令牌正确，随系统自动切换 | 自动+手工 | 自动通过；手工待测 |
| ACCT-01 | 账户 | 家庭成员可创建/读取账户，外部成员不可访问 | 自动 | 自动通过 |
| ACCT-02 | 分类 | 收入/支出分类按方向使用且家庭隔离 | 自动 | 自动通过 |
| TXN-01 | 手工收入/支出 | 正金额转换为整数 NZ 分，日期以 UTC 入库 | 自动 | 自动通过 |
| TXN-02 | 资产负债 | 资产相加、负债相减计算净资产 | 自动 | 自动通过 |
| TXN-03 | 转账 | 生成两边账户变动且不计入收入/支出 | 自动 | 自动通过 |
| TXN-04 | 幂等写入 | 同 householdId/idempotencyKey 同内容只产生一笔 | 自动 | 自动通过 |
| TXN-05 | 版本删除 | 软删除要求 expectedVersion；冲突不覆盖 | 自动 | 自动通过 |
| DUP-01 | 重复候选 | 同方向同金额、日期 ±3 天生成候选 | 自动 | 自动通过 |
| DUP-02 | 人工决定 | 仅提供“稍后处理”和“保留两笔”；不自动删除 | 自动+手工 | 自动通过；手工待测 |
| IMP-01 | 文件选择 | 支持 JPEG、PNG、PDF、CSV，最大 20 MB | 自动+手工 | 自动通过；手工待测 |
| IMP-02 | 文件真实性 | 扩展名/MIME 与签名不匹配时拒绝 | 自动 | 自动通过 |
| IMP-03 | 文件哈希幂等 | 同家庭同文件哈希重用批次，不重复 staging | 自动 | 自动通过 |
| IMP-04 | ANZ CSV | 支持单金额列及 debit/credit 列，保留引号商户 | 自动+真实 | 自动通过；真实样本待测 |
| IMP-05 | 票据 AI 草稿 | 图片/PDF 解析为结构化草稿，确认前不影响余额 | 自动+真实 | 自动通过；真实待测 |
| IMP-06 | 自然语言草稿 | 中文自然语言进入与票据相同的草稿复核流程 | 自动+真实 | 自动及真实服务边界通过 |
| IMP-07 | AI 失败恢复 | 解析失败保留原件并允许重试或手填 | 自动+手工 | 自动通过；手工待测 |
| DRAFT-01 | 草稿确认 | 必须选择合法账户，成功后才入账并写审计 | 自动 | 自动通过 |
| DRAFT-02 | 草稿重复冲突 | 409 时保留草稿与候选，不误删本地状态 | 自动 | 自动通过 |
| ATT-01 | 附件加密 | AES-256-GCM 保存密文，篡改密文无法解密 | 自动 | 自动通过 |
| ATT-02 | 附件授权 | 仅所属家庭可上传/读取附件 | 自动 | 自动通过 |
| RPT-01 | 月季年范围 | 使用 Pacific/Auckland 日历边界查询 | 自动 | 自动通过 |
| RPT-02 | 分类/账户下钻 | 下钻不改变当前期间 | 自动 | 自动通过 |
| EXP-01 | JSON/CSV 导出 | 只导出已确认家庭交易；CSV 带 BOM 并正确转义 | 自动+手工 | 自动通过；手工待测 |
| REC-01 | 周期账单 | 创建月度模板并正确推进月底日期 | 自动 | 自动通过 |
| REC-02 | 不自动入账 | 到期/推进只提醒，不创建交易 | 自动+手工 | 自动通过；手工待测 |
| AI-01 | 只读分析 | 可做期间汇总、分类比较、趋势、异常和搜索 | 自动+真实 | 自动通过；真实待测 |
| AI-02 | 禁止修改 | SQL/修改账本提示在调用模型前被拒绝 | 自动 | 自动通过 |
| AI-03 | 结构化回答 | 返回 answer、scope、insights、citations 并校验格式 | 自动+真实 | 自动及真实服务边界通过 |
| AI-04 | 多轮聊天 | 追问复用 conversationId，刷新后可恢复历史 | 自动+手工 | 自动通过；手工待测 |
| AI-05 | 私有聊天 | 仅创建者可列出/删除对话，退出清本地缓存 | 自动 | 自动通过 |
| AI-06 | 引用授权 | 引用只能指向当前家庭可访问的交易 | 待补 | 未充分覆盖 |
| AI-07 | 过期清理 | 90 天到期对话能被清理 | 待补 | 未充分覆盖 |
| HH-01 | 角色权限 | 只有 owner 可创建邀请/移除普通成员 | 自动+手工 | 自动通过；手工待测 |
| HH-02 | 家庭隔离 | 账户、交易、草稿、附件、导出均不可跨家庭读取 | 自动 | 自动通过 |
| UI-01 | 构建完整 | app、全部页面和自定义组件均生成 `.js` | 自动 | 自动通过 |
| UI-02 | 页面流程 | 登录、首页、记账、导入、草稿、报表、AI、周期、家庭、更多可操作 | 自动+手工 | 自动通过；手工待测 |
| UI-03 | 微信编译 | WXML/WXSS/JSON 在开发者工具无编译错误 | 工具+手工 | IDE 编译通过；真机待测 |
| UI-04 | 真机可用性 | iOS/Android 字体、暗夜、相机、文件、网络错误可用 | 手工 | 待测 |
| OPS-01 | API 构建与 schema | TypeScript 构建、Prisma validate/generate 通过 | 自动 | 自动通过 |
| OPS-02 | 健康检查 | `/v1/health` 在部署环境返回稳定结果 | 自动+真实 | 自动通过；线上 200 |
| OPS-03 | HTTPS/合法域名 | TLS 有效，微信 request/upload 合法域名已登记 | 真实 | HTTPS 通过；微信后台待核 |
| OPS-04 | 数据库隔离 | PostgreSQL 无公网端口，家庭查询有授权边界 | 自动+真实 | 自动通过；公网端口待核 |
| OPS-05 | 备份恢复 | 数据库和附件备份可恢复到隔离环境 | 真实 | 待测 |
| OPS-06 | 限流与日志脱敏 | 登录、上传、AI 有限流；日志无财务正文和密钥 | 待补+真实 | 未充分覆盖 |

## 自动验证命令

小程序仓库：

```powershell
npm test -- --runInBand
npm run typecheck
npm run build:wechat
git diff --check
```

API 仓库（从 `apps/api` 执行）：

```powershell
$env:DATABASE_URL='postgresql://ledger:ledger@localhost:5432/ledger'
npx prisma validate --schema prisma/schema.prisma
npx prisma generate --schema prisma/schema.prisma
npm test -- --runInBand
npm run build
git diff --check
```

真实 MiniMax 冒烟测试必须使用脱敏文本/票据，只记录 HTTP 状态、结构校验结果、请求耗时和模型 ID，不记录密钥、完整提示、票据正文或账务上下文。
