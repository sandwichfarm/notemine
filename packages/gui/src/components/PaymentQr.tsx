import { Component, Show } from 'solid-js';
import { QRCodeSVG } from 'solid-qr-code';

interface PaymentQrProps {
  value: string;
  label: string;
  subtitle?: string;
}

export const PaymentQr: Component<PaymentQrProps> = (props) => {
  return (
    <div class="my-3 p-4 border border-[var(--border-color)] rounded-lg bg-[var(--bg-secondary)] space-y-2">
      <div class="text-sm font-semibold text-text-primary">{props.label}</div>
      <Show
        when={props.subtitle}
        fallback={<p class="text-xs text-text-tertiary break-all">{props.value}</p>}
      >
        <p class="text-xs text-text-tertiary">{props.subtitle}</p>
        <p class="text-xs text-text-secondary break-all">{props.value}</p>
      </Show>
      <div class="flex justify-center pt-2">
        <div class="rounded bg-white p-2">
          <QRCodeSVG
            value={props.value}
            width={160}
            height={160}
            level={'M' as any}
            backgroundColor="#ffffff"
            backgroundAlpha={1}
            foregroundColor="#000000"
            foregroundAlpha={1}
          />
        </div>
      </div>
    </div>
  );
};
