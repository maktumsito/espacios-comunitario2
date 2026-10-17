export interface BuildInfo {
  revision: string | null;
  dirty: boolean | null;
  sourceHash: string | null;
  builtAt: string | null;
}

declare const __APP_BUILD_INFO__: BuildInfo;

export const APP_BUILD_INFO: BuildInfo = typeof __APP_BUILD_INFO__ === 'undefined'
  ? { revision: null, dirty: null, sourceHash: null, builtAt: null }
  : __APP_BUILD_INFO__;
