export const BUILD_INFO = {
  version: '0.8.0',
  commit: (import.meta.env.VITE_GIT_COMMIT ?? 'local').slice(0, 7),
  buildTime: import.meta.env.VITE_BUILD_TIME ?? 'local'
};
