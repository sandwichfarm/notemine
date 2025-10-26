import { Component, createSignal } from 'solid-js';

interface ImageEmbedProps {
  url: string;
}

export const ImageEmbed: Component<ImageEmbedProps> = (props) => {
  const [blurred, setBlurred] = createSignal(true);

  return (
    <div class="my-3">
      <div class="overflow-hidden rounded-lg">
        <img
          src={props.url}
          alt="Embedded image"
          class="max-w-full h-auto cursor-pointer transition-all"
          classList={{
            'blur-xl': blurred(),
            'blur-none': !blurred(),
          }}
          onClick={() => setBlurred(!blurred())}
          loading="lazy"
        />
      </div>
      <div class="text-xs text-text-tertiary mt-1 opacity-50">
        Click to {blurred() ? 'reveal' : 'blur'} image
      </div>
    </div>
  );
};
