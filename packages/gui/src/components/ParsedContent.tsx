import { Component, For, createEffect, onCleanup } from 'solid-js';
import type { NostrEvent } from 'nostr-tools/core';
import { parseContent } from '../lib/content-parser';
import { useEmojiRegistry } from '../providers/EmojiProvider';
import { NpubEmbed } from './NpubEmbed';
import { NeventEmbed } from './NeventEmbed';
import { NaddrEmbed } from './NaddrEmbed';
import { ImageEmbed } from './ImageEmbed';
import { VideoEmbed } from './VideoEmbed';
import { YouTubeEmbed } from './YouTubeEmbed';
import { SpotifyEmbed } from './SpotifyEmbed';
import { GitHubEmbed } from './GitHubEmbed';
import { XEmbed } from './XEmbed';
import { FacebookEmbed } from './FacebookEmbed';
import { SubstackEmbed } from './SubstackEmbed';
import { MediumEmbed } from './MediumEmbed';
import { BasicLinkCard } from './BasicLinkCard';
import { PaymentQr } from './PaymentQr';

interface ParsedContentProps {
  content: string;
  /** Optional event to extract custom emoji tags from */
  event?: NostrEvent;
  /** Additional CSS classes for text segments */
  class?: string;
  /** Reserved heights for media items (keyed by media ID or URL) - Phase 2 */
  reservedHeights?: Record<string, number>;
  /** Recursion guard: current embed depth (default 0, max 3) */
  embedDepth?: number;
  /** Recursion guard: set of event IDs already in the embed chain to detect cycles */
  seenEventIds?: Set<string>;
}

/**
 * Render text with custom emoji support
 * Parses :shortcode: patterns and renders as images when emoji tags exist
 */
const RenderTextWithEmojis: Component<{ text: string; eventId?: string }> = (props) => {
  const { resolve } = useEmojiRegistry();

  // Parse text for :shortcode: patterns
  const parts = () => {
    const text = props.text;
    const regex = /:([a-zA-Z0-9_+-]+):/g;
    const parts: Array<{ type: 'text' | 'emoji'; content: string; emoji?: any }> = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      // Add text before the emoji
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
      }

      // Try to resolve the emoji with event context
      const shortcode = match[1];
      const emoji = resolve(shortcode, { eventId: props.eventId });

      if (emoji) {
        parts.push({ type: 'emoji', content: match[0], emoji });
      } else {
        // No emoji found, keep as literal text
        parts.push({ type: 'text', content: match[0] });
      }

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push({ type: 'text', content: text.slice(lastIndex) });
    }

    return parts;
  };

  return (
    <span class="whitespace-pre-wrap">
      <For each={parts()}>
        {(part) => {
          if (part.type === 'emoji' && part.emoji) {
            return (
              <img
                src={part.emoji.url}
                alt={part.emoji.alt || part.content}
                title={part.content}
                class="inline-block align-middle mx-0.5"
                style={{
                  width: part.emoji.w ? `${Math.min(part.emoji.w, 24)}px` : '20px',
                  height: part.emoji.h ? `${Math.min(part.emoji.h, 24)}px` : '20px',
                  'max-width': '24px',
                  'max-height': '24px',
                }}
              />
            );
          }
          return <>{part.content}</>;
        }}
      </For>
    </span>
  );
};

/**
 * Component to parse and render note content with embedded nostr: entities
 * Automatically finds and renders npub, nprofile, nevent, note, and naddr references
 * Supports NIP-30 custom emojis via :shortcode: syntax
 */
