import { type ReactNode, useEffect, useRef, useState } from "react";

type StickyHorizontalScrollProps = {
  children: ReactNode;
  testId: string;
};

function StickyHorizontalScroll({ children, testId }: StickyHorizontalScrollProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const scrollbarRef = useRef<HTMLDivElement | null>(null);
  const syncingRef = useRef(false);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) {
      return undefined;
    }

    const updateWidth = () => {
      setScrollWidth(body.scrollWidth);
      setIsOverflowing(body.scrollWidth > body.clientWidth + 1);
    };

    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(body);
    if (body.firstElementChild) {
      observer.observe(body.firstElementChild);
    }

    return () => observer.disconnect();
  }, []);

  function syncScroll(source: HTMLDivElement, target: HTMLDivElement | null) {
    if (!target || syncingRef.current) {
      return;
    }

    syncingRef.current = true;
    target.scrollLeft = source.scrollLeft;
    window.requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  }

  return (
    <div
      className="sticky-horizontal-scroll-frame"
      data-sticky-horizontal-scroll="true"
      data-overflowing={isOverflowing ? "true" : "false"}
    >
      <div
        ref={bodyRef}
        className="sticky-horizontal-scroll-body overflow-x-auto"
        data-testid={testId}
        tabIndex={0}
        onScroll={(event) => syncScroll(event.currentTarget, scrollbarRef.current)}
      >
        {children}
      </div>
      <div
        className="sticky-horizontal-scrollbar-shell"
        aria-hidden="true"
        data-active={isOverflowing ? "true" : "false"}
      >
        <div
          ref={scrollbarRef}
          className="sticky-horizontal-scrollbar overflow-x-auto"
          onScroll={(event) => syncScroll(event.currentTarget, bodyRef.current)}
        >
          <div style={{ width: scrollWidth, height: 1 }} />
        </div>
      </div>
    </div>
  );
}

export default StickyHorizontalScroll;
