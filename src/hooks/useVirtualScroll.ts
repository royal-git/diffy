import { useState, useCallback, useRef, useEffect, useMemo } from 'react';

export interface VirtualScrollResult {
  visibleRange: { start: number; end: number };
  totalHeight: number;
  offsetY: number;
  containerRef: React.RefObject<HTMLDivElement>;
  scrollTo: (index: number) => void;
  scrollToTop: () => void;
}

const OVERSCAN = 15;

export function useVirtualScroll(
  itemCount: number,
  itemHeight: number,
): VirtualScrollResult {
  const containerRef = useRef<HTMLDivElement>(null!);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onScroll = () => {
      setScrollTop(el.scrollTop);
    };

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });

    el.addEventListener('scroll', onScroll, { passive: true });
    resizeObserver.observe(el);
    setContainerHeight(el.clientHeight);

    return () => {
      el.removeEventListener('scroll', onScroll);
      resizeObserver.disconnect();
    };
  }, []);

  const totalHeight = itemCount * itemHeight;

  const visibleRange = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - OVERSCAN);
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    const end = Math.min(itemCount, start + visibleCount + OVERSCAN * 2);
    return { start, end };
  }, [scrollTop, containerHeight, itemCount, itemHeight]);

  const offsetY = visibleRange.start * itemHeight;

  const scrollTo = useCallback((index: number) => {
    const el = containerRef.current;
    if (!el) return;
    const targetTop = index * itemHeight;
    const targetBottom = targetTop + itemHeight;
    const viewTop = el.scrollTop;
    const viewBottom = viewTop + el.clientHeight;

    if (targetTop < viewTop) {
      el.scrollTop = targetTop - el.clientHeight / 4;
    } else if (targetBottom > viewBottom) {
      el.scrollTop = targetBottom - el.clientHeight * 3 / 4;
    }
  }, [itemHeight]);

  const scrollToTop = useCallback(() => {
    containerRef.current?.scrollTo({ top: 0 });
  }, []);

  return { visibleRange, totalHeight, offsetY, containerRef, scrollTo, scrollToTop };
}
