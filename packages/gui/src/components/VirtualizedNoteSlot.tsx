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
  let currentVirtualized = props.isVirtualized;

  createEffect(() => {
    currentVirtualized = props.isVirtualized;
    if (!props.canVirtualize && currentVirtualized) {
      debug('[VirtualizedNoteSlot] forcing hydration for', props.eventId);
      props.onUnvirtualize();
      currentVirtualized = false;
    }
  });

  onMount(() => {
    if (typeof IntersectionObserver === 'undefined') return;

    observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;

        if (entry.isIntersecting) {
          if (currentVirtualized) {
            debug('[VirtualizedNoteSlot] rehydrating', props.eventId);
            props.onUnvirtualize();
            currentVirtualized = false;
          }
        } else {
          if (!props.canVirtualize) {
            return;
          }
          if (!currentVirtualized) {
            const measuredHeight = entry.boundingClientRect.height || containerRef?.offsetHeight || props.virtualHeight || 0;
            debug('[VirtualizedNoteSlot] virtualizing', props.eventId, measuredHeight);
            props.onVirtualize(Math.max(1, measuredHeight));
            currentVirtualized = true;
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
  });

  onCleanup(() => {
    observer?.disconnect();
    observer = null;
  });

  return (
    <div ref={containerRef} data-note-id={props.eventId}>
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
