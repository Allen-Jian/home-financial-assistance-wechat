# 家庭手账微信小程序

微信原生小程序（TypeScript/WXML/WXSS）客户端，复用现有家庭手账 API 和 PostgreSQL 数据库。

## 仓库边界

- 本仓库只保存小程序前端、Mock、测试和 API 契约。
- 不复制数据库，也不在小程序端直连 PostgreSQL。
- 后端继续使用现有仓库 [`home-financial-assistance`](https://github.com/Allen-Jian/home-financial-assistance)。
- 微信 AppID/AppSecret 只在后端环境配置；当前没有 AppID，开发阶段使用 Mock 登录。

## 当前状态

设计已确认，规格见 [`docs/superpowers/specs/2026-08-29-family-ledger-wechat-design.md`](docs/superpowers/specs/2026-08-29-family-ledger-wechat-design.md)。

实现会在规格审阅后开始。

