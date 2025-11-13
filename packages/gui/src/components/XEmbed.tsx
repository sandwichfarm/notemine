import { Component } from 'solid-js';

interface XEmbedProps {
  url: string;
  username: string;
  tweetId: string;
}

export const XEmbed: Component<XEmbedProps> = (props) => {
  return (
    <a
      href={props.url}
      target="_blank"
      rel="noopener noreferrer"
      class="block my-3 p-4 border border-[var(--border-color)] rounded-lg hover:border-[var(--accent)] transition-colors group bg-[var(--bg-secondary)]"
    >
      <div class="flex items-start gap-3">
        <div class="text-gray-600 dark:text-gray-400 mt-1">
          <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-mono text-text-secondary opacity-70 mb-1">
            @{props.username}
          </div>
          <div class="text-base font-medium text-text-primary group-hover:text-accent transition-colors">
            View post on X →
          </div>
        </div>
        <div class="text-2xl">𝕏</div>
      </div>
    </a>
  );
};
