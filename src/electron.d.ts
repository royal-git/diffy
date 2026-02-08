export {};

declare global {
  interface Window {
    desktopBridge?: {
      pickRepository: () => Promise<string | null>;
      getRepositoryDiff: (repoPath: string, baseRef?: string | null, headRef?: string | null) => Promise<string>;
      getFilePreview: (request: {
        repoPath: string;
        baseRef?: string | null;
        headRef?: string | null;
        oldPath: string;
        newPath: string;
        fileType: 'markdown' | 'image';
        diffType: 'modified' | 'added' | 'deleted' | 'renamed';
      }) => Promise<
        | { kind: 'markdown'; left: string | null; right: string | null }
        | { kind: 'image'; left: { src: string; path: string } | null; right: { src: string; path: string } | null }
      >;
      getInitialRepository: () => Promise<{ repoPath: string | null; baseRef: string | null; headRef: string | null } | null>;
      getThemePreference: () => Promise<string | null>;
      setThemePreference: (theme: string) => Promise<boolean>;
      logEvent: (level: string, message: string, meta?: unknown) => Promise<boolean>;
    };
  }
}
