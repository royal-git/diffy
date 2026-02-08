export {};

declare global {
  interface Window {
    desktopBridge?: {
      pickRepository: () => Promise<string | null>;
      getRepositoryDiff: (repoPath: string, baseRef?: string | null, headRef?: string | null) => Promise<string>;
      getInitialRepository: () => Promise<{ repoPath: string | null; baseRef: string | null; headRef: string | null } | null>;
      getThemePreference: () => Promise<string | null>;
      setThemePreference: (theme: string) => Promise<boolean>;
      logEvent: (level: string, message: string, meta?: unknown) => Promise<boolean>;
    };
  }
}
