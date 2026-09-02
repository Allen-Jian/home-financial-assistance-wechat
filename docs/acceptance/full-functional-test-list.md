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

## Sunlit UI 执行记录（2026-08-31）

- 小程序：25/25 Jest suites、107/107 tests、TypeScript typecheck、微信构建和 `git diff --check` 通过。
- 共享 API：25/25 Jest suites、109/109 tests、TypeScript build 和 `git diff --check` 通过；账号密码登录现返回客户端会话所需的 `householdId`。
- 微信开发者工具：AppID `wxff77e75108c26871` 预览编译成功，WXML 错误 0；首页、账目、三种记账入口、手动记账、AI 聊天、设置页完成模拟器截图检查。
- UI 静态检查：WXML 不包含 `toFixed`、金额除法或数组方法；结构图标不使用 emoji；按钮触控高度至少 88rpx；浅色/暗色使用统一语义令牌。
- 本轮没有以真实家庭数据调用线上 API。相机、相册、微信文件、真实 MiniMax 票据解析、暗夜模式真机对比和大字体仍属于真机验收项。

## 2026-08-31 主题、AI 聊天、图片来源与自定义导航

本节只记录本轮新鲜证据。自动化、微信开发者工具、真机和生产 API 分开判定；本地测试通过不替代 DevTools、真机或生产验收。状态字段只使用 `未执行`、`通过`、`失败（附复现）`；生产授权说明放在证据/限制栏。

### 验收矩阵

