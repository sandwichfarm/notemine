/**
 * ProfilePowBadge Component
 * Displays a diamond badge showing profile PoW difficulty
 */

import { Component, Show } from 'solid-js';
import { getPowDifficultyFromId } from '../lib/pow';

export interface ProfilePowBadgeProps {
  /** Profile event (kind 0) to check PoW */
  profileEventId?: string;
  /** Optional: pre-computed difficulty */
  difficulty?: number;
  /** Display style: 'inline' (compact) or 'full' (with label) */
  style?: 'inline' | 'full';
}

export const ProfilePowBadge: Component<ProfilePowBadgeProps> = (props) => {
  // Compute difficulty (memoized)
  const difficulty = () => {
    if (props.difficulty !== undefined) {
      return props.difficulty;
    }
    if (props.profileEventId) {
      return getPowDifficultyFromId(props.profileEventId);
    }
    return 0;
  };

  // Only show if difficulty > 0
  const shouldShow = () => difficulty() > 0;

  // Choose display format based on style and difficulty
  const displayText = () => {
    const diff = difficulty();
    if (props.style === 'inline') {
      // Compact: just emoji + number
      return `💎 ${diff}`;
    }
    // Full: emoji + number + label
    return `💎 ${diff} bits`;
  };

  // Tooltip text
  const tooltipText = () => {
    return `Profile mined with ${difficulty()} bits PoW`;
  };

  return (
    <Show when={shouldShow()}>
      <span
        class="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400"
        title={tooltipText()}
      >
        {displayText()}
      </span>
    </Show>
  );
};
