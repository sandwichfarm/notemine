/**
 * New Notes Bar Component
 * Shows when new notes arrive while user is scrolled down
 * Phase 3: Static Ordering & UX
 */

import { Component, Show } from 'solid-js';

interface NewNotesBarProps {
  /** Number of pending notes */
  count: number;
  /** Callback when user clicks to load new notes */
  onLoadNew: () => void;
  /** Whether the bar is visible */
  visible: boolean;
}

export const NewNotesBar: Component<NewNotesBarProps> = (props) => {
  return (
    <Show when={props.visible && props.count > 0}>
      <div class="sticky top-0 z-10 mb-4">
        <button
          onClick={props.onLoadNew}
          class="w-full py-3 px-4 bg-accent text-white rounded-lg shadow-lg hover:bg-accent/90 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
          style={{
            animation: "slideDown 0.3s ease-out",
          }}
        >
          <div class="flex items-center justify-center gap-2">
            <span class="text-lg">⬆️</span>
            <span class="font-medium">
              {props.count === 1
                ? "1 new note"
                : `${props.count} new notes`}
            </span>
            <span class="text-sm opacity-80">• Click to load</span>
          </div>
        </button>
      </div>

      <style>
        {`
          @keyframes slideDown {
            from {
              transform: translateY(-100%);
              opacity: 0;
            }
            to {
              transform: translateY(0);
              opacity: 1;
            }
          }
        `}
      </style>
    </Show>
  );
};
