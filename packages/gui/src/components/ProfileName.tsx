import { Component, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { nip19 } from 'nostr-tools';
import { useProfile } from '../hooks/useProfile';
import { getPubkeyPowDifficulty } from '../lib/pow';
import { ProfilePowBadge } from './ProfilePowBadge';

interface ProfileNameProps {
  pubkey: string;
  /** Show as link to profile page */
  asLink?: boolean;
  /** Show avatar image */
  showAvatar?: boolean;
  /** Additional CSS classes */
  class?: string;
}

/**
 * Component to display a user's name from their kind 0 metadata
 * Falls back to short npub if no name is set
 */
export const ProfileName: Component<ProfileNameProps> = (props) => {
  const profile = useProfile(props.pubkey);

  const displayName = () => {
    const prof = profile();
    if (prof.metadata?.display_name) return prof.metadata.display_name;
    if (prof.metadata?.name) return prof.metadata.name;

    // Fallback to short npub
    try {
      const npub = nip19.npubEncode(props.pubkey);
      return npub.slice(0, 12) + '...' + npub.slice(-4);
    } catch {
      return props.pubkey.slice(0, 8) + '...' + props.pubkey.slice(-4);
    }
  };

  const profileLink = () => {
    try {
      const npub = nip19.npubEncode(props.pubkey);
      return `/p/${npub}`;
    } catch {
      return `/p/${props.pubkey}`;
    }
  };

  const pubkeyPow = () => getPubkeyPowDifficulty(props.pubkey);
  const hasMindedPubkey = () => pubkeyPow() >= 3; // Show diamond for 3+ leading zeros

  // Get profile event ID for PoW badge
  const profileEventId = () => profile().event?.id;

  const content = () => (
    <span
      class={props.class || 'font-mono text-sm text-text-secondary'}
      classList={{
        'opacity-70': profile().loading,
      }}
    >
      <Show when={props.showAvatar && profile().metadata?.picture}>
        <img
          src={profile().metadata!.picture}
          alt=""
          class="inline w-5 h-5 rounded-full mr-1 object-cover"
        />
      </Show>
      {displayName()}
      <Show when={hasMindedPubkey()}>
        <span class="ml-1 text-accent" title={`Pubkey mined with ${pubkeyPow()} leading zeros`}>
          ◆
        </span>
      </Show>
      <Show when={profileEventId()}>
        <span class="ml-1">
          <ProfilePowBadge profileEventId={profileEventId()} style="inline" />
        </span>
      </Show>
    </span>
  );

  return (
    <Show when={props.asLink} fallback={content()}>
      <A href={profileLink()} class="hover:text-accent transition-colors">
        {content()}
      </A>
    </Show>
  );
};
