"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReadCache = void 0;
const CACHE_PREFIX = 'family-ledger.read.v1.';
class ReadCache {
    constructor(storage, now = () => Date.now()) {
        this.storage = storage;
        this.now = now;
    }
    set(key, data) {
        this.storage.setStorageSync(`${CACHE_PREFIX}${key}`, JSON.stringify({ data, cachedAt: this.now() }));
    }
    read(key, maxAgeMs) {
        const raw = this.storage.getStorageSync(`${CACHE_PREFIX}${key}`);
        if (typeof raw !== 'string')
            return null;
        try {
            const value = JSON.parse(raw);
            if (typeof value.cachedAt !== 'number' || value.data === undefined)
                return null;
            if (value.cachedAt > this.now() || this.now() - value.cachedAt > maxAgeMs)
                return null;
            return { data: value.data, cachedAt: value.cachedAt };
        }
        catch {
            return null;
        }
    }
    clear(key) {
        this.storage.removeStorageSync(`${CACHE_PREFIX}${key}`);
    }
}
exports.ReadCache = ReadCache;
