# Task 7 Report

Status: complete

## Implementation

- Repurposed the 账目 tab into a read-only period transaction list with Auckland month/year bounds, custom date ranges, formatted amounts, and an in-page read-only detail panel.
- Added `LedgerListPageModel.load(period)` and `setPeriod(mode, from?, to?)`, including custom range state and safe transaction selection.
- Added `ApiClient.fetchTransactions(period)` and the transaction-list API port without changing the API repository.
- Extended dashboard summary handling with total assets, initial assets, and term-deposit allocation displays while preserving net worth, income, expense, and pending-work fields.
- Kept account and transfer controls out of the 账目 tab UI; generated JavaScript was refreshed through the WeChat build.

## Verification

- RED: `npm test -- --runInBand tests/ledger-list.test.ts tests/dashboard-page.test.ts` initially failed because `LedgerListPageModel` and the new dashboard contract fields were absent.
- `npm test -- --runInBand tests/ledger-list.test.ts tests/dashboard-page.test.ts tests/api-client.test.ts tests/money-period.test.ts` — PASS, 4 suites / 17 tests.
- `npm test -- --runInBand` — PASS, 25 suites / 77 tests.
- `npm run typecheck` — PASS.
- `npm run build:wechat` — PASS.
- `git diff --check` — PASS (only existing Windows LF/CRLF conversion warnings from Git).

## Scope

- Only the WeChat mini-program repository was changed; the API repository was not modified.
- Real WeChat DevTools/device, live API, and external deployment acceptance were not run locally.

## Privacy review remediation (2026-08-30)

- Added a per-model request generation guard for dashboard summary, dashboard insights, and ledger loads. Stale success, failure, and `finally` paths now leave newer household state and loading untouched; household mismatch cleanup remains active only for the current generation.
- Expanded dashboard cleanup to reset summary, account/category data, all count/display fields, cache markers, insights, and errors. Expanded ledger cleanup to reset the selected transaction, selected amount/date/direction displays, and errors.
- Added regression coverage for late dashboard/insights/ledger responses, loading protection, and complete private-state cleanup.

## Verification output

- `npm test -- --runInBand tests/ledger-list.test.ts tests/dashboard-page.test.ts` — PASS, 2 suites / 15 tests.
- `npm test -- --runInBand` — PASS, 25 suites / 86 tests.
- `npm run build:wechat` — PASS, `tsc -p tsconfig.miniprogram.json` exit code 0.
- `npm run typecheck` — PASS, `tsc --noEmit` exit code 0.
- `git diff --check` — PASS, exit code 0. Git emitted only existing LF/CRLF conversion warnings.
