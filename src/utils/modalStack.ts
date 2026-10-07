import { getDialogFocusables, trapDialogTab } from './dialogKeyboard';

export const MODAL_BASE_Z_INDEX = 100;
let nextOrder = 0;
export function createModalOrder(): number { return ++nextOrder; }

interface ModalEntry {
  element: HTMLElement;
  order: number;
  previousFocus: HTMLElement | null;
  close: () => void;
}
const entries: ModalEntry[] = [];
const background = new Map<HTMLElement, string | null>();
let originalOverflow = '', originalPadding = '';
let returnFocus: HTMLElement | null = null;

function top(): ModalEntry | undefined { return entries.at(-1); }
function focusInside(entry: ModalEntry) {
  (getDialogFocusables(entry.element)[0] || entry.element).focus({ preventScroll: true });
}
function synchronize() {
  entries.sort((a, b) => a.order - b.order);
  entries.forEach((entry, index) => {
    const active = entry === top();
    entry.element.style.zIndex = String(MODAL_BASE_Z_INDEX + index);
    entry.element.toggleAttribute('inert', !active);
    entry.element.setAttribute('aria-modal', String(active));
    if (active) entry.element.removeAttribute('aria-hidden');
    else entry.element.setAttribute('aria-hidden', 'true');
  });
  // Portals are body siblings, so transformed views cannot clip or trap a dialog.
  for (const child of document.body.children) {
    if (!(child instanceof HTMLElement) || child.hasAttribute('data-modal-layer') || child.hasAttribute('data-notification-layer') || background.has(child)) continue;
    background.set(child, child.getAttribute('inert'));
    child.setAttribute('inert', '');
  }
}
function handleKey(event: KeyboardEvent) {
  const active = top();
  if (!active || event.defaultPrevented || event.isComposing) return;
  if (event.key === 'Escape' && !event.repeat) {
    event.preventDefault(); event.stopImmediatePropagation(); active.close();
  } else if (event.key === 'Tab') trapDialogTab(event, active.element);
}
function handleFocus(event: FocusEvent) {
  const active = top();
  if (active && event.target instanceof Node && !active.element.contains(event.target)) focusInside(active);
}

/** One lock and one keyboard owner for the complete stack, even with out-of-order closes. */
export function registerModal(entry: ModalEntry): () => void {
  if (!entries.length) {
    originalOverflow = document.body.style.overflow;
    originalPadding = document.body.style.paddingRight;
    returnFocus = entry.previousFocus;
    const width = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    const padding = Number.parseFloat(getComputedStyle(document.body).paddingRight) || 0;
    document.body.style.overflow = 'hidden';
    if (width) document.body.style.paddingRight = `${padding + width}px`;
    window.addEventListener('keydown', handleKey, true);
    document.addEventListener('focusin', handleFocus, true);
  }
  entries.push(entry);
  synchronize();
  if (top() === entry && !entry.element.contains(document.activeElement)) focusInside(entry);
  return () => {
    const wasTop = top() === entry;
    const index = entries.indexOf(entry);
    if (index < 0) return;
    entries.splice(index, 1);
    if (entries.length) {
      synchronize();
      if (wasTop) {
        const active = top()!;
        if (entry.previousFocus?.isConnected && active.element.contains(entry.previousFocus)) entry.previousFocus.focus({ preventScroll: true });
        else focusInside(active);
      }
    } else {
      window.removeEventListener('keydown', handleKey, true);
      document.removeEventListener('focusin', handleFocus, true);
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPadding;
      background.forEach((value, element) => {
        if (value === null) element.removeAttribute('inert'); else element.setAttribute('inert', value);
      });
      background.clear();
      const target = entry.previousFocus?.isConnected && !entry.previousFocus.closest('[data-modal-layer]') ? entry.previousFocus : returnFocus;
      if (target?.isConnected) target.focus({ preventScroll: true });
      returnFocus = null;
    }
  };
}
