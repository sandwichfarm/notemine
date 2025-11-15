import { Component, Show, createMemo, createSignal } from 'solid-js';
import { useFollows } from '../providers/FollowsProvider';
import { useUser } from '../providers/UserProvider';

interface FollowButtonProps {
  pubkey?: string;
  size?: 'xs' | 'sm' | 'md';
  variant?: 'solid' | 'ghost';
  class?: string;
  hideIfSelf?: boolean;
}

const sizeClasses: Record<NonNullable<FollowButtonProps['size']>, string> = {
  xs: 'text-[10px] px-2 py-0.5',
  sm: 'text-xs px-2.5 py-1',
  md: 'text-sm px-3 py-1.5',
};

export const FollowButton: Component<FollowButtonProps> = (props) => {
  const { isFollowing, toggleFollow, isUpdating, canFollow } = useFollows();
  const { user } = useUser();
  const [hovered, setHovered] = createSignal(false);

  const targetPubkey = () => props.pubkey || '';
  const currentUser = () => user();
  const hideIfSelf = props.hideIfSelf ?? true;

  const shouldRender = createMemo(() => {
    if (!targetPubkey()) return false;
    if (!canFollow()) return false;
    if (!currentUser()) return false;
    if (hideIfSelf && currentUser()!.pubkey === targetPubkey()) return false;
    return true;
  });

  const following = () => (targetPubkey() ? isFollowing(targetPubkey()) : false);
  const pending = () => (targetPubkey() ? isUpdating(targetPubkey()) : false);

  const handleClick = async (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!targetPubkey() || pending()) return;
    try {
      await toggleFollow(targetPubkey(), !following());
    } catch (err) {
      console.error('[FollowButton] Failed to toggle follow:', err);
    }
  };

  const colorClasses = () => {
    const variant = props.variant || 'solid';

    if (following()) {
      if (hovered()) {
        return 'bg-red-500/20 text-red-400 border border-red-400/50';
      }
      if (variant === 'ghost') {
        return 'bg-accent/10 text-accent border border-accent/30';
      }
      return 'bg-accent/20 text-accent border border-accent/30';
    }

    if (hovered()) {
      if (variant === 'ghost') {
        return 'bg-purple-500/20 text-purple-200 border border-purple-400/40';
      }
      return 'bg-purple-600 text-white border border-purple-500 shadow';
    }

    if (variant === 'ghost') {
      return 'bg-transparent text-text-tertiary border border-text-tertiary/30';
    }
    return 'bg-accent text-bg-primary border border-transparent';
  };

  const baseClass = () =>
    [
      'rounded-full font-medium transition-all duration-150 flex items-center gap-1',
      sizeClasses[props.size || 'sm'],
      colorClasses(),
      pending() ? 'opacity-60 cursor-wait' : 'hover:scale-105',
      props.class,
    ]
      .filter(Boolean)
      .join(' ');

  const label = () => {
    if (pending()) return '...';
    if (following()) {
      return hovered() ? 'Unfollow' : 'Following';
    }
    return 'Follow';
  };

  return (
    <Show when={shouldRender()}>
      <button
        type="button"
        class={baseClass()}
        disabled={pending()}
        aria-pressed={following()}
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {label()}
      </button>
    </Show>
  );
};
