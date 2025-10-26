import { Component } from 'solid-js';

interface YouTubeEmbedProps {
  videoId: string;
}

export const YouTubeEmbed: Component<YouTubeEmbedProps> = (props) => {
  return (
    <div class="my-3">
      <div class="relative w-full" style={{ 'padding-bottom': '56.25%' }}>
        <iframe
          src={`https://www.youtube.com/embed/${props.videoId}`}
          title="YouTube video player"
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
          class="absolute top-0 left-0 w-full h-full rounded-lg"
        />
      </div>
      <div class="text-xs text-text-tertiary mt-1 opacity-50">
        YouTube video
      </div>
    </div>
  );
};
