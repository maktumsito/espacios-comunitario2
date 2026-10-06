// Some older forms still use a full-screen modal wrapper without an ARIA role.
// They must also block shortcuts and protect dialogs beneath them.
const dialogSelector = '[role="dialog"], [role="alertdialog"], .fixed.inset-0:not([aria-hidden="true"])';

function isVisible(element: HTMLElement): boolean {
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (node.hidden || node.hasAttribute('inert') || style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}

export function getTopmostDialog(): HTMLElement | null {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>(dialogSelector)).filter(isVisible);
  const leaves = dialogs.filter(dialog => !dialogs.some(other => other !== dialog && dialog.contains(other)));
  const layer = (dialog: HTMLElement) => {
    let outer = dialog;
    for (let parent = dialog.parentElement?.closest<HTMLElement>(dialogSelector); parent; parent = parent.parentElement?.closest<HTMLElement>(dialogSelector)) outer = parent;
    return Number.parseInt(getComputedStyle(outer).zIndex, 10) || 0;
  };
  return leaves.reduce<HTMLElement | null>((top, dialog) => !top || layer(dialog) >= layer(top) ? dialog : top, null);
}

export function isTopmostDialog(element: HTMLElement | null): boolean {
  return Boolean(element && element.closest(dialogSelector) === getTopmostDialog());
}

export function getDialogFocusables(element: HTMLElement): HTMLElement[] {
  return Array.from(element.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]'))
    .filter(node => node.tabIndex >= 0 && !node.matches(':disabled') && isVisible(node));
}

export function trapDialogTab(event: KeyboardEvent, element: HTMLElement): void {
  if (event.key !== 'Tab' || event.defaultPrevented || !isTopmostDialog(element)) return;
  const focusables = getDialogFocusables(element);
  const first = focusables[0], last = focusables[focusables.length - 1];
  if (!first) { event.preventDefault(); element.focus(); return; }
  const active = document.activeElement;
  if (!element.contains(active) || (event.shiftKey ? active === first : active === last)) {
    event.preventDefault(); (event.shiftKey ? last : first).focus();
  }
}
