import { Component } from 'solid-js';

interface FacebookEmbedProps {
  url: string;
  type: 'post' | 'photo' | 'video' | 'page';
}

export const FacebookEmbed: Component<FacebookEmbedProps> = (props) => {
  const typeLabel = {
    post: 'Post',
    photo: 'Photo',
    video: 'Video',
    page: 'Page',
  }[props.type];

  return (
    <a
      href={props.url}
      target="_blank"
      rel="noopener noreferrer"
      class="block my-3 p-4 border border-[var(--border-color)] rounded-lg hover:border-[var(--accent)] transition-colors group bg-[var(--bg-secondary)]"
    >
      <div class="flex items-start gap-3">
        <div class="text-[#1877F2] mt-1">
          <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-sm text-text-secondary opacity-70 mb-1">
            Facebook {typeLabel}
          </div>
          <div class="text-base font-medium text-text-primary group-hover:text-accent transition-colors">
            View on Facebook →
          </div>
        </div>
      </div>
    </a>
  );
};
