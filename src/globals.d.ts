declare var __blobDownloaderHook:
    { stop(): void; diagnostics(): import('./shared/contracts').HookDiagnostic } | undefined;
declare var __blobDownloaderBridge: { stop(): void } | undefined;
declare var __mediaObserver: { stop(): void; token?: string } | undefined;
declare var __mediaRuleObserver: { stop(): void; token?: string } | undefined;
