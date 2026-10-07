import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Status messages remain visible and announced without adding another modal or scroll lock. */
export function NotificationPortal({ children }: { children: ReactNode }) {
  return createPortal(<div data-notification-layer="" style={{ position: 'relative', zIndex: 1000 }}>
    {children}
  </div>, document.body);
}
