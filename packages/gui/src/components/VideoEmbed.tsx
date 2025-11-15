import { Component, onCleanup, onMount } from 'solid-js';

interface VideoState {
  time: number;
  playing: boolean;
}

interface VideoEmbedProps {
  url: string;
  reservedHeight?: number;
}

const videoStateCache = new Map<string, VideoState>();

export const VideoEmbed: Component<VideoEmbedProps> = (props) => {
  let videoRef: HTMLVideoElement | undefined;
  let pendingState: VideoState | undefined = videoStateCache.get(props.url);

  const applyPendingState = () => {
    if (!videoRef || !pendingState) return;
    try {
      videoRef.currentTime = pendingState.time;
    } catch {
      return; // try again once metadata is ready
    }
    if (pendingState.playing) {
      videoRef.play().catch(() => {});
    }
    pendingState = undefined;
  };

  const persistState = () => {
    if (!videoRef) return;
    videoStateCache.set(props.url, {
      time: videoRef.currentTime,
      playing: !videoRef.paused && !videoRef.ended,
    });
  };

  onMount(() => {
    if (videoRef && videoRef.readyState >= 1) {
      applyPendingState();
    }
    const handleTime = () => persistState();
    const handlePlay = () => persistState();
    const handlePause = () => persistState();
    videoRef?.addEventListener('timeupdate', handleTime);
    videoRef?.addEventListener('play', handlePlay);
    videoRef?.addEventListener('pause', handlePause);

    onCleanup(() => {
      videoRef?.removeEventListener('timeupdate', handleTime);
      videoRef?.removeEventListener('play', handlePlay);
      videoRef?.removeEventListener('pause', handlePause);
      persistState();
    });
  });

  return (
    <div class="my-3">
      <div
        class="relative w-full overflow-hidden rounded-lg bg-black/20 dark:bg-white/5"
        style={
          props.reservedHeight
            ? { 'min-height': `${props.reservedHeight}px` }
            : { 'aspect-ratio': '16 / 9' }
        }
      >
        <video
          ref={(el) => {
            videoRef = el;
          }}
          src={props.url}
          controls
          preload="metadata"
          class="w-full h-full object-contain bg-black rounded-lg"
          onLoadedMetadata={() => applyPendingState()}
          onPlay={persistState}
          onPause={persistState}
          onTimeUpdate={persistState}
          style={props.reservedHeight ? {} : { height: '100%' }}
        >
          Your browser does not support the video tag.
        </video>
      </div>
      <div class="text-xs text-text-tertiary mt-1 opacity-50">
        Video player (no autoplay)
      </div>
    </div>
  );
};
