import { useEffect } from 'react';
import { getTopmostDialog } from '../utils/dialogKeyboard';

interface KeyboardShortcutsOptions {
  onToggleCommandPalette: () => void;
  onOpenNewReservation?: () => void;
  isCommandPaletteOpen: boolean;
  enabled?: boolean;
}

/**
 * Custom hook to manage global keyboard shortcuts for the application.
 * - Ctrl+K / Cmd+K: Toggle the Global Command Palette
 * - '/': Open the Command Palette if not currently typing in an input
 */
export function useKeyboardShortcuts({
  onToggleCommandPalette,
  onOpenNewReservation,
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

      // 3. Alt+N, only outside editors and dialogs.
      if (
        (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.key.toLowerCase() === 'n') &&
        !isEditing && !topDialog && !isCommandPaletteOpen &&
        onOpenNewReservation
      ) {
        e.preventDefault();
        onOpenNewReservation();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [onToggleCommandPalette, onOpenNewReservation, isCommandPaletteOpen, enabled]);
}
