import type { NostrEvent } from 'nostr-tools/core';

export interface NoteTopicsResult {
  topics: string[];
  sanitizedContent: string;
}

/**
 * Extract normalized topics from an event and return content with those hashtags removed.
 */
export function extractNoteTopics(event: NostrEvent): NoteTopicsResult {
  const normalizedTopics: string[] = [];
  const topicSet = new Set<string>();

  for (const tag of event.tags ?? []) {
    if (tag[0] !== 't') continue;
    const topic = tag[1]?.trim();
    if (!topic) continue;
    const normalized = topic.toLowerCase();
    if (topicSet.has(normalized)) continue;
    topicSet.add(normalized);
    normalizedTopics.push(normalized);
  }

  const sanitizedContent = stripTopicHashtags(event.content ?? '', topicSet);

  return {
    topics: normalizedTopics,
    sanitizedContent,
  };
}

const HASHTAG_REGEX = /(^|\s)#([\p{L}\p{N}_-]+)([^\S\r\n]*)/giu;

/**
 * Remove hashtags that match the provided topics set, along with trailing spaces/tabs.
 */
function stripTopicHashtags(content: string, topics: Set<string>): string {
  if (!content || topics.size === 0) {
    return content;
  }

  return content
    .replace(HASHTAG_REGEX, (match, leading: string, topic: string, trailingWhitespace: string) => {
      if (!topics.has(topic.toLowerCase())) {
        return match;
      }
      return leading ?? '';
    })
    .replace(/[ \t]{2,}/g, ' ');
}
