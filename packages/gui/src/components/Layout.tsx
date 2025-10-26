import { Component, createSignal, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { useTheme } from '../providers/ThemeProvider';
import { useUser } from '../providers/UserProvider';
import { LoginModal } from './LoginModal';

const Layout: Component<{ children?: any }> = (props) => {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useUser();
  const [showLoginModal, setShowLoginModal] = createSignal(false);
  const [showUserMenu, setShowUserMenu] = createSignal(false);

  return (
    <div class="min-h-screen flex flex-col">
      {/* Header */}
      <header class="border-b border-[var(--border-color)] px-6 py-4">
        <div class="max-w-6xl mx-auto flex items-center justify-between">
          <div class="flex items-center gap-6">
            <h1 class="text-xl font-bold">
              <A href="/" class="hover:text-[var(--accent)]">
                notemine.io
              </A>
            </h1>
            <nav class="flex gap-4 text-sm">
              <A
                href="/feed"
                class="hover:text-[var(--accent)]"
                activeClass="text-[var(--accent)]"
              >
                feed
              </A>
              <A
                href="/profile"
                class="hover:text-[var(--accent)]"
                activeClass="text-[var(--accent)]"
              >
                profile
              </A>
              <A
                href="/stats"
                class="hover:text-[var(--accent)]"
                activeClass="text-[var(--accent)]"
              >
                stats
              </A>
            </nav>
          </div>

          <div class="flex items-center gap-4">
            <button
              onClick={toggleTheme}
              class="btn text-xs"
              title={`Switch to ${theme() === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme() === 'dark' ? '☀️' : '🌙'}
            </button>

            {/* User Menu / Login Button */}
            <Show
              when={user()}
              fallback={
                <button
                  onClick={() => setShowLoginModal(true)}
                  class="btn-primary text-sm"
                >
                  Sign In
                </button>
              }
            >
              <div class="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu())}
                  class="btn text-sm font-mono flex items-center gap-2"
                  title={user()?.pubkey}
                >
                  <Show when={user()?.isAnon}>
                    <span class="text-xs px-2 py-0.5 bg-yellow-500/20 text-yellow-500 rounded">anon</span>
                  </Show>
                  {user()?.pubkey.slice(0, 8)}...
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* User Menu Dropdown */}
                <Show when={showUserMenu()}>
                  <div class="absolute right-0 mt-2 w-64 card p-2 shadow-xl z-50">
                    <div class="px-3 py-2 border-b border-border mb-2">
                      <div class="text-xs text-text-secondary mb-1">Signed in as</div>
                      <div class="font-mono text-xs break-all">{user()?.pubkey}</div>
                      <div class="text-xs text-accent mt-1">
                        {user()?.authMethod} {user()?.isAnon && '(anonymous)'}
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        logout();
                        setShowUserMenu(false);
                      }}
                      class="w-full px-3 py-2 text-left text-sm hover:bg-bg-secondary dark:hover:bg-bg-tertiary rounded transition-colors text-red-500"
                    >
                      Sign Out
                    </button>
                  </div>
                </Show>
              </div>
            </Show>
          </div>
        </div>
      </header>

      {/* Login Modal */}
      <LoginModal
        isOpen={showLoginModal()}
        onClose={() => setShowLoginModal(false)}
      />

      {/* Main Content */}
      <main class="flex-1 px-6 py-8">
        <div class="max-w-6xl mx-auto">
          {props.children}
        </div>
      </main>

      {/* Footer */}
      <footer class="border-t border-[var(--border-color)] px-6 py-4 text-xs text-[var(--text-secondary)]">
        <div class="max-w-6xl mx-auto text-center">
          powered by proof-of-work • notemine.io
        </div>
      </footer>
    </div>
  );
};

export default Layout;
