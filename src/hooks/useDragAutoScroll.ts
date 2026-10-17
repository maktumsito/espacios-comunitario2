import { useEffect, useRef, type RefObject } from 'react';

/** Native dragging needs its own continuous scroll loop near the viewport edges. */
export function useDragAutoScroll(ref: RefObject<HTMLDivElement | null>, active: boolean,
  onScroll: (x: number, y: number) => void) {
  const callback = useRef(onScroll);
  callback.current = onScroll;
  useEffect(() => {
    const element = ref.current;
    if (!active || !element) return;
    let point: { x: number; y: number } | null = null;
    let frame = 0;
    let previousTime = 0;
    const velocity = (position: number, start: number, end: number) => {
      const margin = Math.min(48, (end - start) / 3);
      if (position < start || position > end) return 0;
      if (position < start + margin) return -600 * (1 - (position - start) / margin);
      if (position > end - margin) return 600 * (1 - (end - position) / margin);
      return 0;
    };
    const tick = (time: number) => {
      frame = 0;
      if (!point) return;
      const rect = element.getBoundingClientRect();
      const seconds = Math.min(32, previousTime ? time - previousTime : 16) / 1000;
      previousTime = time;
      const left = element.scrollLeft, top = element.scrollTop;
      const horizontal = velocity(point.x, Math.max(0, rect.left), Math.min(window.innerWidth, rect.right));
      const vertical = velocity(point.y, Math.max(0, rect.top), Math.min(window.innerHeight, rect.bottom));
      if (!horizontal && !vertical) { previousTime = 0; return; }
      element.scrollLeft += horizontal * seconds;
      element.scrollTop += vertical * seconds;
      if (left !== element.scrollLeft || top !== element.scrollTop) {
        callback.current(point.x, point.y);
      }
      frame = requestAnimationFrame(tick);
    };
    const stop = () => { point = null; cancelAnimationFrame(frame); frame = 0; previousTime = 0; };
    const track = (event: DragEvent) => {
      point = { x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const leave = (event: DragEvent) => {
      if (element.contains(event.relatedTarget as Node | null)) return;
      const rect = element.getBoundingClientRect();
      // Native dragleave can fire when scrolling replaces the element below the cursor.
      if (event.clientX >= rect.left && event.clientX < rect.right && event.clientY >= rect.top && event.clientY < rect.bottom) return;
      stop();
    };
    element.addEventListener('dragover', track);
    element.addEventListener('dragleave', leave);
    window.addEventListener('drop', stop);
    window.addEventListener('dragend', stop);
    window.addEventListener('blur', stop);
    return () => {
      stop();
      element.removeEventListener('dragover', track);
      element.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', stop);
      window.removeEventListener('dragend', stop);
      window.removeEventListener('blur', stop);
    };
  }, [ref, active]);
}
