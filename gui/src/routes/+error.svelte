<script>
  import { page } from '$app/stores';
</script>

<div class="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center">
  <div class="text-center">
    <h1 class="text-4xl font-bold mb-4">Error {$page.status}</h1>
    <p class="text-xl mb-4">{$page.error?.message}</p>
    <a href="/" class="text-purple-400 hover:text-purple-300">Go back home</a>
  </div>
</div>