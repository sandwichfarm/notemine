import { Component } from 'solid-js';

interface SubstackEmbedProps {
  url: string;
  publication?: string;
  type: 'post' | 'home';
}

export const SubstackEmbed: Component<SubstackEmbedProps> = (props) => {
  return (
    <a
      href={props.url}
      target="_blank"
      rel="noopener noreferrer"
      class="block my-3 p-4 border border-[var(--border-color)] rounded-lg hover:border-[var(--accent)] transition-colors group bg-[var(--bg-secondary)]"
    >
      <div class="flex items-start gap-3">
        <div class="text-[#FF6719] mt-1">
          <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M22.539 8.242H1.46V5.406h21.08v2.836zM1.46 10.812V24L12 18.11 22.54 24V10.812H1.46zM22.54 0H1.46v2.836h21.08V0z"/>
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          {props.publication && (
            <div class="text-sm font-mono text-text-secondary opacity-70 mb-1">
              {props.publication}
            </div>
          )}
          <div class="text-base font-medium text-text-primary group-hover:text-accent transition-colors">
            {props.type === 'post' ? 'Read on Substack →' : 'Visit Substack →'}
          </div>
        </div>
        <div class="text-sm text-[#FF6719] font-bold">S</div>
      </div>
    </a>
  );
};
