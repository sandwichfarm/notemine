import { Component } from 'solid-js';

interface GitHubEmbedProps {
  url: string;
  type: 'repo' | 'issue' | 'pr' | 'release';
  owner: string;
  repo: string;
  number?: string;
}

export const GitHubEmbed: Component<GitHubEmbedProps> = (props) => {
  const typeLabel = {
    repo: 'Repository',
    issue: 'Issue',
    pr: 'Pull Request',
    release: 'Release',
  }[props.type];

  const icon = {
    repo: (
      <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
      </svg>
    ),
    issue: (
      <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
      </svg>
    ),
    pr: (
      <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
        <path d="M7 6.5C7 7.88 5.88 9 4.5 9S2 7.88 2 6.5 3.12 4 4.5 4 7 5.12 7 6.5zm12 11c0 1.38-1.12 2.5-2.5 2.5S14 18.88 14 17.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5zM7 17.5C7 16.12 5.88 15 4.5 15S2 16.12 2 17.5 3.12 20 4.5 20 7 18.88 7 17.5zm9.55-9.44L14 10.61V15h2v-4.39l2.55-2.55-1.42-1.41z"/>
      </svg>
    ),
    release: (
      <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2L2 7v10c0 5.52 3.84 10.68 9 12 5.16-1.32 9-6.48 9-12V7l-10-5zm0 2.18l8 4V17c0 4.52-3.16 8.72-8 10-4.84-1.28-8-5.48-8-10V8.18l8-4zM11 17h2v2h-2v-2zm0-10h2v8h-2V7z"/>
      </svg>
    ),
  }[props.type];

  return (
    <a
      href={props.url}
      target="_blank"
      rel="noopener noreferrer"
      class="block my-3 p-4 border border-[var(--border-color)] rounded-lg hover:border-[var(--accent)] transition-colors group bg-[var(--bg-secondary)]"
    >
      <div class="flex items-start gap-3">
        <div class="text-gray-600 dark:text-gray-400 mt-1">
          {icon}
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-mono text-text-secondary opacity-70 mb-1">
            {props.owner}/{props.repo}
            {props.number && ` #${props.number}`}
          </div>
          <div class="text-base font-medium text-text-primary group-hover:text-accent transition-colors">
            View {typeLabel} on GitHub →
          </div>
        </div>
        <svg class="w-8 h-8 text-gray-600 dark:text-gray-400" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
        </svg>
      </div>
    </a>
  );
};
