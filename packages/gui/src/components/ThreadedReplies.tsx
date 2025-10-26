import { Component, For, Show, createSignal, createMemo } from 'solid-js';
import type { NostrEvent } from 'nostr-tools/core';
import { getPowDifficulty } from '../lib/pow';
import { ProfileName } from './ProfileName';

interface ThreadedRepliesProps {
  replies: NostrEvent[];
  rootEventId: string;
}

interface ReplyNode {
  event: NostrEvent;
  children: ReplyNode[];
  depth: number;
}

const ThreadedReply: Component<{
  node: ReplyNode;
  depth: number;
}> = (props) => {
  const [collapsed, setCollapsed] = createSignal(props.depth >= 2);

  // Removed shortPubkey - now using ProfileName component

  const timestamp = () => {
    const date = new Date(props.node.event.created_at * 1000);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return `${seconds}s ago`;
  };

  const powDifficulty = () => getPowDifficulty(props.node.event);
  return (
    <div class="border-l-2 border-border/30 pl-3 py-2" style={{ 'margin-left': `${props.depth * 1}rem` }}>
      {/* Reply Header */}
      <div class="flex items-start justify-between mb-2">
        <div class="flex items-center gap-2 flex-1 min-w-0">
          <ProfileName pubkey={props.node.event.pubkey} asLink={true} class="font-mono text-xs text-text-secondary" />
          <div class="text-xs text-text-tertiary">{timestamp()}</div>
          <Show when={powDifficulty() > 0}>
            <span class="text-xs font-mono text-accent">
              ⛏️ {powDifficulty()}
            </span>
          </Show>
        </div>

        {/* Collapse/Expand Button */}
        <Show when={props.node.children.length > 0}>
          <button
            onClick={() => setCollapsed(!collapsed())}
            class="text-xs text-text-tertiary hover:text-accent transition-colors"
          >
            {collapsed() ? `[+${props.node.children.length}]` : '[-]'}
          </button>
        </Show>
      </div>

      {/* Reply Content */}
      <Show when={!collapsed()}>
        <div class="text-sm text-text-primary whitespace-pre-wrap break-words mb-2">
          {props.node.event.content}
        </div>

        {/* Child Replies */}
        <Show when={props.node.children.length > 0}>
          <div class="mt-2 space-y-2">
            <For each={props.node.children}>
              {(child) => (
                <ThreadedReply node={child} depth={props.depth + 1} />
              )}
            </For>
          </div>
        </Show>
      </Show>

      {/* Collapsed Preview */}
      <Show when={collapsed()}>
        <div class="text-xs text-text-tertiary italic">
          {props.node.event.content.slice(0, 80)}
          {props.node.event.content.length > 80 ? '...' : ''}
        </div>
      </Show>
    </div>
  );
};

export const ThreadedReplies: Component<ThreadedRepliesProps> = (props) => {
  const replyTree = createMemo(() => {
    // Build a map of event ID to event
    const eventMap = new Map<string, NostrEvent>();
    for (const reply of props.replies) {
      eventMap.set(reply.id, reply);
    }

    // Build a map of parent ID to children
    const childrenMap = new Map<string, NostrEvent[]>();

    for (const reply of props.replies) {
      // Find the parent event ID from 'e' tags
      // The last 'e' tag is typically the direct parent (NIP-10)
      const eTags = reply.tags.filter(t => t[0] === 'e');
      let parentId = props.rootEventId;

      if (eTags.length > 0) {
        // Get the last 'e' tag as the direct parent
        const lastETag = eTags[eTags.length - 1];
        if (lastETag[1]) {
          parentId = lastETag[1];
        }
      }

      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId)!.push(reply);
    }

    // Build the tree recursively
    function buildNode(event: NostrEvent, depth: number): ReplyNode {
      const children = childrenMap.get(event.id) || [];
      return {
        event,
        children: children
          .map(child => buildNode(child, depth + 1))
          .sort((a, b) => {
            // Sort by POW (descending), then by timestamp (ascending)
            const powDiff = getPowDifficulty(b.event) - getPowDifficulty(a.event);
            if (powDiff !== 0) return powDiff;
            return a.event.created_at - b.event.created_at;
          }),
        depth,
      };
    }

    // Get root-level replies (direct replies to the main note)
    const rootReplies = childrenMap.get(props.rootEventId) || [];

    return rootReplies
      .map(reply => buildNode(reply, 0))
      .sort((a, b) => {
        // Sort by POW (descending), then by timestamp (ascending)
        const powDiff = getPowDifficulty(b.event) - getPowDifficulty(a.event);
        if (powDiff !== 0) return powDiff;
        return a.event.created_at - b.event.created_at;
      });
  });

  return (
    <div class="space-y-3">
      <For each={replyTree()}>
        {(node) => <ThreadedReply node={node} depth={0} />}
      </For>
    </div>
  );
};
