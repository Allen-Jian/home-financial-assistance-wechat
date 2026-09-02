"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectivityRuntime = void 0;
function currentWx() {
    return typeof wx === 'undefined' ? undefined : wx;
}
class ConnectivityRuntime {
    constructor(runtime = currentWx()) {
        var _a;
        this.state = 'unknown';
        this.disposed = false;
        this.eventSeen = false;
        this.generation = 0;
        this.wx = runtime;
        if (!runtime) {
            this.state = 'offline';
            return;
        }
        this.listener = (result) => {
            this.eventSeen = true;
            this.generation += 1;
            this.update(result);
        };
        try {
            (_a = runtime.onNetworkStatusChange) === null || _a === void 0 ? void 0 : _a.call(runtime, this.listener);
        }
        catch { /* remain pessimistically offline */ }
        try {
            const initialGeneration = this.generation;
            runtime.getNetworkType({
                success: (result) => {
                    if (this.disposed || this.eventSeen || this.generation !== initialGeneration)
                        return;
                    this.update(result);
                },
                fail: () => {
                    if (this.disposed || this.eventSeen || this.generation !== initialGeneration)
                        return;
                    this.state = 'offline';
                },
            });
        }
        catch {
            if (!this.disposed && !this.eventSeen)
                this.state = 'offline';
        }
    }
    getStatus() { return this.state; }
    isOnline() { return !this.disposed && this.state === 'online'; }
    dispose() {
        var _a, _b;
        if (this.disposed)
            return;
        this.disposed = true;
        this.generation += 1;
        if (this.listener) {
            try {
                (_b = (_a = this.wx) === null || _a === void 0 ? void 0 : _a.offNetworkStatusChange) === null || _b === void 0 ? void 0 : _b.call(_a, this.listener);
            }
            catch { /* cleanup is best effort */ }
        }
    }
    update(result) {
        if (this.disposed)
            return;
        if (result.networkType === 'none' || result.isConnected === false) {
            this.state = 'offline';
            return;
        }
        if (result.networkType && result.networkType !== 'none' || result.isConnected === true) {
            this.state = 'online';
            return;
        }
        this.state = 'offline';
    }
}
exports.ConnectivityRuntime = ConnectivityRuntime;
