"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPeriodBounds = getPeriodBounds;
const AUCKLAND = 'Pacific/Auckland';
function localDateParts(value) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: AUCKLAND,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(value);
    const read = (type) => { var _a; return Number((_a = parts.find((part) => part.type === type)) === null || _a === void 0 ? void 0 : _a.value); };
    return { year: read('year'), month: read('month'), day: read('day') };
}
function aucklandMidnightUtc(year, month, day) {
    const target = Date.UTC(year, month - 1, day);
    let guess = target;
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: AUCKLAND,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const parts = formatter.formatToParts(new Date(guess));
        const read = (type) => { var _a; return Number((_a = parts.find((part) => part.type === type)) === null || _a === void 0 ? void 0 : _a.value); };
        const observed = Date.UTC(read('year'), read('month') - 1, read('day'), read('hour'), read('minute'), read('second'));
        const next = target - (observed - guess);
        if (next === guess)
            return new Date(next);
        guess = next;
    }
    return new Date(guess);
}
function getPeriodBounds(value, kind) {
    if (Number.isNaN(value.valueOf()))
        throw new Error('date is invalid');
    const { year, month } = localDateParts(value);
    const startMonth = kind === 'year' ? 1 : kind === 'quarter' ? Math.floor((month - 1) / 3) * 3 + 1 : month;
    const endYear = kind === 'year' ? year + 1 : startMonth + (kind === 'quarter' ? 3 : 1) > 12 ? year + 1 : year;
    const endMonth = kind === 'year' ? 1 : ((startMonth + (kind === 'quarter' ? 3 : 1) - 1) % 12) + 1;
    return {
        from: aucklandMidnightUtc(year, startMonth, 1),
        to: aucklandMidnightUtc(endYear, endMonth, 1),
    };
}
