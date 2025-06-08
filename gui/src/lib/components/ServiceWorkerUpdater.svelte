<script lang="ts">
  import { onMount } from 'svelte';
  import { dev } from '$app/environment';
  import { fade } from 'svelte/transition';
  
  let registration: ServiceWorkerRegistration | null = null;
  let showUpdatePrompt = false;
  let showInstallPrompt = false;
  let deferredPrompt: any = null;
  
  onMount(() => {
    if (!dev && 'serviceWorker' in navigator) {
      registerServiceWorker();
    }
    
    // Listen for beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      showInstallPrompt = true;
    });
  });
  
  async function registerServiceWorker() {
    try {
      registration = await navigator.serviceWorker.register('/service-worker.js');
      
      // Check for updates periodically
      setInterval(() => {
        registration?.update();
      }, 60000); // Check every minute
      
      registration.addEventListener('updatefound', () => {
        const newWorker = registration!.installing;
        
        newWorker?.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New service worker is ready
            showUpdatePrompt = true;
          }
        });
      });
    } catch (error) {
      console.error('Service worker registration failed:', error);
    }
  }
  
  function updateServiceWorker() {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
  }
  
  async function installApp() {
    if (!deferredPrompt) return;
    
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      showInstallPrompt = false;
    }
    
    deferredPrompt = null;
  }
  
  function dismissInstallPrompt() {
    showInstallPrompt = false;
    // Show again after 7 days
    setTimeout(() => {
      if (deferredPrompt) {
        showInstallPrompt = true;
      }
    }, 7 * 24 * 60 * 60 * 1000);
  }
</script>

{#if showUpdatePrompt}
  <div 
    class="fixed bottom-20 left-1/2 transform -translate-x-1/2 bg-neutral-900 text-white px-6 py-4 rounded-lg shadow-lg max-w-md z-50 border border-neutral-800"
    in:fade={{ duration: 200 }}
  >
    <h3 class="font-semibold mb-2">Update Available</h3>
    <p class="text-sm text-neutral-300 mb-3">
      A new version of Notemine is available. Update now for the latest features and improvements.
    </p>
    <div class="flex gap-2">
      <button
        on:click={updateServiceWorker}
        class="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm transition-colors"
      >
        Update Now
      </button>
      <button
        on:click={() => showUpdatePrompt = false}
        class="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded text-sm transition-colors"
      >
        Later
      </button>
    </div>
  </div>
{/if}

{#if showInstallPrompt}
  <div 
    class="fixed top-20 right-4 bg-neutral-900 text-white px-6 py-4 rounded-lg shadow-lg max-w-sm z-50 border border-neutral-800"
    in:fade={{ duration: 200 }}
  >
    <h3 class="font-semibold mb-2">Install Notemine</h3>
    <p class="text-sm text-neutral-300 mb-3">
      Install Notemine for a better experience with offline support and quick access from your home screen.
    </p>
    <div class="flex gap-2">
      <button
        on:click={installApp}
        class="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm transition-colors"
      >
        Install
      </button>
      <button
        on:click={dismissInstallPrompt}
        class="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded text-sm transition-colors"
      >
        Not Now
      </button>
    </div>
  </div>
{/if}