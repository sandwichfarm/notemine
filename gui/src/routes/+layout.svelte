<script>
  import '../app.css';
  import ServiceWorkerUpdater from '$lib/components/ServiceWorkerUpdater.svelte';
  import BootScreen from '$lib/components/BootScreen.svelte';
  import { bootService } from '$lib/services/boot';
  import { onMount } from 'svelte';
  
  onMount(() => {
    // Start boot sequence
    bootService.startBoot();
  });
</script>

<ServiceWorkerUpdater />
<BootScreen />

<div class="h-full w-full">
  <slot />
</div>