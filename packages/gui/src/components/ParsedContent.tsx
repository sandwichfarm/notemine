import { Component, For } from 'solid-js';
import { parseContent } from '../lib/nip19-parser';
import { NpubEmbed } from './NpubEmbed';
import { NeventEmbed } from './NeventEmbed';
import { NaddrEmbed } from './NaddrEmbed';
import { ImageEmbed } from './ImageEmbed';
import { VideoEmbed } from './VideoEmbed';
import { YouTubeEmbed } from './YouTubeEmbed';

interface ParsedContentProps {
  content: string;
  /** Additional CSS classes for text segments */
  class?: string;
}

/**
 * Component to parse and render note content with embedded nostr: entities
 * Automatically finds and renders npub, nprofile, nevent, note, and naddr references
 */
export const ParsedContent: Component<ParsedContentProps> = (props) => {
  const segments = () => parseContent(props.content);

  return (
    <div class={props.class}>
      <For each={segments()}>
        {(segment) => {
          if (segment.type === 'text') {
            // Preserve line breaks and whitespace
            return <span class="whitespace-pre-wrap">{segment.content}</span>;
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
                return <NeventEmbed entity={entity} />;

              case 'naddr':
                return <NaddrEmbed entity={entity} />;

              case 'image':
                return <ImageEmbed url={entity.data.url} />;

              case 'video':
                return <VideoEmbed url={entity.data.url} />;

              case 'youtube':
                return <YouTubeEmbed videoId={entity.data.videoId} />;

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
