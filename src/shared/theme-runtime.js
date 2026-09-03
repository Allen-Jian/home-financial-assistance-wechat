"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThemeRuntime = exports.THEME_STORAGE_KEY = void 0;
exports.createWxThemeNative = createWxThemeNative;
const theme_1 = require("./theme");
exports.THEME_STORAGE_KEY = 'family-ledger.theme.v1';
function isResolvedTheme(value) {
    return value === 'light' || value === 'dark';
}
function isThemePreference(value) {
    return value === 'light' || value === 'dark' || value === 'system';
}
function createWxThemeNative() {
    const runtime = typeof wx === 'undefined' ? undefined : wx;
    return {
        getSystemTheme: () => {
            var _a;
            const theme = (_a = runtime === null || runtime === void 0 ? void 0 : runtime.getSystemInfoSync) === null || _a === void 0 ? void 0 : _a.call(runtime).theme;
            return isResolvedTheme(theme) ? theme : 'light';
        },
        onThemeChange: (listener) => { var _a; return (_a = runtime === null || runtime === void 0 ? void 0 : runtime.onThemeChange) === null || _a === void 0 ? void 0 : _a.call(runtime, listener); },
        offThemeChange: (listener) => { var _a; return (_a = runtime === null || runtime === void 0 ? void 0 : runtime.offThemeChange) === null || _a === void 0 ? void 0 : _a.call(runtime, listener); },
        setNavigationBarColor: (options) => { var _a; return (_a = runtime === null || runtime === void 0 ? void 0 : runtime.setNavigationBarColor) === null || _a === void 0 ? void 0 : _a.call(runtime, options); },
        setBackgroundColor: (options) => { var _a; return (_a = runtime === null || runtime === void 0 ? void 0 : runtime.setBackgroundColor) === null || _a === void 0 ? void 0 : _a.call(runtime, options); },
    };
}
class ThemeRuntime {
    constructor(storage, native = createWxThemeNative()) {
        var _a, _b;
        this.storage = storage;
        this.native = native;
        this.listeners = new Set();
        this.preference = this.readPreference();
        this.systemTheme = this.readSystemTheme();
        this.systemThemeListener = ({ theme }) => {
            if (this.preference !== 'system' || !isResolvedTheme(theme))
                return;
            this.systemTheme = theme;
            this.publish();
        };
        (_b = (_a = this.native).onThemeChange) === null || _b === void 0 ? void 0 : _b.call(_a, this.systemThemeListener);
        this.snapshot = this.publish();
    }
    getSnapshot() {
        return this.snapshot;
    }
    setPreference(value) {
        this.preference = isThemePreference(value) ? value : 'system';
        let persisted = true;
        try {
            this.storage.setStorageSync(exports.THEME_STORAGE_KEY, JSON.stringify(this.preference));
        }
        catch {
            persisted = false;
        }
        if (this.preference === 'system')
            this.systemTheme = this.readSystemTheme();
        return { persisted, snapshot: this.publish() };
    }
    subscribe(listener) {
        this.listeners.add(listener);
        try {
            listener(this.snapshot);
        }
        catch (error) {
            this.listeners.delete(listener);
            throw error;
        }
        return () => this.listeners.delete(listener);
    }
    dispose() {
        var _a, _b;
        (_b = (_a = this.native).offThemeChange) === null || _b === void 0 ? void 0 : _b.call(_a, this.systemThemeListener);
        this.listeners.clear();
    }
    readPreference() {
        try {
            const raw = this.storage.getStorageSync(exports.THEME_STORAGE_KEY);
            if (typeof raw !== 'string')
                return 'system';
            const parsed = JSON.parse(raw);
            return isThemePreference(parsed) ? parsed : 'system';
        }
        catch {
            return 'system';
        }
    }
    readSystemTheme() {
        try {
            const theme = this.native.getSystemTheme();
            return isResolvedTheme(theme) ? theme : 'light';
        }
        catch {
            return 'light';
        }
    }
    publish() {
        var _a, _b, _c, _d;
        const resolvedTheme = this.preference === 'system' ? this.systemTheme : this.preference;
        const tokens = resolvedTheme === 'dark' ? theme_1.DARK_TOKENS : theme_1.LIGHT_TOKENS;
        this.snapshot = {
            preference: this.preference,
            themePreference: this.preference,
            resolvedTheme,
            themeClass: `theme-${resolvedTheme}`,
            themeBackground: tokens.background,
            themePageStyle: `background-color: ${tokens.background};`,
            tokens,
        };
        try {
            (_b = (_a = this.native).setNavigationBarColor) === null || _b === void 0 ? void 0 : _b.call(_a, {
                frontColor: resolvedTheme === 'dark' ? '#ffffff' : '#000000',
                backgroundColor: tokens.background,
            });
        }
        catch {
            // Native color APIs are best-effort; page subscribers still receive the theme.
        }
        try {
            (_d = (_c = this.native).setBackgroundColor) === null || _d === void 0 ? void 0 : _d.call(_c, {
                backgroundColor: tokens.background,
                backgroundColorTop: tokens.background,
                backgroundColorBottom: tokens.background,
            });
        }
        catch {
            // Native color APIs are best-effort; page subscribers still receive the theme.
        }
        for (const listener of this.listeners) {
            try {
                listener(this.snapshot);
            }
            catch {
                // One page must not prevent other subscribers from receiving the theme.
            }
        }
        return this.snapshot;
    }
}
exports.ThemeRuntime = ThemeRuntime;
