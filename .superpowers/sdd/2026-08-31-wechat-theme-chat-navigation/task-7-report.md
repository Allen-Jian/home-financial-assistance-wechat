# Task 7 Report

Status: complete

## Fix round 1 commits

- `cc22b48 feat: finalize sunlit ledger UI contracts` — captured the exact pre-existing Sunlit UI/API-contract dirty and untracked files in an explicit baseline commit; no `.superpowers/sdd` scratch files were included.
- `7283fa4 feat: add receipt image sources` — added the initial camera/album/chat-image sources and cancellation semantics.
- `b4a4189 fix: harden receipt image retries` — added the Task 7 fix round for offline gating, attachment retention, retries, and byte-signature MIME normalization.

## Implementation

- Added the `ImageSource` union, shared `chooseImage(source)` adapter, and robust `isPickerCancel(error)` handling for camera, album, and WeChat chat-image picker errors.
- Added `choosePhoto`, `chooseAlbum`, and `chooseChatImage` page actions. All successful selections are normalized to the existing `PhotoEntryFile`, read into bytes, and sent through the existing analyze → staged draft → manual confirmation flow.
- Preserved selected files on read, validation, upload, and AI failures so retry remains available; picker cancellation leaves the current draft/file state untouched.
- Added the camera-primary, equal-width album and chat-image secondary actions while leaving the PDF/CSV bill-file path unchanged.
- Regenerated `pages/entry/photo/index.js` from the TypeScript source.

## Verification

- RED: `npm test -- --runInBand tests/photo-entry.test.ts -t "album|chat image|cancel|three sources|recognizes|read failure"` failed because the new exports and page handlers were absent.
- GREEN: the focused Task 7 source/cancellation/read-failure tests passed; the `errMsg`-on-`Error` cancellation regression was also verified RED then GREEN.
- `npm test -- --runInBand tests/photo-entry.test.ts tests/entry-page.test.ts tests/imports-page.test.ts tests/imports-ai.test.ts` — PASS, 4 suites / 35 tests.
- `npm test -- --runInBand` — PASS, 29 suites / 176 tests.
- `npm run typecheck` — PASS.
- `npm run build:wechat` — PASS.
- `git diff --check` — PASS (only existing Windows LF/CRLF conversion warnings).

## Scope

- Task 7 implementation is limited to the photo-entry TypeScript/JavaScript/WXML/WXSS and its focused tests; existing user-owned dirty changes were preserved.
- WeChat DevTools/device picker permissions, camera/album behavior, and live API/deployment acceptance remain external checks.

## Fix round 1 implementation

- Added an injected online-status gate before image analysis, staging, attachment upload, and confirmation. Offline selection remains local, preserves the selected file/draft, performs zero API analysis/stage/upload/confirm calls, and can retry after connectivity returns.
- Tracked the staged file hash and content type so a failed original upload is retried against the existing draft before confirmation; confirmation never proceeds while that upload is unresolved.
- Added path rereading for preserved descriptors without bytes and remembered the last image source so a picker failure can be retried through the same picker action.
- Normalized image MIME from JPEG/PNG bytes after reading, allowing opaque temporary paths and rejecting unsupported signatures before AI analysis.

## Fix round 1 verification

- RED: production-port tests for offline gating, upload retention, reread/retry, picker retry, and byte-signature MIME normalization failed before the new constructor ports and behavior existed.
- GREEN: `npm test -- --runInBand tests/photo-entry.test.ts -t "offline|failed original upload|rereads|reopens|normalizes|opaque image"` — PASS, 7 tests.
- Final clean-HEAD verification after the fix commit: full Jest, typecheck, WeChat build, `git diff --check`, and clean `git status`.
