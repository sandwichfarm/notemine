import { Component, Show } from 'solid-js';

interface SpotifyEmbedProps {
  type: 'track' | 'album' | 'playlist' | 'episode' | 'show';
  id: string;
}

export const SpotifyEmbed: Component<SpotifyEmbedProps> = (props) => {
  const isCOIEnabled = window.crossOriginIsolated;

  const spotifyUrl = `https://open.spotify.com/${props.type}/${props.id}`;
  const embedUrl = `https://open.spotify.com/embed/${props.type}/${props.id}`;

  const typeLabel = {
    track: 'Track',
    album: 'Album',
    playlist: 'Playlist',
    episode: 'Podcast Episode',
    show: 'Podcast Show',
  }[props.type];

  const height = props.type === 'track' || props.type === 'episode' ? '152px' : '352px';

  return (
    <div class="my-3">
      <Show
        when={!isCOIEnabled}
        fallback={
          <div>
            <a
              href={spotifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              class="block relative w-full cursor-pointer group bg-[#1DB954]/10 hover:bg-[#1DB954]/20 transition-colors rounded-lg border border-[#1DB954]/30 overflow-hidden"
              style={{ height }}
            >
              <div class="absolute inset-0 flex flex-col items-center justify-center p-6">
                <div class="bg-[#1DB954] rounded-full p-4 mb-4 group-hover:scale-110 transition-transform">
                  <svg class="w-12 h-12 text-black" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                  </svg>
                </div>
                <p class="text-white text-base font-medium text-center mb-1">Click to open on Spotify</p>
                <p class="text-white/60 text-sm text-center">{typeLabel}</p>
              </div>
            </a>
            <div class="text-xs text-text-tertiary mt-2 opacity-50 text-center">
              <span class="italic">(opens in new tab due to security policy)</span>
            </div>
          </div>
        }
      >
        <div>
          <iframe
            src={embedUrl}
            width="100%"
            height={height}
            frameborder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            class="rounded-lg"
          />
          <div class="text-xs text-text-tertiary mt-2 opacity-50">
            <span>Spotify {typeLabel}</span>
          </div>
        </div>
      </Show>
    </div>
  );
};
