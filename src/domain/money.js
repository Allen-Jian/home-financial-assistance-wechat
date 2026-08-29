"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatNzdMinor = formatNzdMinor;
exports.parseNzdMinor = parseNzdMinor;
function formatNzdMinor(minor) {
    if (!Number.isSafeInteger(minor))
        throw new Error('amount must be a safe integer');
    const sign = minor < 0 ? '-' : '';
    const absolute = Math.abs(minor);
    return `${sign}NZ$${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
}
function parseNzdMinor(input) {
    const value = input.trim();
    if (!/^-?\d+(?:\.\d{1,2})?$/.test(value))
        throw new Error('amount must be NZD with up to two decimals');
    const negative = value.startsWith('-');
    const unsigned = negative ? value.slice(1) : value;
    const [whole, fraction = ''] = unsigned.split('.');
    const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    if (!Number.isSafeInteger(minor))
        throw new Error('amount is too large');
    return negative ? -minor : minor;
}
