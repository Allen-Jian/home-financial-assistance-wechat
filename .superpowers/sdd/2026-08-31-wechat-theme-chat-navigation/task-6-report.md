# Task 6 Report

Status: complete

## Implementation

- Added `calculateChatInsets()` and page state for keyboard height, measured composer height, composer bottom, list bottom inset, and the `chat-end` scroll target.
- Kept the composer above the 112rpx custom tab bar and safe-area fallback when the keyboard is closed; when open, its bottom follows keyboard height plus an 8px gap.
- Added idempotent keyboard-height listener registration in `onShow`, with reset and unbind behavior in `onHide` and `onUnload`.
- Measured composer geometry after input/line changes and keyboard changes so multi-line input updates list clearance.
- Added `auto-height`, `adjust-position="{{false}}"`, dynamic composer/list insets, and a stable `chat-end` anchor. History hydration, user/AI/error updates, deletion, keyboard changes, and composer size changes retarget the anchor after `wx.nextTick`.
- Preserved the read-only AI model, offline guard, error handling, storage behavior, and existing user changes outside Task 6.

## Verification

- RED: `npm test -- tests/ai-page.test.ts -t "keyboard|composer and list insets|stable chat end"` failed because `calculateChatInsets`, keyboard state, and lifecycle handlers were absent.
- GREEN: the focused keyboard/inset/anchor tests passed after the minimal implementation and generated JS update.
- `npm test -- tests/ai-page.test.ts tests/ai-security.test.ts` — PASS, 2 suites / 16 tests.
- `npm test -- --runInBand` — PASS, 29 suites / 159 tests.
- `npm run typecheck` — PASS.
- `npm run build:wechat` — PASS.
- `git diff --check` — PASS (existing Windows LF/CRLF warnings only).

## Scope

- Task 6 changes are limited to `pages/ai/index.ts`, `pages/ai/index.js`, `pages/ai/index.wxml`, `pages/ai/index.wxss`, and the focused AI page tests.
- WeChat DevTools/device keyboard behavior and live API/production acceptance remain external checks.

## Review round 1 correction

- Replaced the hardcoded 64px tab assumption with `112 * windowWidth / 750`; safe-area conversion uses `max(0, screenHeight - safeArea.bottom)` when `safeArea.bottom` is the platform coordinate.
- Applied viewport metrics and cached-history scrolling synchronously on the first `onShow` before awaiting remote hydration; remote history is applied and scrolled again only when the lifecycle generation remains active.
- Added lifecycle generation guards to keyboard events, selector measurements, and queued `nextTick` callbacks so hidden/unloaded pages receive no stale updates. Repeated `onShow` keeps one keyboard listener while the listener follows the current generation.
- Bounded the AI root at `100vh` with `min-height: 0`/`overflow: hidden`, made the chat scroll view the sole flex-bounded viewport, and removed the AI root bottom reserve so calculated list inset is the single tab/safe-area clearance source.
- Added regression coverage for queued callbacks, deferred hydration, accurate width fixtures, initial metrics, keyboard height zero, real page send transitions, WXML attributes, and CSS layout constraints.
- Review-round verification: `npm test -- --runInBand` — PASS, 29 suites / 163 tests; `npm run typecheck` — PASS; `npm run build:wechat` — PASS; `git diff --check` — PASS.
