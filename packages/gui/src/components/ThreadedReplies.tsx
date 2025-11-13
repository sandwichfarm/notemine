import { Component, For, Show, createSignal, createMemo } from 'solid-js';
import type { NostrEvent } from 'nostr-tools/core';
import { getPowDifficulty, hasValidPow } from '../lib/pow';
import { ProfileName } from './ProfileName';
import { ReplyComposer } from './ReplyComposer';
import { ParsedContent } from './ParsedContent';

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
  // State for inline reply composer
  const [showReplyComposer, setShowReplyComposer] = createSignal(false);

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

  const powDifficulty = () => hasValidPow(props.node.event, 1) ? getPowDifficulty(props.node.event) : 0;
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
        <ParsedContent
          content={props.node.event.content}
          event={props.node.event}
          class="text-sm text-text-primary mb-2"
        />

        {/* Reply Action Button */}
        <button
          onClick={() => setShowReplyComposer(!showReplyComposer())}
          class="text-xs text-text-tertiary hover:text-accent transition-colors mb-2"
          classList={{ 'text-accent': showReplyComposer() }}
        >
          💬 reply
        </button>

        {/* Inline Reply Composer - appears below when replying */}
        <Show when={showReplyComposer()}>
          <div class="mb-3 mt-2">
            <ReplyComposer
              parentEvent={props.node.event}
              onClose={() => setShowReplyComposer(false)}
              inline={true}
            />
          </div>
        </Show>

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
  // Track which flat-list reply has composer open (for fallback view)
  const [flatListReplyingTo, setFlatListReplyingTo] = createSignal<string | null>(null);

  const replyTree = createMemo(() => {
    console.log('[ThreadedReplies] Building tree with', props.replies.length, 'replies for root:', props.rootEventId);

    // Build a map of event ID to event
    const eventMap = new Map<string, NostrEvent>();
    for (const reply of props.replies) {
      eventMap.set(reply.id, reply);
    }

    // Build a map of parent ID to children
    const childrenMap = new Map<string, NostrEvent[]>();

    for (const reply of props.replies) {
      // Find the parent event ID from 'e' tags
      // According to NIP-10, we should look for marked tags first, then fall back to positional
      const eTags = reply.tags.filter(t => t[0] === 'e');
      let parentId: string | null = null;

      if (eTags.length > 0) {
        // First, look for a marked "reply" tag
        const replyTag = eTags.find(t => t[3] === 'reply');
        if (replyTag && replyTag[1]) {
          parentId = replyTag[1];
        } else if (eTags.length === 1) {
          // Single e-tag: Check if it's in our reply set (nested reply) or if it's the root
          const eTagId = eTags[0][1];
          if (eventMap.has(eTagId)) {
            // It's replying to another reply in this thread
            parentId = eTagId;
          } else {
            // It's replying to the root note (not in our reply set)
            parentId = props.rootEventId;
          }
        } else {
          // Multiple e-tags: Find the reply tag (last e-tag that's not root or mention)
          const replyTags = eTags.filter(t => !t[3] || t[3] === 'reply');
          if (replyTags.length > 0) {
            const lastReplyTag = replyTags[replyTags.length - 1];
            parentId = lastReplyTag[1];
          } else {
            // Fallback: last e-tag is parent
            const lastETag = eTags[eTags.length - 1];
            parentId = lastETag[1];
          }
        }
      }

      // If still no parent found, default to root
      if (!parentId) {
        parentId = props.rootEventId;
      }

      // CRITICAL: If the parent is not in our reply set AND not the root note,
      // treat it as a root-level reply (the parent was filtered out or not fetched)
      if (parentId !== props.rootEventId && !eventMap.has(parentId)) {
        console.log('[ThreadedReplies] Reply', reply.id.slice(0, 8), 'parent', parentId.slice(0, 8), 'not in reply set, treating as root-level');
        parentId = props.rootEventId;
      }

      console.log('[ThreadedReplies] Reply', reply.id.slice(0, 8), 'e-tags:', eTags.map(t => `${t[1].slice(0, 8)}(${t[3] || 'unmarked'})`).join(', '), 'parent:', parentId.slice(0, 8), 'root:', props.rootEventId.slice(0, 8));

      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId)!.push(reply);
    }

    // Get root-level replies (direct replies to the main note)
    const rootReplies = childrenMap.get(props.rootEventId) || [];
    console.log('[ThreadedReplies] Root-level replies:', rootReplies.length, 'for root:', props.rootEventId.slice(0, 8));
    console.log('[ThreadedReplies] All parent IDs in map:', Array.from(childrenMap.keys()).map(k => k.slice(0, 8)));

    // Build the tree recursively
    function buildNode(event: NostrEvent, depth: number): ReplyNode {
      const children = childrenMap.get(event.id) || [];
      return {
        event,
        children: children
          .map(child => buildNode(child, depth + 1))
          .sort((a, b) => {
            // Sort by POW (descending), then by timestamp (ascending)
            const aPow = hasValidPow(a.event, 1) ? getPowDifficulty(a.event) : 0;
            const bPow = hasValidPow(b.event, 1) ? getPowDifficulty(b.event) : 0;
            const powDiff = bPow - aPow;
            if (powDiff !== 0) return powDiff;
            return a.event.created_at - b.event.created_at;
          }),
        depth,
      };
    }

    const tree = rootReplies
      .map(reply => buildNode(reply, 0))
      .sort((a, b) => {
        // Sort by POW (descending), then by timestamp (ascending)
        const aPow = hasValidPow(a.event, 1) ? getPowDifficulty(a.event) : 0;
        const bPow = hasValidPow(b.event, 1) ? getPowDifficulty(b.event) : 0;
        const powDiff = bPow - aPow;
        if (powDiff !== 0) return powDiff;
        return a.event.created_at - b.event.created_at;
      });

    console.log('[ThreadedReplies] Final tree nodes:', tree.length);
    return tree;
  });

  return (
    <div class="space-y-3">
      <Show when={replyTree().length > 0} fallback={
        <div class="space-y-3">
          <div class="text-sm text-yellow-600 dark:text-yellow-400 mb-2">
            Debug: Showing {props.replies.length} replies as flat list (tree building found 0 root nodes)
          </div>
          <For each={props.replies}>
            {(reply) => (
              <div class="border-l-2 border-border/30 pl-3 py-2">
                <div class="flex items-start justify-between mb-2">
                  <div class="flex items-center gap-2 flex-1 min-w-0">
                    <ProfileName pubkey={reply.pubkey} asLink={true} class="font-mono text-xs text-text-secondary" />
                    <div class="text-xs text-text-tertiary">
                      {new Date(reply.created_at * 1000).toLocaleString()}
                    </div>
                    <Show when={hasValidPow(reply, 1)}>
                      <span class="text-xs font-mono text-accent">
                        ⛏️ {getPowDifficulty(reply)}
                      </span>
                    </Show>
                  </div>
                </div>
                <div class="text-sm text-text-primary whitespace-pre-wrap break-words mb-2">
                  {reply.content}
                </div>

                {/* Reply button for flat list view */}
                <button
                  onClick={() => setFlatListReplyingTo(
                    flatListReplyingTo() === reply.id ? null : reply.id
                  )}
                  class="text-xs text-text-tertiary hover:text-accent transition-colors"
                  classList={{ 'text-accent': flatListReplyingTo() === reply.id }}
                >
                  💬 reply
                </button>

                {/* Inline reply composer for flat list */}
                <Show when={flatListReplyingTo() === reply.id}>
                  <div class="mt-2">
                    <ReplyComposer
                      parentEvent={reply}
                      onClose={() => setFlatListReplyingTo(null)}
                      inline={true}
                    />
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>
      }>
        <For each={replyTree()}>
          {(node) => <ThreadedReply node={node} depth={0} />}
        </For>
      </Show>
    </div>
  );
};
