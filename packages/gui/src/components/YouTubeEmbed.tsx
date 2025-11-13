import { Component, Show } from 'solid-js';

interface YouTubeEmbedProps {
  videoId: string;
  reservedHeight?: number;
}

export const YouTubeEmbed: Component<YouTubeEmbedProps> = (props) => {
  const isCOIEnabled = window.crossOriginIsolated;

  const youtubeUrl = `https://www.youtube.com/watch?v=${props.videoId}`;
  const embedUrl = `https://www.youtube.com/embed/${props.videoId}`;
  const thumbnailUrl = `https://img.youtube.com/vi/${props.videoId}/maxresdefault.jpg`;

  const handleClick = () => {
    if (isCOIEnabled) {
      // When COI is enabled, open in new tab instead of embedding
      // This avoids COEP issues with YouTube iframes in Firefox
      window.open(youtubeUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // Container style with reserved height for stable rendering (Phase 2)
  // Falls back to 16:9 aspect ratio if no reserved height provided
  const containerStyle = () => {
    if (props.reservedHeight) {
      return { 'min-height': `${props.reservedHeight}px` };
    }
    return { 'padding-bottom': '56.25%' }; // 16:9 fallback
  };

  return (
    <div class="my-3">
      <Show
        when={!isCOIEnabled}
        fallback={
          <a
            href={youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="block relative w-full cursor-pointer group"
            classList={{
              'h-auto': !!props.reservedHeight,
            }}
            style={containerStyle()}
            onClick={(e) => {
              e.preventDefault();
              handleClick();
            }}
          >
            <div
              class="bg-black rounded-lg overflow-hidden"
              classList={{
                'absolute top-0 left-0 w-full h-full': !props.reservedHeight,
                'relative': !!props.reservedHeight,
              }}
              style={props.reservedHeight ? { height: `${props.reservedHeight}px` } : {}}
            >
              <img
                src={thumbnailUrl}
                alt="YouTube video thumbnail"
                class="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
              />
              <div class="absolute inset-0 flex items-center justify-center">
                <div class="bg-red-600 rounded-full p-4 group-hover:bg-red-700 transition-colors">
                  <svg class="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>
              <div class="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                <p class="text-white text-sm font-medium">Click to watch on YouTube</p>
                <p class="text-white/60 text-xs mt-1">Opens in new tab (iframe blocked by security policy)</p>
              </div>
            </div>
          </a>
        }
      >
        <div
          class="w-full"
          classList={{
            'relative': !props.reservedHeight,
          }}
          style={containerStyle()}
        >
          <iframe
            src={embedUrl}
            title="YouTube video player"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
            classList={{
              'absolute top-0 left-0 w-full h-full rounded-lg': !props.reservedHeight,
              'w-full rounded-lg': !!props.reservedHeight,
            }}
            style={props.reservedHeight ? { height: `${props.reservedHeight}px` } : {}}
          />
        </div>
      </Show>
      <div class="text-xs text-text-tertiary mt-1 opacity-50 flex justify-between items-center">
        <span>YouTube video</span>
        <Show when={isCOIEnabled}>
          <span class="text-xs italic opacity-70">(opens in new tab due to security policy)</span>
        </Show>
      </div>
    </div>
  );
};
