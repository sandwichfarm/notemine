import { Component, Show } from 'solid-js';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmClass?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: Component<ConfirmDialogProps> = (props) => {
  return (
    <Show when={props.isOpen}>
      <div
        class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        onClick={props.onCancel}
      >
        <div
          class="card max-w-md w-full"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div class="border-b border-border p-4">
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-bold">{props.title}</h2>
              <button
                onClick={props.onCancel}
                class="text-text-secondary hover:text-text-primary transition-colors"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div class="p-4">
            <p class="text-text-secondary">{props.message}</p>
          </div>

          {/* Actions */}
          <div class="flex items-center justify-end gap-2 p-4 border-t border-border">
            <button
              onClick={props.onCancel}
              class="px-4 py-2 text-sm rounded bg-bg-tertiary text-text-primary hover:bg-bg-tertiary/80 transition-colors"
            >
              {props.cancelText || 'Cancel'}
            </button>
            <button
              onClick={props.onConfirm}
              class={props.confirmClass || 'px-4 py-2 text-sm rounded bg-red-500/20 text-red-500 hover:bg-red-500/30 transition-colors'}
            >
              {props.confirmText || 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
};
