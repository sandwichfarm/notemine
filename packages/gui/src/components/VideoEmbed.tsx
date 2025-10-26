import { Component } from 'solid-js';

interface VideoEmbedProps {
  url: string;
}

export const VideoEmbed: Component<VideoEmbedProps> = (props) => {
  return (
    <div class="my-3">
      <video
        src={props.url}
        controls
        preload="metadata"
        class="max-w-full h-auto rounded-lg"
        style={{
          filter: 'blur(10px)',
        }}
        onLoadedMetadata={(e) => {
          // Remove blur once metadata is loaded
          e.currentTarget.style.filter = 'none';
        }}
      >
        Your browser does not support the video tag.
      </video>
      <div class="text-xs text-text-tertiary mt-1 opacity-50">
        Video player (no autoplay)
      </div>
    </div>
  );
};
