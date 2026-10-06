import React, { useLayoutEffect, useRef, useState } from 'react';
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual';

const columnCount = () => window.innerWidth >= 1024 ? 4 : window.innerWidth >= 768 ? 3 : window.innerWidth >= 640 ? 2 : 1;

/** Row virtualization preserves the existing responsive reading order. */
export function VirtualCardGrid<T extends { id: string }>({ items, renderItem }: {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(columnCount);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const nodes = useRef(new Map<string, HTMLDivElement>());
  const focusedIndex = items.findIndex(item => item.id === focusedId);
  const virtualizer = useVirtualizer({
    count: Math.ceil(items.length / columns),
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 92,
    overscan: 1,
    gap: 10,
    getItemKey: row => `${columns}:${items[row * columns].id}`,
    rangeExtractor: range => {
      const rows = defaultRangeExtractor(range);
      if (focusedIndex >= 0) rows.push(Math.floor(focusedIndex / columns));
      return [...new Set(rows)].sort((a, b) => a - b);
    },
  });
  useLayoutEffect(() => {
    const resize = () => setColumns(columnCount());
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useLayoutEffect(() => { virtualizer.measure(); }, [columns, items, virtualizer]);
  useLayoutEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    const button = nodes.current.get(id)?.querySelector<HTMLButtonElement>('button');
    if (button) {
      pendingFocus.current = null;
      button.focus({ preventScroll: true });
    }
  });

  return (
    <div ref={scrollRef} className="overflow-y-auto pr-1" style={{ height: Math.min(240, virtualizer.getTotalSize()) }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map(row => (
          <div key={row.key} data-index={row.index} ref={virtualizer.measureElement}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${row.start}px)`, display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 10 }}>
            {items.slice(row.index * columns, (row.index + 1) * columns).map((item, offset) => (
              <div key={item.id} data-agenda-reservation-id={item.id}
                ref={node => { if (node) nodes.current.set(item.id, node); else nodes.current.delete(item.id); }}
                onFocusCapture={() => setFocusedId(item.id)}
                onBlurCapture={() => setFocusedId(current => current === item.id ? null : current)}
                onKeyDownCapture={event => {
                  if (event.key !== 'Tab') return;
                  const index = row.index * columns + offset + (event.shiftKey ? -1 : 1);
                  if (index < 0 || index >= items.length) return;
                  event.preventDefault();
                  pendingFocus.current = items[index].id;
                  setFocusedId(items[index].id);
                  virtualizer.scrollToIndex(Math.floor(index / columns), { align: 'auto' });
                }}>
                {renderItem(item)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