| ID | 验收项 | 验收标准 | 证据/限制 | 状态 |
|---|---|---|---|---|
| AUTO-01 | 本地自动化测试 | Jest 全量 suites/tests 通过 | `npm test -- --runInBand`：29 suites、224 tests 通过 | 通过 |
| AUTO-02 | TypeScript 类型检查 | typecheck 退出码为 0 | `npm run typecheck`：退出码 0 | 通过 |
| AUTO-03 | 微信构建 | 生成微信端 TypeScript 对应产物且退出码为 0 | `npm run build:wechat`：退出码 0 | 通过 |
| AUTO-04 | 工作树检查 | 无 whitespace error，提交前状态可核对 | `git diff --check fd2de0c..HEAD`：退出码 0；另执行 `git diff --check`，本轮开始于 clean HEAD | 通过 |
| AUTO-05 | 生产连接运行层 | 未确认/失败/none 时 request/upload 均为零，恢复在线后才放行并可 dispose | `tests/runtime-bootstrap.test.ts` 覆盖 pending callback、query fail、none、restore 与真实 `createAppRuntime` API transport | 通过 |
| AUTO-06 | 异步写入竞态与重试安全 | AI 发送/清除、图片草稿绑定/确认、原件上传失败重试均不越过人工确认边界 | `tests/ai-page.test.ts`、`tests/photo-entry.test.ts`、`tests/imports-page.test.ts` deferred 回归覆盖；imports 本轮 31 tests 全绿，含 terminal keep-both 与 picker accepted-state 即时页面渲染 | 通过 |
| THEME-01 | 浅色主题 | 页面、tabBar、原生栏和回弹色保持浅色令牌 | 自动化 source/runtime contract 已验证 `frontColor: '#000000'`；局部 DevTools 页面/原生栏/tab 证据见 `THEME-01-DEVTOOLS`，回弹与设备验收仍未执行 | 未执行 |
| THEME-02 | 暗夜主题 | 页面、tabBar、原生栏和回弹色保持暗色令牌 | 自动化 source/runtime contract 已验证 `frontColor: '#ffffff'`；局部 DevTools 页面/原生栏证据见 `THEME-02-DEVTOOLS`，回弹与设备验收仍未执行 | 未执行 |
| THEME-03 | 跟随系统主题 | 系统浅/深色变化后页面与原生区域同步 | 本轮未触发或观察系统主题切换；真机设备验收仍未执行 | 未执行 |
| THEME-04 | 主题重启持久化 | 选择主题后重启小程序仍恢复该偏好 | compile/reload 局部 DevTools 证据见 `THEME-04-DEVTOOLS`；设备重启验收仍未执行 | 未执行 |
| UI-01 | 原生栏与安全区 | navigation/background 原生色、底部安全区在三主题下正确 | navigation/background source/runtime contract 已自动验证；仍需 DevTools/真机当前截图或录屏确认原生栏与安全区 | 未执行 |
| UI-02 | 上下回弹 | 页面上下回弹背景与主题一致，不出现白边或遮挡 | 需要 DevTools/真机当前操作 | 未执行 |
| NAV-01 | 五槽自定义导航 | 固定显示：首页、账目、记账、AI 聊天、设置 | Jest 静态/行为测试覆盖五槽和真实 tab 路径 | 通过 |
| NAV-02 | 旧加号清理 | 首页不再显示旧 FAB/旧加号入口 | Jest 检查首页旧 FAB 标记与处理器已移除 | 通过 |
| NAV-03-AUTO | 中心记账槽调用契约 | 中心槽只调用一次 `navigateTo('/pages/entry/index')`，主 tab `onShow` 恢复选中槽 | Jest 覆盖单次跳转与选中态契约 | 通过 |
| NAV-03-MANUAL | 中心槽实际交互 | 快速连续点击、进入记账二级页并返回时导航不重复跳转且选中态正确 | 当前 DevTools 精确路径证据见 `NAV-03-DEVTOOLS`；真机交互仍未执行 | 未执行 |
| AI-01-AUTO | 短消息源码布局契约 | 用户/AI 分别使用左右对齐 class，气泡使用 fit-content 并受 max-width 约束 | Jest 覆盖 `.message-row.user/.assistant`、`.message-bubble` 及对应 WXML/WXSS 源码声明 | 通过 |
| AI-01-MANUAL | 短消息视觉收缩 | 短文本在微信渲染中自然收缩，不出现整行宽气泡或错位 | 当前 DevTools 精确截图证据见 `AI-01-DEVTOOLS`；设备视觉仍未执行 | 未执行 |
| AI-02-AUTO | 长消息气泡结构契约 | 长文本允许换行，scope/insight/citation 保持在同一 AI 气泡内 | Jest 覆盖 WXML 结构、WXSS 最大宽度和换行规则 | 通过 |
| AI-02-MANUAL | 长消息视觉换行 | 真正的长回答在微信渲染中换行且不挤压引用内容 | 当前 DevTools 精确截图证据见 `AI-02-DEVTOOLS`；设备视觉仍未执行 | 未执行 |
| AI-03-AUTO | 键盘布局契约 | 键盘高度、inset、生命周期和 `chat-end` 锚点计算正确 | Jest 覆盖模型契约与回调注册/解绑；闭合态按 112rpx tab + 43rpx raised action protrusion + 21rpx gap = 176rpx，并在 320/375/428px 宽度验证 | 通过 |
| AI-03-MANUAL | 键盘、输入法与多行 | 键盘出现/收起、输入法和多行输入时输入框可见并滚到最新消息 | 需要 DevTools/真机当前输入操作；本轮未执行 | 未执行 |
| IMAGE-01-AUTO | 相机来源调用契约 | `chooseMedia` 使用 camera-only 并进入统一识别草稿链 | Jest mock 覆盖来源参数与统一分析路径；真实相机另行验收 | 通过 |
| IMAGE-02-AUTO | 相册来源调用契约 | `chooseMedia` 使用 album-only 并进入统一识别草稿链 | Jest mock 覆盖来源参数与统一分析路径；真实相册另行验收 | 通过 |
| IMAGE-03-AUTO | 微信聊天图片调用契约 | `chooseMessageFile({ type: 'image' })` 并进入统一识别草稿链 | Jest mock 覆盖调用参数；真实微信文件选择器另行验收 | 通过 |
| IMAGE-04-AUTO | 取消逻辑契约 | 三种来源的 cancel 错误均不 toast、不清状态、不分析 | Jest mock 覆盖 cancel 语义与无副作用 | 通过 |
| IMAGE-05-MANUAL | 图片来源与权限交互 | 真实相机、相册、微信聊天图片选择、权限拒绝和取消均表现正确 | 需要 DevTools/真机当前操作；本轮未执行 | 未执行 |
| DEVTOOLS-01-COMPILE | DevTools 编译与 WXML | 当前工程在指定开发者工具与基础库中编译成功且无 WXML 错误 | 2026-09-03：IDE MCP 0.9.16、基础库 2.33.0；compile succeeded，WXML errors=[]。通用 npm warning 不适用（项目没有 `miniprogram/` 目录）；仅有工具 Node punycode deprecation | 通过 |
| DEVTOOLS-02-CONSOLE | DevTools 运行时控制台 | 运行时观察窗口内无 error/warning/exception | 2026-09-03：runtime console inspector 观察 8 秒，errors=0、warnings=0、exceptions=0 | 通过 |
| THEME-01-DEVTOOLS | 浅色页面/原生栏/tabBar | 浅色页面、原生栏和 tabBar 截图与浅色令牌一致 | 2026-09-03：settings 页 system/light→dark→light 切换时 page_data 匹配令牌/class；重编译后 light settings 截图的页面、原生栏、tab 均为浅色 | 通过 |
| THEME-02-DEVTOOLS | 暗色页面/原生栏 | 暗色页面与原生栏截图使用暗色令牌 | 2026-09-03：重编译 `fc347ee` 后 login dark 截图同时显示暗色页面与暗色原生栏；page_data 令牌/class 匹配 | 通过 |
| THEME-04-DEVTOOLS | 暗色偏好重载持久化 | compile/reload 后仍恢复已选暗色偏好 | 2026-09-03：compile/reload 后 login page_data 的 preference/resolved 均为 dark | 通过 |
| NAV-03-DEVTOOLS | 中心记账槽快速点击与返回 | 中心槽快速重复点击只进入一个记账页，返回后恢复设置页选中态 | 2026-09-03：五槽 label 与 selected=4 已检查；连续调用 center `openEntry` 两次后 stack depth=2，navigateBack 后 depth=1、settings selected=4、openingEntry=false | 通过 |
| AI-01-DEVTOOLS | 短消息视觉收缩 | 短用户消息在微信渲染中自然收缩并右对齐 | 2026-09-03：AI 截图中用户 `hi` 气泡自然宽度、右对齐 | 通过 |
| AI-02-DEVTOOLS | 长消息视觉换行 | 长 AI 回答左对齐换行，结构化 insight 保持在气泡内 | 2026-09-03：AI 截图中长 assistant 消息左侧换行，insight 结构块保持可见 | 通过 |
| AI-03-DEVTOOLS | 闭合 composer 与 raised action | 闭合输入框不遮挡中心 raised 记账槽 | 2026-09-03：重编译 `e5b1dd4` 后 AI 截图显示中心 plus，composer 与 raised action 无重叠 | 通过 |
| IMAGE-05-CONTROLS-DEVTOOLS | 图片页入口布局 | 图片页主相机入口与相册/聊天图片次级入口对齐 | 2026-09-03：photo 页截图显示 camera primary 与 album/chat secondary controls 对齐；实际 picker、权限与取消未调用 | 通过 |
| DEVTOOLS-01 | 微信开发者工具 | 三主题、原生栏/回弹、五槽、旧加号、气泡、键盘、多行、三图片来源均可操作 | 已记录的局部 compile/runtime/theme/navigation/AI/photo 证据见精确子行；回弹、系统事件、键盘、实际 picker 和完整 composite 仍未执行 | 未执行 |
| DEVICE-01 | 真机验收 | iOS/Android 完成主题、输入法、相机/相册/聊天图片、网络错误和安全区验收 | 本轮没有连接真机或采集设备证据 | 未执行 |
| API-LOCAL-01 | 共享 API 本地 null scope 修复 | MiniMax 返回 null scope 时由服务端使用可信报告期间，输出 `scope.from/to` 字符串 | 只读检查 `D:\self\家庭手账APP\apps\api\src\ai\minimax.client.ts` 与 `ai-chat.service.ts`；AI 相关 2 suites/12 tests、完整 25 suites/110 tests、`npm run build` 均通过。API 工作树原有用户改动保持不动 | 通过 |
| API-PROD-01 | 生产 `/v1/ai/chat` | 授权后重建并重启 api，再用空账本和有账目家庭验证 HTTP 200、字符串 scope、只读回答和授权引用 | 本轮未访问或重启 VPS；生产 502 仍在授权门槛，必须用户明确授权“仅重建并发布 VPS API 服务”后才能继续 | 未执行 |

