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

## Round 3 imports final review fixes

### RED / GREEN 证据

- Selection revision：RED：`npm test -- --runInBand tests/imports-page.test.ts -t "stale image|stale CSV|stale parse"` 新增 3 项 deferred 测试后全部失败，旧 read/preview/parse 的 catch 或结果会改写新选择状态。GREEN：所有选择与 parse 在调用开始分配 revision；preview、CSV rows、statement classification 均先局部计算，success/catch/finally 只在 revision 仍当前时提交；当前 loading 不会被旧操作清除。
- Same-hash stage reuse：RED：`npm test -- --runInBand tests/imports-page.test.ts -t "same hash|completed hash"` 的 2 项测试失败，旧 `revision:fileHash` key 导致重复 stage/upload。GREEN：stage in-flight、staged cache、upload completion 均按 fileHash 共享；跨 revision pending 与已完成重选均各只调用一次 stage/upload，当前 caller 单独提交可见 UI。
- Duplicate keep-both：RED：`npm test -- --runInBand tests/imports-page.test.ts -t "duplicate keep-both"` 首次失败于页面未在 await 前渲染 loading。GREEN：按 revision/候选行的 in-flight guard、不可变 row/content snapshot、allowDuplicate confirm 和页面即时/最终 render 已覆盖；同一行双击只发一次，其他行可并行，失败后 guard 释放可重试。
- Retry preservation：实现期间全量 imports 回归发现 stage 成功但 upload 失败时 `stageResult` 被清空；随后补上 StageOutcome 的 retained result，保持缓存 draft、错误和后续 upload retry 语义，原有 failure→cached retry 与 reused 测试继续通过。

### Round 3 verification

- Code/tests commit：`7cac7ec` (`fix: harden import selection and duplicate races`)。
- Imports 聚焦：`npm test -- --runInBand tests/imports-page.test.ts`：1 suite、21 tests passed。
- 全量：`npm test -- --runInBand`：29 suites、212 tests passed。
- `npm run typecheck`：exit 0；`npm run build:wechat`：exit 0。
- `git diff --check`：exit 0；`git diff --check fd2de0c..HEAD`：exit 0（最终文档提交后复核）。
- Windows-style clean clone：`D:\self\家庭手账APP-wechat-clean-clone-7290665` 从提交 `7290665` freshly cloned，设置 `core.autocrlf=true`，`npm ci --ignore-scripts` 与 `npm run build:wechat` 均 exit 0；`git status --short` 为空；39 个 Git-tracked `*.js` 文件检查到 0 个 CR 字节。
- DevTools、真机、生产 API/VPS 仍保持 `未执行`；没有 push/deploy。

### Round 5 atomic descriptor timing follow-up

- RED：补充 deferred read 回归后，`npm test -- --runInBand tests/imports-page.test.ts -t "successful picker descriptor"` 失败：picker 已成功返回但可见 file 仍是旧 descriptor，直到额外 microtask 才替换。
- GREEN：接受当前 picker attempt 后同步递增 accepted revision，并在进入异步 read 前原子激活新 descriptor；旧 content、stage/upload binding、preview 和 reconciliation 状态先清除，read 失败仍只保留新 descriptor。
- Follow-up code/tests commit：`521782e` (`fix: atomically accept import descriptors`)。
- 聚焦：`npm test -- --runInBand tests/imports-page.test.ts`：1 suite、29 tests passed。
- Windows-style clean clone：`D:\self\家庭手账APP-wechat-clean-clone-521782e` 从 `521782e` freshly cloned，设置 `core.autocrlf=true`，`npm ci --ignore-scripts` 与 `npm run build:wechat` 均 exit 0；`git status --short` 为空；39 个 Git-tracked `*.js` 文件检查到 0 个 CR 字节。

## Round 4 imports final review fixes

### RED / GREEN 证据

- New descriptor binding：RED：旧图片已 stage/upload 后，新 descriptor 在 read 阶段失败时仍保留旧 file/content，`stage()` 可错误复用旧 upload；新增 deferred 回归先失败。GREEN：descriptor 返回后先原子替换可见 file 并清空 content、stage/upload/preview/rows/reconciliation/confirmed 状态；read 失败保留新 descriptor 但 stage 无 content 时返回 false、零网络调用，重试读入新 bytes 后只 stage/upload 新文件。
- Duplicate loading：RED：旧 revision keep-both 仍 pending 时，新 revision 成功完成会因全局 map 非空而保持 loading。GREEN：cleanup 只检查当前 revision 的 in-flight keys；旧 revision late success/failure 不改写当前 loading/error，当前 revision 多行仍保持 loading 至最后一行完成。
- Statement reset：新增测试验证新 statement descriptor 激活时 `confirmedMissingCount` 归零；聚焦测试通过。

### Round 4 verification

- Code/tests commit：`0de4f1c` (`fix: isolate new import descriptors and duplicate loading`)。
- Imports 聚焦：`npm test -- --runInBand tests/imports-page.test.ts`：1 suite、25 tests passed。
- 全量：`npm test -- --runInBand`：29 suites、216 tests passed。
- `npm run typecheck`：exit 0；`npm run build:wechat`：exit 0。
- `git diff --check`：exit 0；`git diff --check fd2de0c..HEAD`：exit 0（最终文档提交后复核）。
- Windows-style clean clone：`D:\self\家庭手账APP-wechat-clean-clone-d7f55d2` 从提交 `d7f55d2` freshly cloned，设置 `core.autocrlf=true`，`npm ci --ignore-scripts` 与 `npm run build:wechat` 均 exit 0；`git status --short` 为空；39 个 Git-tracked `*.js` 文件检查到 0 个 CR 字节。DevTools、真机、生产 API/VPS 仍保持 `未执行`。

