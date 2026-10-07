import React, { useId, useRef } from 'react';
import { X } from 'lucide-react';
import { isTopmostDialog } from '../../utils/dialogKeyboard';
import { ModalOverlay } from './ModalOverlay';

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
  const generatedId = useId();
  const titleId = `${id || generatedId}-title`;
  const descId = `${id || generatedId}-desc`;

  if (!isOpen) return null;

  const widthClass = MAX_WIDTH_MAP[maxWidth] || 'max-w-2xl';

  return (
    <ModalOverlay
      ref={modalRef}
      onClose={onClose}
      data-modal-kind={layer}
      id={id}
      role={role}
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={subtitle && descId ? descId : undefined}
      className={`fixed inset-0 flex items-center justify-center p-3 sm:p-4 overflow-y-auto`}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={() => { if (closeOnBackdrop && isTopmostDialog(modalRef.current)) onClose(); }}
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div
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
    </ModalOverlay>
  );
};
