# 微信登录 API 契约

小程序只发送 `wx.login()` 返回的临时 `code`，不会发送或保存 `AppSecret`。

## `POST /v1/auth/wechat/login`

请求：

```json
{
  "code": "temporary-code",
  "inviteCode": "optional-one-time-code",
  "householdName": "optional-name"
}
```

响应：

```json
{
  "accessToken": "short-lived-token",
  "refreshToken": "rotating-token",
  "householdId": "household-id",
  "isNewUser": true
}
```

行为：

- 已绑定身份：签发现有家庭的 access/refresh token。
- 新身份带 `inviteCode`：创建用户并加入邀请码对应家庭，角色为 `member`。
- 新身份不带邀请码：创建“我的家庭”，角色为 `owner`；若提供 `householdName` 则使用该名称。
- 邀请码必须未领取且未过期；服务端只保存邀请码哈希。
- 正式环境由 API 使用 `WECHAT_APP_ID`/`WECHAT_APP_SECRET` 调用微信换取 `openid`；开发 Mock 模式不得进入生产构建。

错误：

- `400`：缺少 `code` 或请求格式错误。
- `401`：微信 code 无效或已过期。
- `409`：邀请码已领取、身份绑定冲突或版本冲突。
