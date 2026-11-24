export type HookConfig =
    | { enabled: false }
    | {
          enabled: true;
          token: string;
          minimumBytes: number;
          maximumBytes: number;
          maxEncodedLength: number;
      };
export interface HookDiagnostic {
    attached: boolean;
    counters: Record<string, number>;
    lastSize: number | null;
}
export interface Attempt {
    id: number;
    mode: string;
    tabId: number;
    frameId: number;
    startedAt: string;
    state: string;
    url: string;
    sourcePage: string;
    filename: string;
    size: number | null;
    message: string;
    downloadId?: number;
    browserError?: string;
}
export interface Watch {
    token: string;
    minimumMiB: number;
    frames: Set<number>;
    count: number;
    attempts: number;
    pending: number;
    chain: Promise<unknown>;
    lastResult: string;
    diagnostics?: ({ frameId: number } & HookDiagnostic)[];
    diagnosticError?: string;
}
export interface MediaObservation {
    tag: string;
    url: string;
    currentSrc: string;
    type: string;
    reason: string;
    time: string;
    frameId?: number;
}
