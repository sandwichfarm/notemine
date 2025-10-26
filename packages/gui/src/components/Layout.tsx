import { Component, createSignal, Show } from 'solid-js';
import { A } from '@solidjs/router';
import { useTheme } from '../providers/ThemeProvider';
import { useUser } from '../providers/UserProvider';
import { LoginModal } from './LoginModal';
import Profile from '../pages/Profile';
import { MiningStatsButton } from './MiningStatsButton';

const Layout: Component<{ children?: any }> = (props) => {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useUser();
  const [showLoginModal, setShowLoginModal] = createSignal(false);
  const [showProfileModal, setShowProfileModal] = createSignal(false);
  const [showUserMenu, setShowUserMenu] = createSignal(false);

  return (
    <div class="min-h-screen flex flex-col pb-16">
      {/* Header with Mining, User, Login, Theme */}
      <div class="fixed top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2">
        <MiningStatsButton />

        <Show when={user()}>
          <div class="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu())}
              class="btn text-sm font-mono flex items-center gap-2"
              title="Click to view profile"
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
              <div class="absolute right-0 mt-2 w-64 card p-2 shadow-xl">
                <div class="px-3 py-2 border-b border-border mb-2">
                  <div class="text-xs text-text-secondary mb-1">
                    {user()?.isAnon ? 'Browsing as' : 'Signed in as'}
                  </div>
                  <div class="font-mono text-xs break-all">{user()?.pubkey}</div>
                  <div class="text-xs text-accent mt-1">
                    {user()?.authMethod} {user()?.isAnon && '(ephemeral)'}
                  </div>
                </div>

                <Show when={!user()?.isAnon}>
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      setShowProfileModal(true);
                    }}
                    class="w-full px-3 py-2 text-left text-sm hover:bg-bg-secondary dark:hover:bg-bg-tertiary rounded transition-colors mb-1"
                  >
                    Edit Profile
                  </button>
                </Show>

                <Show when={!user()?.isAnon}>
                  <button
                    onClick={() => {
                      logout();
                      setShowUserMenu(false);
                    }}
                    class="w-full px-3 py-2 text-left text-sm hover:bg-bg-secondary dark:hover:bg-bg-tertiary rounded transition-colors text-red-500"
                  >
                    Sign Out
                  </button>
                </Show>
              </div>
            </Show>
          </div>
        </Show>

        {/* Login Button (visible for anon users) */}
        <Show when={user()?.isAnon}>
          <button
            onClick={() => setShowLoginModal(true)}
            class="btn text-xs px-3 py-2"
          >
            Sign In
          </button>
        </Show>

        {/* Theme Toggle (far right) */}
        <button
          onClick={toggleTheme}
          class="btn text-xs px-3 py-2"
          title={`Switch to ${theme() === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme() === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>

      {/* Login Modal */}
      <LoginModal
        isOpen={showLoginModal()}
        onClose={() => setShowLoginModal(false)}
      />

      {/* Profile Modal */}
      <Show when={showProfileModal()}>
        <div
          class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowProfileModal(false)}
        >
          <div class="max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div class="card p-6">
              <div class="flex items-center justify-between mb-4">
                <h2 class="text-2xl font-bold">Profile</h2>
                <button
                  onClick={() => setShowProfileModal(false)}
                  class="text-text-secondary hover:text-text-primary"
                >
                  <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <Profile />
            </div>
          </div>
        </div>
      </Show>

      {/* Main Content */}
      <main class="flex-1 px-6 py-8 pt-20">
        <div class="max-w-6xl mx-auto">
          {props.children}
        </div>
      </main>

      {/* Floating Footer */}
      <footer class="fixed bottom-0 left-0 right-0 bg-bg-primary/80 dark:bg-bg-secondary/80 backdrop-blur-sm border-t border-border px-6 py-3 z-30">
        <div class="max-w-6xl mx-auto flex items-center justify-between text-xs">
          <A href="/" class="font-bold hover:text-accent transition-colors">
            notemine.io
          </A>
          <div class="flex gap-4">
            <A href="/about" class="hover:text-accent transition-colors">
              about
            </A>
            <A href="/stats" class="hover:text-accent transition-colors">
              stats
            </A>
            <a
              href="https://github.com/sandwich-ai/notemine"
              target="_blank"
              rel="noopener noreferrer"
              class="hover:text-accent transition-colors"
            >
              github
            </a>
            <a
              href="https://crates.io/crates/notemine"
              target="_blank"
              rel="noopener noreferrer"
              class="hover:text-accent transition-colors"
            >
              crates.io
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
