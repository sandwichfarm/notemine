import { Component } from 'solid-js';

interface BasicLinkCardProps {
  url: string;
}

/**
 * Extract hostname from URL
 */
function getHostname(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, ''); // Remove www prefix
  } catch {
    return url;
  }
}

/**
 * Truncate URL for display
 */
function truncateUrl(url: string, maxLength: number = 60): string {
  if (url.length <= maxLength) return url;
  return url.substring(0, maxLength - 3) + '...';
}

/**
 * Basic link card component
 * Shows a clickable card with hostname and URL
 * Future: Can be extended to fetch and display Open Graph metadata
 */
export const BasicLinkCard: Component<BasicLinkCardProps> = (props) => {
  const hostname = () => getHostname(props.url);
  const displayUrl = () => truncateUrl(props.url);

  // Future: Metadata fetching could go here
  // const [metadata, setMetadata] = createSignal<{ title?: string; description?: string; image?: string } | null>(null);

  return (
    <a
      href={props.url}
      target="_blank"
      rel="noopener noreferrer"
      class="block my-3 p-4 border border-[var(--border-color)] rounded-lg hover:border-[var(--accent)] transition-colors group bg-[var(--bg-secondary)]"
    >
      <div class="flex items-start gap-3">
        {/* Link Icon */}
        <div class="text-gray-600 dark:text-gray-400 mt-1 flex-shrink-0">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
        </div>

        {/* Content */}
        <div class="flex-1 min-w-0">
          {/* Hostname */}
          <div class="text-sm font-medium text-text-primary mb-1">
            {hostname()}
          </div>

          {/* URL */}
          <div class="text-xs font-mono text-text-secondary opacity-70 break-all">
            {displayUrl()}
          </div>

          {/* Future: Metadata can be displayed here */}
          {/* <Show when={metadata()}>
            <div class="mt-2">
              <div class="text-sm font-medium text-text-primary">{metadata()!.title}</div>
              <div class="text-xs text-text-secondary mt-1">{metadata()!.description}</div>
            </div>
          </Show> */}
        </div>

        {/* External link icon */}
        <div class="text-gray-600 dark:text-gray-400 flex-shrink-0">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </div>
      </div>
    </a>
  );
};
