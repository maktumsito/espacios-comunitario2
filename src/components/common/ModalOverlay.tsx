import { forwardRef, useId, useLayoutEffect, useRef, useState, type HTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { createModalOrder, registerModal } from '../../utils/modalStack';
import { isTopmostDialog } from '../../utils/dialogKeyboard';

interface ModalOverlayProps extends HTMLAttributes<HTMLDivElement> {
  onClose: () => void;
  closeOnBackdrop?: boolean;
}

/** Shared behavior for custom modal layouts and BaseModal. Mount only while open. */
export const ModalOverlay = forwardRef<HTMLDivElement, ModalOverlayProps>(function ModalOverlay(
  { onClose, closeOnBackdrop = false, onClick, children, style, ...props }, forwardedRef,
) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const id = useId();
  const [entry] = useState(() => ({ order: createModalOrder(), previousFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null }));
  useLayoutEffect(() => {
    const element = ref.current!;
    // Existing titles provide an accessible name without imposing a new layout.
    if (!element.hasAttribute('aria-label') && !element.hasAttribute('aria-labelledby')) {
      const heading = element.querySelector<HTMLElement>('h1, h2, h3, h4');
      if (heading) { heading.id ||= `${id}-heading`; element.setAttribute('aria-labelledby', heading.id); }
      else element.setAttribute('aria-label', 'Ventana de la aplicación');
    }
    return registerModal({ ...entry, element, close: () => closeRef.current() });
  }, [entry, id]);
  return createPortal(<div {...props} ref={element => {
    ref.current = element;
    if (typeof forwardedRef === 'function') forwardedRef(element);
    else if (forwardedRef) forwardedRef.current = element;
  }} role={props.role || 'dialog'} aria-modal="true" tabIndex={-1} data-modal-layer=""
    style={style} onClick={event => {
      // Portal events still bubble through React ancestors; do not close a parent backdrop.
      event.stopPropagation();
      if (!isTopmostDialog(ref.current)) return;
      onClick?.(event);
      if (closeOnBackdrop && event.target === event.currentTarget) closeRef.current();
    }}>{children}</div>, document.body);
});
