import { useEffect } from 'react';
import { getTopmostDialog } from '../utils/dialogKeyboard';
import { ViewMode } from '../types';

interface KeyboardShortcutsOptions {
  onToggleCommandPalette: () => void;
  onOpenNewReservation?: () => void;
  onNavigateView?: (view: ViewMode) => void;
  onGoToday?: () => void;
  isCommandPaletteOpen: boolean;
  enabled?: boolean;
}

/**
 * Custom hook to manage global keyboard shortcuts for the application.
 * - Ctrl+K / Cmd+K: Toggle the Global Command Palette
 * - '/': Open the Command Palette if not currently typing in an input
 * - Alt+N: Open new reservation modal
 * - Alt+1 / Alt+2 / Alt+3: Switch agenda presentation (Mes / Día / Lista)
 * - Alt+T: Jump to Today
 */
export function useKeyboardShortcuts({
  onToggleCommandPalette,
  onOpenNewReservation,
  onNavigateView,
  onGoToday,
  isCommandPaletteOpen,
  enabled = true
}: KeyboardShortcutsOptions) {
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (!enabled || e.defaultPrevented || e.repeat || e.isComposing || e.keyCode === 229) return;
      const topDialog = getTopmostDialog();
      const target = e.target instanceof HTMLElement ? e.target : null;
      const isEditing = Boolean(target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]') || target?.isContentEditable);
      // 1. Ctrl+K or Cmd+K
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        if (topDialog && topDialog.id !== 'global-command-palette') return;
        e.preventDefault();
        onToggleCommandPalette();
        return;
      }

      // 2. '/' to open spotlight when user isn't in an active text input or editable element
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isCommandPaletteOpen && !topDialog) {
        if (!isEditing) {
          e.preventDefault();
          onToggleCommandPalette();
          return;
        }
      }

      if (isEditing || topDialog || isCommandPaletteOpen) return;

      // 3. Alt+ shortcuts outside editors and dialogs
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        const keyLower = e.key.toLowerCase();
        if (keyLower === 'n' && onOpenNewReservation) {
          e.preventDefault();
          onOpenNewReservation();
          return;
        }
        if (keyLower === '1' && onNavigateView) {
          e.preventDefault();
          onNavigateView('calendar');
          return;
        }
        if (keyLower === '2' && onNavigateView) {
          e.preventDefault();
          onNavigateView('timeline');
          return;
        }
        if (keyLower === '3' && onNavigateView) {
          e.preventDefault();
          onNavigateView('mobile');
          return;
        }
        if (keyLower === 't' && onGoToday) {
          e.preventDefault();
          onGoToday();
          return;
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [onToggleCommandPalette, onOpenNewReservation, onNavigateView, onGoToday, isCommandPaletteOpen, enabled]);
}
