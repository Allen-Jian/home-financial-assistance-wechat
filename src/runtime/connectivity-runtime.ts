export type ConnectivityState = 'unknown' | 'online' | 'offline';

export interface ConnectivityWxPort {
  getNetworkType(options: { success: (result: { networkType?: string }) => void; fail?: () => void }): void;
  onNetworkStatusChange?(listener: (result: { isConnected?: boolean; networkType?: string }) => void): void;
  offNetworkStatusChange?(listener: (result: { isConnected?: boolean; networkType?: string }) => void): void;
}

declare const wx: ConnectivityWxPort;

function currentWx(): ConnectivityWxPort | undefined {
  return typeof wx === 'undefined' ? undefined : wx;
}

export class ConnectivityRuntime {
  private state: ConnectivityState = 'unknown';
  private readonly wx: ConnectivityWxPort | undefined;
  private readonly listener: ((result: { isConnected?: boolean; networkType?: string }) => void) | undefined;
  private disposed = false;

  constructor(runtime: ConnectivityWxPort | undefined = currentWx()) {
    this.wx = runtime;
    if (!runtime) {
      this.state = 'offline';
      return;
    }
    this.listener = (result) => this.update(result);
    try { runtime.onNetworkStatusChange?.(this.listener); } catch { /* remain pessimistically offline */ }
    try {
      runtime.getNetworkType({
        success: (result) => this.update(result),
        fail: () => { this.state = 'offline'; },
      });
    } catch {
      this.state = 'offline';
    }
  }

  getStatus(): ConnectivityState { return this.state; }

  isOnline(): boolean { return !this.disposed && this.state === 'online'; }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.listener) {
      try { this.wx?.offNetworkStatusChange?.(this.listener); } catch { /* cleanup is best effort */ }
    }
  }

  private update(result: { isConnected?: boolean; networkType?: string }): void {
    if (this.disposed) return;
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
