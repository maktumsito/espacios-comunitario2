import React, { ComponentType, LazyExoticComponent } from 'react';

/**
 * Resilient React.lazy wrapper that handles network interruptions,
 * server restarts, and stale module graph caches in Vite / modern bundlers.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  componentName?: string
): LazyExoticComponent<T> {
  return React.lazy(async () => {
    const storageKey = 'lazy_retry_reload_' + (componentName || 'chunk');
    // El almacenamiento bloqueado no debe impedir cargar una vista ni crear bucles de recarga.
    let alreadyReloaded: string | null = null;
    let canReadReloadFlag = true;
    try { alreadyReloaded = window.sessionStorage.getItem(storageKey); } catch { canReadReloadFlag = false; }
    const clearReloadFlag = () => {
      try { window.sessionStorage.removeItem(storageKey); } catch { /* La vista ya se cargó correctamente. */ }
    };
    const markReload = () => {
      if (!canReadReloadFlag) return false;
      try { window.sessionStorage.setItem(storageKey, 'true'); return true; }
      catch { return false; }
    };

    const extractComponent = (module: any): { default: T } => {
      if (!module) {
        throw new Error(`Module ${componentName || 'unknown'} loaded as empty`);
      }
      if (module.default) {
        return { default: module.default as T };
      }
      if (componentName && module[componentName]) {
        return { default: module[componentName] as T };
      }
      const firstExport = Object.values(module)[0];
      if (firstExport) {
        return { default: firstExport as T };
      }
      throw new Error(`Could not find component in module ${componentName || ''}`);
    };

    try {
      const module = await factory();
      clearReloadFlag();
      return extractComponent(module);
    } catch (primaryError: any) {
      console.warn(`[lazyWithRetry] Initial load failed for ${componentName || 'module'}:`, primaryError);

      try {
        await new Promise((resolve) => setTimeout(resolve, 600));
        const module = await factory();
        clearReloadFlag();
        return extractComponent(module);
      } catch (secondaryError: any) {
        console.warn(`[lazyWithRetry] Second attempt failed for ${componentName || 'module'}:`, secondaryError);

        try {
          await new Promise((resolve) => setTimeout(resolve, 1200));
          const module = await factory();
          clearReloadFlag();
          return extractComponent(module);
        } catch (finalError: any) {
          const isChunkError =
            finalError?.name === 'ChunkLoadError' ||
            /Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(
              finalError?.message || ''
            );

          if (isChunkError && !alreadyReloaded && markReload()) {
            console.warn(`[lazyWithRetry] Refreshing page to fetch updated chunks for ${componentName || 'module'}`);
            window.location.reload();
            return new Promise<never>(() => {});
          }

          throw finalError;
        }
      }
    }
  });
}
