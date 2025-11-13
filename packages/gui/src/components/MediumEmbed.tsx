import { Component } from 'solid-js';

interface MediumEmbedProps {
  url: string;
  author?: string;
  publication?: string;
}

export const MediumEmbed: Component<MediumEmbedProps> = (props) => {
  return (
    <a
      href={props.url}
      target="_blank"
      rel="noopener noreferrer"
      class="block my-3 p-4 border border-[var(--border-color)] rounded-lg hover:border-[var(--accent)] transition-colors group bg-[var(--bg-secondary)]"
    >
      <div class="flex items-start gap-3">
        <div class="text-black dark:text-white mt-1">
          <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M13.54 12a6.8 6.8 0 01-6.77 6.82A6.8 6.8 0 010 12a6.8 6.8 0 016.77-6.82A6.8 6.8 0 0113.54 12zM20.96 12c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42M24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75C23.47 6.25 24 8.83 24 12z"/>
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          {(props.author || props.publication) && (
            <div class="text-sm font-mono text-text-secondary opacity-70 mb-1">
              {props.author ? `@${props.author}` : props.publication}
            </div>
          )}
          <div class="text-base font-medium text-text-primary group-hover:text-accent transition-colors">
            Read on Medium →
          </div>
        </div>
        <div class="text-xl font-serif font-bold">M</div>
      </div>
    </a>
  );
};
