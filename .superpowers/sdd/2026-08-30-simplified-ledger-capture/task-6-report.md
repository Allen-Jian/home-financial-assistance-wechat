# Task 6 Report

Status: complete

## Implementation

- Repurposed the 更多 tab as 设置 and linked category management, initial asset, and term-deposit pages.
- Added category load/create/rename/active-lifecycle models; deactivation updates `active` and never deletes history.
- Added initial asset loading and audited save through `PATCH /accounts/primary/opening-balance` with `amountMinor` and the primary account `expectedVersion`.
- Added term-deposit metadata load/create/close flows; creation does not create transactions, and close sends `expectedVersion`.
- Added the corresponding API client methods, DTO contracts, page registrations, JSON configs, and generated JavaScript.
- Kept account creation and transfer controls out of settings UI.

## Verification

- RED: `npm test -- --runInBand tests/settings-pages.test.ts` initially failed because the settings model modules did not exist.
- `npm test -- --runInBand tests/settings-pages.test.ts` — PASS, 4 tests.
- `npm test -- --runInBand tests/theme.test.ts` — PASS, 1 test.
- `npm test -- --runInBand` — PASS, 24 suites / 71 tests.
- `npm run typecheck` — PASS.
- `npm run build:wechat` — PASS.
- `git diff --check` — PASS (Windows CRLF conversion warnings only).

## Scope

- Only the WeChat mini-program repository was changed; the API repository was not modified.
- Real WeChat DevTools/device, live API, and owner-permission acceptance were not run locally.

## Review follow-up

- Settings category loads now request `includeInactive=true`, so inactive categories remain visible after reload and can be re-enabled.
- Initial asset settings now accepts only the API's `systemKey=PRIMARY` account and never substitutes an arbitrary asset account.
- Added regression coverage for category deactivate/reload/reactivate, the inactive-category query, and missing PRIMARY behavior.
