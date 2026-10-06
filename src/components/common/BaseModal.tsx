import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { getDialogFocusables, isTopmostDialog, trapDialogTab } from '../../utils/dialogKeyboard';

export interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  customHeader?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | 'full';
  layer?: 'base' | 'nested' | 'alert';
  role?: 'dialog' | 'alertdialog';
  id?: string;
  closeOnBackdrop?: boolean;
  showCloseButton?: boolean;
  containerClassName?: string;
  bodyClassName?: string;
  headerClassName?: string;
  footerClassName?: string;
}

const MAX_WIDTH_MAP = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  full: 'max-w-[95vw]'
};

const Z_INDEX_MAP = {
  base: 'z-50',
  nested: 'z-[55]',
  alert: 'z-[60]'
};

export const BaseModal: React.FC<BaseModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  customHeader,
  children,
  footer,
  maxWidth = '2xl',
  layer = 'base',
  role = 'dialog',
  id,
  closeOnBackdrop = true,
  showCloseButton = true,
  containerClassName = '',
  bodyClassName = 'p-5 overflow-y-auto flex-1 text-slate-700',
  headerClassName = 'px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/70 shrink-0',
  footerClassName = 'px-5 py-3.5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0'
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const titleId = id ? `${id}-title` : 'modal-title';
  const descId = id ? `${id}-desc` : undefined;

  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  // 1. Esc Key listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !e.repeat && !e.isComposing && isTopmostDialog(modalRef.current)) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // 2. Body scroll lock & Save previous focused element
  useEffect(() => {
    if (!isOpen) return;

    previousActiveElementRef.current = document.activeElement as HTMLElement;

    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
      if (previousActiveElementRef.current?.isConnected && typeof previousActiveElementRef.current.focus === 'function') {
        previousActiveElementRef.current.focus();
        previousActiveElementRef.current = null;
      }
    };
  }, [isOpen]);

  // 3. Focus trap: Initial focus and Tab/Shift+Tab cycling
  useEffect(() => {
    if (!isOpen || !modalRef.current) return;

    const getFocusable = (): HTMLElement[] => {
      if (!modalRef.current) return [];
      return getDialogFocusables(modalRef.current);
    };

    const focusables = getFocusable();
    if (focusables.length > 0 && isTopmostDialog(modalRef.current)) {
      focusables[0]?.focus();
    }

    const handleTabKey = (e: KeyboardEvent) => {
      if (modalRef.current) trapDialogTab(e, modalRef.current);
    };

    window.addEventListener('keydown', handleTabKey);
    return () => window.removeEventListener('keydown', handleTabKey);
  }, [isOpen]);

  if (!isOpen) return null;

  const zClass = Z_INDEX_MAP[layer] || 'z-50';
  const widthClass = MAX_WIDTH_MAP[maxWidth] || 'max-w-2xl';

  return (
    <div
      id={id}
      role={role}
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={subtitle && descId ? descId : undefined}
      className={`fixed inset-0 ${zClass} flex items-center justify-center p-3 sm:p-4 overflow-y-auto`}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div
        ref={modalRef}
        tabIndex={-1}
        className={`relative w-full ${widthClass} bg-white rounded-2xl shadow-2xl border border-slate-200/80 overflow-hidden flex flex-col max-h-[90vh] my-auto z-10 animate-in fade-in zoom-in-95 duration-200 ${containerClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {customHeader ? (
          customHeader
        ) : (title || showCloseButton) ? (
          <header className={headerClassName}>
            <div className="flex items-center space-x-3 min-w-0">
              {icon && (
                <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 shrink-0 shadow-2xs">
                  {icon}
                </div>
              )}
              <div className="min-w-0">
                {title && (
                  <h3
                    id={titleId}
                    className="text-base sm:text-lg font-bold text-slate-900 truncate"
                  >
                    {title}
                  </h3>
                )}
                {subtitle && (
                  <p
                    id={descId}
                    className="text-xs text-slate-500 truncate mt-0.5"
                  >
                    {subtitle}
                  </p>
                )}
              </div>
            </div>

            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar modal"
                className="min-w-[44px] min-h-[44px] p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100/80 transition flex items-center justify-center cursor-pointer shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </header>
        ) : null}

        {/* Modal Body */}
        <div className={bodyClassName}>
          {children}
        </div>

        {/* Modal Footer */}
        {footer && (
          <footer className={footerClassName}>
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
};