### 本轮命令与边界

微信仓库在 clean committed HEAD 上执行了：

```powershell
npm test -- --runInBand
npm run typecheck
npm run build:wechat
git diff --check
git status --short --branch
```

API 仅在本地工作树只读执行了：

```powershell
npm test -- --runInBand src/ai/minimax.client.test.ts src/ai/ai-chat.service.test.ts
npm test -- --runInBand
npm run build
git diff --check
git status --short --branch
```

API 当前工作树的既有修改包括 `apps/api/src/ai/ai-chat.service.ts`、`apps/api/src/ai/minimax.client.ts`、对应测试以及认证文件；本轮没有编辑、部署、重启或触碰数据库、Redis、volume、migration、凭据。微信开发者工具仅完成了上表记录的局部证据，综合 `DEVTOOLS-01` 仍未执行；生产 502 与真机状态均保持待后续授权/设备验收。

## 功能清单

### Task 8 导入入口记录（2026-08-30）

导入工作台现在明确提供“拍照、相册、微信文件、CSV”四个入口：拍照使用 `wx.chooseMedia` 的 camera-only 来源，相册使用 album-only 来源，微信文件与 CSV 继续使用 `wx.chooseMessageFile`（仅表示微信会话文件选择，不是通用 OS 文件选择器）。20 MB 限制、签名校验、哈希幂等 staging、staging 后附件上传，以及 AI 失败保留原件/重试或手工输入链路保持不变。

