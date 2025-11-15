import { Component, createSignal, onCleanup, onMount } from 'solid-js';
import { usePreferences } from '../providers/PreferencesProvider';
import { isImageDeblurred, markImageDeblurred } from '../lib/image-deblur-cache';

interface ImageEmbedProps {
  url: string;
  /** Reserved height for stable rendering (Phase 2) */
  reservedHeight?: number;
}

const blurStateCache = new Map<string, boolean>();

export const ImageEmbed: Component<ImageEmbedProps> = (props) => {
  const { preferences } = usePreferences();
  const initialBlurState = blurStateCache.has(props.url) ? blurStateCache.get(props.url)! : true;
  const [blurred, setBlurred] = createSignal(initialBlurState);
  let isMounted = false;

  // Check preferences and cache on mount to determine initial blur state
  onMount(async () => {
    isMounted = true;
    const prefs = preferences();

    // If auto-deblur is enabled globally, start unblurred
    if (prefs.autoDeblurImages) {
      setBlurred(false);
      blurStateCache.set(props.url, false);
      return;
    }

    // Otherwise, check if this specific image was previously deblurred
    try {
      if (!blurStateCache.has(props.url)) {
        const wasDeblurred = await isImageDeblurred(props.url);
        if (wasDeblurred && isMounted) {
          setBlurred(false);
          blurStateCache.set(props.url, false);
        }
      }
    } catch (error) {
      console.warn('Failed to check deblur cache:', error);
    }
  });

  onCleanup(() => {
    isMounted = false;
  });

  // Handle manual blur toggle
  const handleClick = async () => {
    const newBlurState = !blurred();
    setBlurred(newBlurState);
    blurStateCache.set(props.url, newBlurState);

    // If user manually deblurred the image, save to cache
    // (Don't cache re-blurring, only deblurring)
    if (!newBlurState && !preferences().autoDeblurImages) {
      try {
        await markImageDeblurred(props.url);
      } catch (error) {
        console.error('Failed to save deblur state:', error);
      }
    }
  };

  // Container style with reserved height for stable rendering
  const containerStyle = () => {
    const style: Record<string, string> = {};
    if (props.reservedHeight) {
      style['min-height'] = `${props.reservedHeight}px`;
    }
    return style;
  };

  return (
    <div class="my-3">
      <div
        class="overflow-hidden rounded-lg"
        style={containerStyle()}
      >
        <img
          src={props.url}
          alt="Embedded image"
          class="max-w-full h-auto cursor-pointer transition-all"
          classList={{
            'blur-xl': blurred(),
            'blur-none': !blurred(),
          }}
          onClick={handleClick}
          loading="lazy"
        />
      </div>
      <div class="text-xs text-text-tertiary mt-1 opacity-50">
        Click to {blurred() ? 'reveal' : 'blur'} image
      </div>
    </div>
  );
};
