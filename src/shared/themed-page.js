"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withThemePage = withThemePage;
function withThemePage(definition, theme) {
    const source = definition;
    const originalOnLoad = source.onLoad;
    const originalOnUnload = source.onUnload;
    const wrapped = {
        ...definition,
        data: { ...source.data, ...theme.getSnapshot() },
        onLoad(...args) {
            this.__offTheme = theme.subscribe((snapshot) => this.setData(snapshot));
            return originalOnLoad === null || originalOnLoad === void 0 ? void 0 : originalOnLoad.apply(this, args);
        },
        onUnload(...args) {
            var _a;
            try {
                return originalOnUnload === null || originalOnUnload === void 0 ? void 0 : originalOnUnload.apply(this, args);
            }
            finally {
                (_a = this.__offTheme) === null || _a === void 0 ? void 0 : _a.call(this);
                this.__offTheme = undefined;
            }
        },
    };
    return wrapped;
}
