"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionStore = exports.SESSION_STORAGE_KEY = void 0;
exports.SESSION_STORAGE_KEY = 'family-ledger.session.v1';
function isSession(value) {
    if (!value || typeof value !== 'object')
        return false;
    const candidate = value;
    return typeof candidate.accessToken === 'string'
        && typeof candidate.refreshToken === 'string'
        && typeof candidate.householdId === 'string'
        && candidate.accessToken.length > 0
        && candidate.refreshToken.length > 0
        && candidate.householdId.length > 0;
}
class SessionStore {
    constructor(storage) {
        this.storage = storage;
    }
    save(session) {
        this.storage.setStorageSync(exports.SESSION_STORAGE_KEY, JSON.stringify(session));
    }
    read() {
        const raw = this.storage.getStorageSync(exports.SESSION_STORAGE_KEY);
        if (typeof raw !== 'string')
            return null;
        try {
            const parsed = JSON.parse(raw);
            return isSession(parsed) ? parsed : null;
        }
        catch {
            return null;
        }
    }
    clear() {
        this.storage.removeStorageSync(exports.SESSION_STORAGE_KEY);
    }
}
exports.SessionStore = SessionStore;