## Round 5 imports picker-cancellation fixes

### RED / GREEN 证据

- Picker attempt ownership：RED：新增 deferred 回归后，`npm test -- --runInBand tests/imports-page.test.ts` 为 25 项通过、3 项失败；打开 statement picker 立即把 view/loading 改为 analyzing、accepted `selectionRevision` 递增，且取消中的新 picker 会干扰 pending keep-both。
- Picker attempt ownership：GREEN：picker invocation 只递增独立 `pickerAttempt`；只有当前 attempt 成功得到新 descriptor 后才开始 accepted selection/revision。旧 attempt 的迟到 success/cancel 被丢弃；recognized cancel 静默返回 false 并保留 file/content/view/loading/error/rows/counts/stage/duplicate state。keep-both 已完成后重复 resolve 不再重复 stage/confirm。

### Round 5 verification

- Code/tests commit：`c04d625` (`fix: preserve import state on picker cancellation`)。
- 聚焦：`npm test -- --runInBand tests/imports-page.test.ts`：1 suite、28 tests passed。
- 全量：`npm test -- --runInBand`：29 suites、219 tests passed。
- `npm run typecheck`：exit 0；`npm run build:wechat`：exit 0。
- `git diff --check fd2de0c..HEAD`：exit 0；最终文档提交后另复核 `git diff --check` 与同一 range-aware 命令。
- Windows-style clean clone：`D:\self\家庭手账APP-wechat-clean-clone-c04d625` 从 `c04d625` freshly cloned，设置 `core.autocrlf=true`，`npm ci --ignore-scripts` 与 `npm run build:wechat` 均 exit 0；`git status --short` 为空；39 个 Git-tracked `*.js` 文件检查到 0 个 CR 字节。
- DevTools、真机、生产 API/VPS 仍保持 `未执行`；没有 push/deploy。

## Post-review remediation 1: terminal keep-both and picker page rendering

### RED / GREEN 证据

- Terminal keep-both：RED：新增成功 keep-both → later → keep-both deferred/click regression 后，旧实现先处理 `later`，会把已确认的 keep-both 改成 later，并允许再次发起 stage/confirm。
- Terminal keep-both：GREEN：completed `keep-both` guard 在任一 action 分支前执行；已确认行对 later 与重复 keep-both 均返回 false，resolution、stage、confirm 均不变。
- Page rendering：RED：picker 返回新 descriptor、`readFile` deferred 时，page handler 只在整个选择/读取/preview 完成后 setData，无法即时展示新 file/loading/清空旧 stage。
- Page rendering：GREEN：model 在 accepted descriptor 激活后调用单次 `onAccepted` callback；四个 picker page handler 在 callback 中立即 `setData`，完成后再做 final render。取消不调用 callback，且无状态变化时不渲染。

### Verification

- Code/tests commit：`3d0db22` (`fix: finalize import confirmation and picker rendering`)。
- 聚焦：`npm test -- --runInBand tests/imports-page.test.ts`：1 suite、31 tests passed。
- 全量：`npm test -- --runInBand`：29 suites、222 tests passed。
- `npm run typecheck`：exit 0；`npm run build:wechat`：exit 0。
- `git diff --check fd2de0c..HEAD` 与 `git diff --check`：exit 0（最终文档提交后复核）。
- Windows-style clean clone：`D:\self\家庭手账APP-wechat-clean-clone-3d0db22` 从 `3d0db22` freshly cloned，设置 `core.autocrlf=true`，`npm ci --ignore-scripts` 与 `npm run build:wechat` 均 exit 0；`git status --short` 为空；39 个 Git-tracked `*.js` 文件检查到 0 个 CR 字节。
- DevTools、真机、生产 API/VPS 仍保持 `未执行`；没有 push/deploy。

## DevTools remediation 1: native header front-color casing

### RED / GREEN 证据

- RED：主题 runtime 回归将 dark navigation `frontColor` 精确改为 WeChat 允许值 `#ffffff` 后，`npm test -- --runInBand tests/theme-runtime.test.ts` 出现 2 项失败；实现仍发送 `#FFFFFF`，而 light `#000000` 已符合契约。
- GREEN：`ThemeRuntime` dark native header 改为 `#ffffff`，light 保持 `#000000`；新增回归同时断言两种 exact lowercase allowed values，并已重新生成 `src/shared/theme-runtime.js`。
- 父任务提供的现场观察：dark snapshot/page/tab 已工作，但原生 header 在旧构建中保持浅色；手动调用 `wx.setNavigationBarColor({ frontColor: '#ffffff' })` 即时修复。该观察支持修复方向，但本任务未重新编译/截图运行 DevTools，因此不提升 manual THEME/UI/DEVTOOLS 行状态。

### Verification

- Code/tests commit：`fc347ee` (`fix: use allowed native theme front colors`)。
- 聚焦：`npm test -- --runInBand tests/theme-runtime.test.ts tests/theme.test.ts tests/runtime-bootstrap.test.ts`：3 suites、19 tests passed。
- 全量：`npm test -- --runInBand`：29 suites、223 tests passed。
- `npm run typecheck`：exit 0；`npm run build:wechat`：exit 0。
- `git diff --check fd2de0c..HEAD` 与 `git diff --check`：exit 0（最终文档提交后复核）。
- Windows-style clean clone：`D:\self\家庭手账APP-wechat-clean-clone-fc347ee` 从 `fc347ee` freshly cloned，设置 `core.autocrlf=true`，`npm ci --ignore-scripts` 与 `npm run build:wechat` 均 exit 0；`git status --short` 为空；39 个 Git-tracked `*.js` 文件检查到 0 个 CR 字节。
- 生产/VPS、DevTools 当前重编译与真机截图仍未由本任务执行；没有 push/deploy。
