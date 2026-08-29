# 家庭手账微信小程序

微信原生小程序（TypeScript/WXML/WXSS）客户端，复用现有家庭手账 API 和 PostgreSQL 数据库。

## 仓库边界

- 本仓库只保存小程序前端、Mock、测试和 API 契约。
- 不复制数据库，也不在小程序端直连 PostgreSQL。
- 后端继续使用现有仓库 [`home-financial-assistance`](https://github.com/Allen-Jian/home-financial-assistance)。
- 微信 AppID 可用于客户端工程配置；AppSecret 只在后端环境配置，不能写入小程序代码。

## 当前状态

设计与实现计划已确认，规格见 [`docs/superpowers/specs/2026-08-29-family-ledger-wechat-design.md`](docs/superpowers/specs/2026-08-29-family-ledger-wechat-design.md)，计划见 [`docs/superpowers/plans/2026-08-29-family-ledger-wechat.md`](docs/superpowers/plans/2026-08-29-family-ledger-wechat.md)。

当前已完成本地 MVP：登录/Mock、家庭驾驶舱、单页记账、附件/CSV staging、草稿人工确认、重复候选、月季年报表、周期账单、家庭成员、导出和只读 AI 聊天。实现状态与证据见 [`docs/superpowers/implementation-status.md`](docs/superpowers/implementation-status.md)。

```powershell
npm ci
npm run build:wechat
npm test -- --runInBand
npm run typecheck
```

微信开发者工具需要 JavaScript 页面文件。修改 TypeScript 后先运行 `npm run build:wechat`，再导入本目录；该命令会生成 `app.js`、各页面 `index.js` 以及 `src` 依赖文件。

当前工程已配置 AppID `wxff77e75108c26871` 和生产 API 地址。真实微信登录、MiniMax 凭据、备案后的合法域名和真机验收仍按文档列为外部门槛；没有后端 AppSecret 时，请先运行界面测试或按 [`docs/acceptance/mock-flow.md`](docs/acceptance/mock-flow.md) 运行 Mock 验收。
