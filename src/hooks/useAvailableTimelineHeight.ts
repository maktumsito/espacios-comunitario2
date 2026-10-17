import { useLayoutEffect, type RefObject } from 'react';

/** Fit the timeline below its real toolbar position, including expanded controls. */
export function useAvailableTimelineHeight(ref: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const viewport = window.visualViewport;
      const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
      const bottomInset = window.innerWidth < 1024 ? 84 : 12;
      const legendHeight = element.nextElementSibling?.getBoundingClientRect().height ?? 0;
      const height = `${Math.max(200, Math.floor(bottom - element.getBoundingClientRect().top - bottomInset - legendHeight - 2))}px`;
      if (element.style.height !== height) element.style.height = height;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    const root = element.parentElement?.parentElement;
    if (root) observer?.observe(root);
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
    };
  }, [ref]);
}
