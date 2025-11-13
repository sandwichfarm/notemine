/**
 * Note Placeholder Component
 * Renders a skeleton placeholder with reserved height to prevent layout shifts
 * Implements Phase 2: Stable Rendering
 */

import { Component, Show } from 'solid-js';
import type { MediaRef } from '../types/FeedTypes';

interface NotePlaceholderProps {
  /** Reserved height for this placeholder in pixels */
  height: number;

  /** Media type being loaded */
  mediaType?: 'image' | 'video' | 'embed' | 'text';

  /** Optional media reference for context */
  media?: MediaRef;

  /** Whether to show loading animation */
  animate?: boolean;

  /** Whether loading timed out */
  timedOut?: boolean;

  /** Callback when user clicks to retry */
  onRetry?: () => void;
}

/**
 * NotePlaceholder component
 * Displays a skeleton loader with reserved height to prevent layout jumps
 */
export const NotePlaceholder: Component<NotePlaceholderProps> = (props) => {
  const containerStyle = () => ({
    'min-height': `${props.height}px`,
    'height': `${props.height}px`,
    'width': '100%',
    'background': props.animate ? 'linear-gradient(90deg, #1a1a1a 25%, #2a2a2a 50%, #1a1a1a 75%)' : '#1a1a1a',
    'background-size': props.animate ? '200% 100%' : 'auto',
    'animation': props.animate ? 'shimmer 1.5s infinite' : 'none',
    'border-radius': '8px',
    'display': 'flex',
    'align-items': 'center',
    'justify-content': 'center',
    'color': '#666',
    'font-size': '14px',
    'position': 'relative' as const,
    'overflow': 'hidden',
  });

  const iconStyle = {
    'font-size': '32px',
    'opacity': '0.3',
  };

  const retryButtonStyle = {
    'margin-top': '8px',
    'padding': '6px 12px',
    'background': '#333',
    'border': '1px solid #555',
    'border-radius': '4px',
    'color': '#ccc',
    'cursor': 'pointer',
    'font-size': '12px',
  };

  return (
    <>
      <style>
        {`
          @keyframes shimmer {
            0% {
              background-position: -200% 0;
            }
            100% {
              background-position: 200% 0;
            }
          }
        `}
      </style>
      <div style={containerStyle()}>
        <div style={{ 'text-align': 'center' }}>
          <Show when={!props.timedOut}>
            <Show when={props.mediaType === 'image'}>
              <div style={iconStyle}>🖼️</div>
              <div>Loading image...</div>
            </Show>
            <Show when={props.mediaType === 'video'}>
              <div style={iconStyle}>🎥</div>
              <div>Loading video...</div>
            </Show>
            <Show when={props.mediaType === 'embed'}>
              <div style={iconStyle}>📎</div>
              <div>Loading embed...</div>
            </Show>
            <Show when={props.mediaType === 'text'}>
              <div style={iconStyle}>📝</div>
              <div>Loading content...</div>
            </Show>
          </Show>

          <Show when={props.timedOut}>
            <div style={iconStyle}>⚠️</div>
            <div>Media load timed out</div>
            <Show when={props.onRetry}>
              <button
                style={retryButtonStyle}
                onClick={() => props.onRetry?.()}
              >
                Retry
              </button>
            </Show>
          </Show>
        </div>
      </div>
    </>
  );
};

/**
 * MediaPlaceholder component
 * Specialized placeholder for media items with aspect ratio preservation
 */
interface MediaPlaceholderProps {
  /** Width in pixels or percentage */
  width?: number | string;

  /** Height in pixels */
  height: number;

  /** Aspect ratio (e.g., 16/9) */
  aspectRatio?: number;

  /** Media URL for context */
  url?: string;

  /** Whether to show loading state */
  loading?: boolean;

  /** Whether load failed */
  error?: boolean;

  /** Error message */
  errorMessage?: string;
}

export const MediaPlaceholder: Component<MediaPlaceholderProps> = (props) => {
  const containerStyle = () => {
    const baseStyle: Record<string, string> = {
      'min-height': `${props.height}px`,
      'height': `${props.height}px`,
      'background': '#1a1a1a',
      'border': '1px solid #333',
      'border-radius': '8px',
      'display': 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      'color': '#666',
      'position': 'relative',
      'overflow': 'hidden',
    };

    if (props.width) {
      baseStyle.width = typeof props.width === 'number' ? `${props.width}px` : props.width;
    } else {
      baseStyle.width = '100%';
    }

    if (props.aspectRatio) {
      baseStyle['aspect-ratio'] = `${props.aspectRatio}`;
    }

    return baseStyle;
  };

  return (
    <div style={containerStyle()}>
      <Show when={props.loading && !props.error}>
        <div>⏳ Loading...</div>
      </Show>
      <Show when={props.error}>
        <div style={{ 'text-align': 'center', 'padding': '16px' }}>
          <div style={{ 'font-size': '24px' }}>⚠️</div>
          <div style={{ 'margin-top': '8px' }}>
            {props.errorMessage || 'Failed to load media'}
          </div>
        </div>
      </Show>
    </div>
  );
};
