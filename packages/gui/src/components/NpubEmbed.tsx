import { Component } from 'solid-js';
import { ProfileName } from './ProfileName';
import { getPubkey } from '../lib/nip19-parser';
import type { ParsedEntity } from '../lib/nip19-parser';

interface NpubEmbedProps {
  entity: ParsedEntity;
}

/**
 * Embed component for npub and nprofile references
 * Shows the profile name (from kind 0) and links to profile page
 */
export const NpubEmbed: Component<NpubEmbedProps> = (props) => {
  const pubkey = () => getPubkey(props.entity);

  if (!pubkey()) {
    return <span class="text-text-tertiary italic">@invalid-npub</span>;
  }

  return (
    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent/10 text-accent font-mono text-sm">
      @<ProfileName pubkey={pubkey()!} asLink={true} showAvatar={false} class="text-accent hover:underline" />
    </span>
  );
};
