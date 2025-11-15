import { Component, JSX, Show, createEffect, onCleanup, onMount } from 'solid-js';
import { debug } from '../lib/debug';

interface VirtualizedNoteSlotProps {
  eventId: string;
  isVirtualized: boolean;
  virtualHeight?: number;
  onVirtualize: (height: number) => void;
  onUnvirtualize: () => void;
  canVirtualize: boolean;
  children: JSX.Element;
}

const VIRTUALIZATION_MARGIN_PX = 1800; // Distance from viewport before virtualizing

export const VirtualizedNoteSlot: Component<VirtualizedNoteSlotProps> = (props) => {
  let containerRef: HTMLDivElement | undefined;
  let observer: IntersectionObserver | null = null;
  let virtualizeTimer: number | null = null;
  let currentVirtualized = props.isVirtualized;
  let frameScheduled = false;

  const isWithinViewport = () => {
    if (!containerRef) return false;
    const rect = containerRef.getBoundingClientRect();
    return rect.bottom >= -200 && rect.top <= window.innerHeight + 200;
  };

  const forceRehydrateIfVisible = () => {
    if (!props.isVirtualized || !props.canVirtualize) return;
    if (!containerRef) return;
    const rect = containerRef.getBoundingClientRect();
    const placeholderHeight = rect.height;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const visiblePortion = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
    const visibilityRatio = placeholderHeight > 0 ? visiblePortion / placeholderHeight : 0;
    if (visibilityRatio < 0.25) return;
    if (isWithinViewport()) {
      cancelPendingVirtualize();
      if (currentVirtualized) {
        debug('[VirtualizedNoteSlot] forcing rehydrate (visibility check)', props.eventId);
        props.onUnvirtualize();
        currentVirtualized = false;
      }
    }
  };

  const cancelPendingVirtualize = () => {
    if (virtualizeTimer !== null) {
      clearTimeout(virtualizeTimer);
      virtualizeTimer = null;
    }
  };

  const scheduleVirtualize = (height: number) => {
    if (virtualizeTimer !== null) return;
    virtualizeTimer = window.setTimeout(() => {
      virtualizeTimer = null;
      if (!props.canVirtualize || currentVirtualized) return;
      debug('[VirtualizedNoteSlot] virtualizing', props.eventId, height);
      props.onVirtualize(Math.max(1, height));
      currentVirtualized = true;
    }, 120);
  };

  createEffect(() => {
    currentVirtualized = props.isVirtualized;
    if (!props.canVirtualize && currentVirtualized) {
      debug('[VirtualizedNoteSlot] forcing hydration for', props.eventId);
      props.onUnvirtualize();
      currentVirtualized = false;
    }
    if (!props.canVirtualize) {
      cancelPendingVirtualize();
    }
    // Only force rehydrate when we just transitioned from virtualized to real
    if (!props.isVirtualized && currentVirtualized) {
      queueMicrotask(() => forceRehydrateIfVisible());
    }
  });

  onMount(() => {
    if (typeof IntersectionObserver === 'undefined') return;

    observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;

        if (entry.isIntersecting) {
          cancelPendingVirtualize();
          if (currentVirtualized) {
            debug('[VirtualizedNoteSlot] rehydrating', props.eventId);
            props.onUnvirtualize();
            currentVirtualized = false;
          }
        } else {
          if (!props.canVirtualize) {
            cancelPendingVirtualize();
            return;
          }
          if (!currentVirtualized) {
            const measuredHeight = entry.boundingClientRect.height || containerRef?.offsetHeight || props.virtualHeight || 0;
            scheduleVirtualize(measuredHeight);
          }
        }
      },
      {
        root: null,
        rootMargin: `${VIRTUALIZATION_MARGIN_PX}px 0px`,
        threshold: 0,
      }
    );

    if (containerRef) {
      observer.observe(containerRef);
    }

    const scheduleCheck = () => {
      if (frameScheduled) return;
      frameScheduled = true;
      requestAnimationFrame(() => {
        frameScheduled = false;
        forceRehydrateIfVisible();
      });
    };

    window.addEventListener('scroll', scheduleCheck, { passive: true });
    window.addEventListener('resize', scheduleCheck);
    onCleanup(() => {
      window.removeEventListener('scroll', scheduleCheck);
      window.removeEventListener('resize', scheduleCheck);
    });
  });

  onCleanup(() => {
    observer?.disconnect();
    observer = null;
    cancelPendingVirtualize();
  });

  return (
    <div
      ref={containerRef}
      data-note-id={props.eventId}
    >
      <Show
        when={!props.isVirtualized || !props.canVirtualize}
        fallback={
          <div
            class="virtual-note-placeholder mb-10 border border-dashed border-[var(--border-color)] rounded-md bg-[var(--bg-secondary)]/50"
            style={{ height: `${props.virtualHeight ?? 0}px`, 'min-height': '80px' }}
          />
        }
      >
        {props.children}
      </Show>
    </div>
  );
};
