"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRecord = isRecord;
exports.isTokenPair = isTokenPair;
function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function isTokenPair(value) {
    if (!isRecord(value))
        return false;
    return typeof value.accessToken === 'string'
        && value.accessToken.length > 0
        && typeof value.refreshToken === 'string'
        && value.refreshToken.length > 0
        && typeof value.householdId === 'string'
        && value.householdId.length > 0;
}