export const ParsedContent: Component<ParsedContentProps> = (props) => {
  const { registerEvent, unregisterEvent } = useEmojiRegistry();
  const segments = () => parseContent(props.content);

  // Recursion guards: initialize depth and seen set
  const currentDepth = props.embedDepth ?? 0;
  const seenIds = props.seenEventIds ?? new Set<string>();
  const MAX_EMBED_DEPTH = 3;

  // Add current event to seen set to prevent self-embedding
  const updatedSeenIds = new Set(seenIds);
  if (props.event?.id) {
    updatedSeenIds.add(props.event.id);
  }

  // Register event emoji tags when event changes
  createEffect(() => {
    if (props.event) {
      registerEvent(props.event.id, props.event);
    }
  });

  // Cleanup: unregister event emojis on unmount
  onCleanup(() => {
    if (props.event) {
      unregisterEvent(props.event.id);
    }
  });

  return (
    <div class={props.class}>
      <For each={segments()}>
        {(segment) => {
          if (segment.type === 'text') {
            // Render text with custom emoji support and event context
            return <RenderTextWithEmojis text={segment.content} eventId={props.event?.id} />;
          }

          if (segment.type === 'entity' && segment.entity) {
            const entity = segment.entity;

            // Render based on entity type
            switch (entity.type) {
              case 'npub':
              case 'nprofile':
                return <NpubEmbed entity={entity} />;

              case 'note':
              case 'nevent':
                // Recursion guard: check depth limit
                if (currentDepth >= MAX_EMBED_DEPTH) {
                  return <div class="text-xs text-gray-500 italic">[Embed depth limit reached]</div>;
                }
                return <NeventEmbed entity={entity} embedDepth={currentDepth + 1} seenEventIds={updatedSeenIds} />;

              case 'naddr':
                // Recursion guard: check depth limit
                if (currentDepth >= MAX_EMBED_DEPTH) {
                  return <div class="text-xs text-gray-500 italic">[Embed depth limit reached]</div>;
                }
                return <NaddrEmbed entity={entity} embedDepth={currentDepth + 1} seenEventIds={updatedSeenIds} />;

              case 'image': {
                // Lookup by URL (media IDs are now URLs for consistent lookup)
                const height = props.reservedHeights?.[entity.data.url];
                return <ImageEmbed url={entity.data.url} reservedHeight={height} />;
              }

              case 'video': {
                // Lookup by URL (media IDs are now URLs for consistent lookup)
                const height = props.reservedHeights?.[entity.data.url];
                return <VideoEmbed url={entity.data.url} reservedHeight={height} />;
              }

              case 'youtube': {
                const mediaId = `youtube-${entity.data.videoId}`;
                const height = props.reservedHeights?.[mediaId];
                return <YouTubeEmbed videoId={entity.data.videoId} reservedHeight={height} />;
              }

              case 'spotify': {
                const mediaId = `spotify-${entity.data.type}-${entity.data.id}`;
                const height = props.reservedHeights?.[mediaId];
                return <SpotifyEmbed type={entity.data.type} id={entity.data.id} reservedHeight={height} />;
              }

              case 'github':
                return <GitHubEmbed {...entity.data} />;

              case 'x':
                return <XEmbed {...entity.data} />;

              case 'facebook':
                return <FacebookEmbed {...entity.data} />;

              case 'substack':
                return <SubstackEmbed {...entity.data} />;

              case 'medium':
                return <MediumEmbed {...entity.data} />;

              case 'link':
                return <BasicLinkCard url={entity.data.url} />;

              case 'bitcoin':
                return <PaymentQr value={entity.data.value} label="Bitcoin Address" subtitle="Scan or copy to pay" />;

              case 'lightning':
                return <PaymentQr value={entity.data.value} label="Lightning Invoice" subtitle="Scan to pay via Lightning" />;

              case 'lnurl':
                return <PaymentQr value={entity.data.value} label="LNURL" subtitle="Lightning address" />;

              case 'cashu':
                return <PaymentQr value={entity.data.value} label="Cashu Token" subtitle="Redeem with a Cashu wallet" />;

              case 'nsec':
                // Don't render nsec (private key) - just show warning
                return (
                  <span class="inline-flex items-center px-2 py-0.5 rounded bg-red-500/10 text-red-500 text-sm font-mono">
                    ⚠️ private key (hidden for security)
                  </span>
                );

              default:
                // Unknown entity type - just render as text
                return <span class="text-text-tertiary italic">{segment.content}</span>;
            }
          }

          return null;
        }}
      </For>
    </div>
  );
};
