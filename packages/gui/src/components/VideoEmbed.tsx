import { Component, onCleanup, onMount, createSignal, Show } from 'solid-js';

interface VideoState {
  time: number;
  playing: boolean;
}

interface VideoEmbedProps {
  url: string;
  reservedHeight?: number;
  intersectionMargin?: number;
}

const videoStateCache = new Map<string, VideoState>();

export const VideoEmbed: Component<VideoEmbedProps> = (props) => {
  let videoRef: HTMLVideoElement | undefined;
  let pendingState: VideoState | undefined = videoStateCache.get(props.url);
  let containerRef: HTMLDivElement | undefined;
  let observer: IntersectionObserver | null = null;

  const [isVisible, setIsVisible] = createSignal(false);
  const [measuredHeight, setMeasuredHeight] = createSignal<number | undefined>(props.reservedHeight);
  const [hasMetadata, setHasMetadata] = createSignal(false);

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

  const updateMeasuredHeight = () => {
    if (!videoRef) return;
    if (props.reservedHeight) {
      setMeasuredHeight(props.reservedHeight);
      return;
    }
    const { videoWidth, videoHeight } = videoRef;
    if (videoWidth > 0 && videoHeight > 0) {
      const containerWidth = containerRef?.clientWidth || videoWidth;
      const scaledHeight = Math.min(
        (containerWidth / videoWidth) * videoHeight,
        900
      );
      setMeasuredHeight(scaledHeight);
    }
  };

  onMount(() => {
    if (typeof IntersectionObserver !== 'undefined' && !observer) {
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!entry) return;
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer?.disconnect();
            observer = null;
          }
        },
        {
          rootMargin: props.intersectionMargin
            ? `${props.intersectionMargin}px 0px`
            : '200px 0px',
          threshold: 0.1,
        }
      );
      if (containerRef) {
        observer.observe(containerRef);
      }
    } else {
      setIsVisible(true);
    }

    if (videoRef && videoRef.readyState >= 1) {
      applyPendingState();
      updateMeasuredHeight();
      setHasMetadata(true);
    }
    const handleTime = () => persistState();
    const handlePlay = () => persistState();
    const handlePause = () => persistState();
    const handleLoaded = () => {
      updateMeasuredHeight();
      setHasMetadata(true);
      applyPendingState();
    };
    videoRef?.addEventListener('timeupdate', handleTime);
    videoRef?.addEventListener('play', handlePlay);
    videoRef?.addEventListener('pause', handlePause);
    videoRef?.addEventListener('loadedmetadata', handleLoaded);

    onCleanup(() => {
      videoRef?.removeEventListener('timeupdate', handleTime);
      videoRef?.removeEventListener('play', handlePlay);
      videoRef?.removeEventListener('pause', handlePause);
      videoRef?.removeEventListener('loadedmetadata', handleLoaded);
      observer?.disconnect();
      observer = null;
      persistState();
    });

    window.addEventListener('resize', updateMeasuredHeight);
    onCleanup(() => window.removeEventListener('resize', updateMeasuredHeight));
  });

  return (
    <div class="my-3" ref={containerRef}>
      <div
        class="relative w-full overflow-hidden rounded-lg bg-black/40 dark:bg-white/5 flex items-center justify-center"
        style={{
          height: `${measuredHeight() ?? ((containerRef?.clientWidth || 400) / 16) * 9}px`,
        }}
      >
        <Show
          when={isVisible()}
          fallback={
            <div class="flex flex-col items-center text-xs text-text-tertiary opacity-70">
              <span>Video preview</span>
              <span>Tap to load</span>
            </div>
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
            onLoadedMetadata={() => {
              updateMeasuredHeight();
              setHasMetadata(true);
              applyPendingState();
            }}
            muted
            playsinline
            onPlay={persistState}
            onPause={persistState}
            onTimeUpdate={persistState}
            style={{ height: '100%' }}
          >
            Your browser does not support the video tag.
          </video>
        </Show>
        <Show when={!hasMetadata()}>
          <div class="absolute inset-0 flex items-center justify-center text-xs text-text-tertiary opacity-70">
            Loading video…
          </div>
        </Show>
      </div>
      <div class="text-xs text-text-tertiary mt-1 opacity-50">
        Video player (no autoplay)
      </div>
    </div>
  );
};