自动化验证已覆盖入口模型与安全链路；微信开发者工具编译、相册/相机/微信文件选择器实际打开、相机权限、取消选择和真实票据仍需在 DevTools 与真机完成。

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
| IMP-01 | 文件选择 | 拍照、相册、微信文件、CSV 分入口；支持 JPEG、PNG、PDF、CSV，最大 20 MB | 自动+手工 | 自动通过；DevTools/真机待测 |
| IMP-02 | 文件真实性 | 扩展名/MIME 与签名不匹配时拒绝 | 自动 | 自动通过 |
| IMP-03 | 文件哈希幂等 | 同家庭同文件哈希重用批次，不重复 staging | 自动 | 自动通过 |
| IMP-04 | ANZ CSV | 支持单金额列及 debit/credit 列，保留引号商户 | 自动+真实 | 自动通过；真实样本待测 |
| IMP-05 | 票据 AI 草稿 | 图片/PDF 解析为结构化草稿，确认前不影响余额 | 自动+真实 | 自动通过；真实待测 |
| IMP-06 | 自然语言草稿 | 中文自然语言进入与票据相同的草稿复核流程 | 自动+真实 | 自动及真实服务边界通过 |
| IMP-07 | AI 失败恢复 | 解析失败保留原件并允许重试或手填 | 自动+手工 | 自动通过；手工待测 |
| DRAFT-01 | 草稿确认 | 草稿确认不暴露账户选择；成功后才入账并写审计 | 自动 | 自动通过 |
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
| UI-05 | Sunlit 一致性 | 首页、账目、记账、AI、设置使用统一颜色、间距、圆角、空状态和焦点态 | 自动+工具+手工 | 自动与 IDE 通过；真机待测 |
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
