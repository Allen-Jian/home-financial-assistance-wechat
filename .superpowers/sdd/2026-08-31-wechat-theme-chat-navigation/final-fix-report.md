# Final review fix report

日期：2026-09-02

范围：仅处理 Sol 最终审查指出的本地小程序集成问题；未执行 VPS、生产 API、微信开发者工具或真机操作。

## RED / GREEN 证据

### AI mutation races

- RED：新增 deferred 测试后，`npm test -- --runInBand tests/ai-page.test.ts -t "local send|hydration result|clearing history|concurrent sends"` 失败 4 项：hydration 覆盖本地发送、清除后 late response/rejection 仍返回成功、并发发送不是 single-flight。
- GREEN：使用一个 operation epoch 覆盖 hydrate/send/clear；send 开始即失效 pending hydrate；clear 失效发送并清空 loading/error；late response/error 不再写入消息、缓存或错误；并发 send 返回同一个 in-flight promise。上述 4 项通过。

### Pessimistic connectivity boundary

- RED：新增真实 `createAppRuntime` bootstrap/transport 测试时，`AppRuntime.connectivity` 不存在，未确认状态无法阻止 request/upload。
- GREEN：新增 `ConnectivityRuntime`，初始 unknown/offline，`getNetworkType` 失败/none 保持阻断，网络恢复后放行，dispose 解绑 listener；生产 `ApiClient` 由 runtime 注入该 gate，request/upload 在确认前均不调用 transport。bootstrap 覆盖 pending callback、query failure、none、restore 和 zero request/upload。

### Photo draft binding and confirmation

- RED：新文件离线选择仍保留旧 draft；confirm loading 期间双击产生重复 API 调用且页面未立即渲染 loading。
- GREEN：成功选择后在读取/网络检查/分析前递增 file revision 并清除 draftId、编辑字段、confirmed/uploaded 等旧状态，同时保留当前文件；draft 绑定 revision；confirm 在 loading/confirmed 时 no-op；页面在 await 前先 setData。新增离线旧 draft、失败上传和 deferred double-tap 覆盖通过。

### Import original upload retry

- RED：首次 stage 成功但 upload 失败后，第二次命中 staged cache 直接返回成功而不重试；reused stage 也跳过原件上传。
- GREEN：staged draft cache 与 upload completion set 分离；缓存命中时只复用 stage，未完成原件仍上传，失败继续返回 false/保留错误，成功前不宣称 uploaded。失败→缓存 retry 与 reused result 回归通过。

### Minor delivery gaps

- RED/GREEN：`withThemePage` onLoad throw 的 unsubscribe/rethrow、custom tab switch fail rollback 均新增测试并先红后绿。
- 清除 Sunlit spec 的 trailing whitespace 和 assets WXSS 的空 EOF；新增根 `.gitattributes`：`*.js text eol=lf`。

## Previous-round verification

- `npm test -- --runInBand`：29 suites、198 tests passed。
- `npm run typecheck`：exit 0。
- `npm run build:wechat`：exit 0。
- `git diff --check fd2de0c..HEAD`：exit 0。
- Clean clone evidence：`D:\self\家庭手账APP-wechat-clean-clone-458b204` 从 commit `458b204` freshly cloned，设置 `core.autocrlf=true`，`npm ci --ignore-scripts` 后 `npm run build:wechat` exit 0；`git status --short` 为空；39 个 Git-tracked `*.js` 文件检查到 0 个 CR 字节。

微信开发者工具、真机、生产 API/VPS 仍保持 `未执行`，没有因本地自动化结果改变其状态；没有 push/deploy。

## Round 2 final review fixes

### RED / GREEN 证据

- ConnectivityRuntime：RED：`tests/runtime-bootstrap.test.ts` 新增延迟初始 success/fail 与 dispose 回调测试后，2 项失败（事件后的延迟 success 覆盖 offline；dispose 后 fail/事件改写状态）。GREEN：`eventSeen`、generation 和 disposed guard 使网络状态事件权威，初始回调及销毁后的回调均不再变更状态；生产 `createAppRuntime` 的 request/upload gate 回归通过。
- AI composer：RED：`tests/ai-page.test.ts` 新增 deferred `sendCurrent` 草稿归属与空历史 hydrate 错误清理测试后，2 项失败（第二次调用等待首个请求、旧 error 未清理）。GREEN：in-flight send 立即返回 false；提交文本只在 draft 未被改写时清空；当前成功 hydrate（含空历史）清除旧 error。
- Imports stage/confirm：RED：`tests/imports-page.test.ts` 新增同一选择快速双击、旧 stage 延迟后切换新文件、statement confirm 双击/选中行变更测试后，stage 快照/上传出现重复调用或把新文件传给旧 draft，confirm 页面未立即渲染 loading。GREEN：selection revision、不可变 stage snapshot、stage/upload 单航、旧操作 UI guard，以及 statement selected-row snapshot/dedicated in-flight guard 均通过；页面先渲染 loading 再等待结果。

### Round 2 verification

- Code/tests commit：`eba9400` (`fix: close final async integration races`)。
- 聚焦：`npm test -- --runInBand tests/imports-page.test.ts tests/runtime-bootstrap.test.ts tests/ai-page.test.ts`：3 suites、47 tests passed。
- 全量：`npm test -- --runInBand`：29 suites、205 tests passed。
- 微信构建：`npm run build:wechat`：exit 0。
- `npm run typecheck`：exit 0。
- `git diff --check`：exit 0；`git diff --check fd2de0c..HEAD`：exit 0（均在最终文档提交后复核）。
- Windows-style clean clone：`D:\self\家庭手账APP-wechat-clean-clone-65ff5e8` 从代码/验收提交 `65ff5e8` freshly cloned，设置 `core.autocrlf=true`，`npm ci --ignore-scripts` 与 `npm run build:wechat` 均 exit 0；`git status --short` 为空；39 个 Git-tracked `*.js` 文件检查到 0 个 CR 字节。其后仅追加本报告证据提交。
