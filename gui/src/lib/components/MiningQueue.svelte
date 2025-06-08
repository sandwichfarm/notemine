<script lang="ts">
  import type { MiningJob } from '$lib/services/mining-queue';
  import { miningQueue } from '$lib/services/mining-queue';
  
  export let jobs: MiningJob[] = [];
  
  let selectedIndex = 0;
  let showCompleted = false;
  let currentHashRate = 0;
  
  // Get hash rate from active mining job
  $: {
    const activeJob = jobs.find(job => job.status === 'mining');
    currentHashRate = activeJob?.hashRate || 0;
  }
  
  // Filter jobs based on completion visibility
  $: filteredJobs = showCompleted ? jobs : jobs.filter(job => job.status !== 'completed');
  $: maxIndex = Math.max(0, filteredJobs.length - 1);
  
  // Ensure selected index is valid
  $: if (selectedIndex > maxIndex) selectedIndex = maxIndex;
  
  function getStatusSymbol(status: string) {
    switch (status) {
      case 'queued': return '⏳';
      case 'mining': return '⚡';
      case 'paused': return '⏸️';
      case 'completed': return '✓';
      default: return '?';
    }
  }
  
  function getStatusColor(status: string) {
    switch (status) {
      case 'queued': return 'text-orange-400';
      case 'mining': return 'text-yellow-400';
      case 'paused': return 'text-blue-400';
      case 'completed': return 'text-green-400';
      default: return 'text-gray-400';
    }
  }
  
  function moveUp(index: number) {
    if (index > 0) {
      const jobIds = filteredJobs.map(job => job.id);
      // Swap positions
      [jobIds[index], jobIds[index - 1]] = [jobIds[index - 1], jobIds[index]];
      miningQueue.reorderQueue(jobIds);
      selectedIndex = index - 1;
    }
  }
  
  function moveDown(index: number) {
    if (index < filteredJobs.length - 1) {
      const jobIds = filteredJobs.map(job => job.id);
      // Swap positions
      [jobIds[index], jobIds[index + 1]] = [jobIds[index + 1], jobIds[index]];
      miningQueue.reorderQueue(jobIds);
      selectedIndex = index + 1;
    }
  }
  
  function removeJob(jobId: string) {
    miningQueue.removeJob(jobId);
  }
  
  function pauseJob(jobId: string) {
    // Implementation depends on mining service
  }
  
  function resumeJob(jobId: string) {
    miningQueue.resumeJob(jobId);
  }
  
  // Keyboard navigation
  function handleKeydown(e: KeyboardEvent) {
    if (filteredJobs.length === 0) return;
    
    switch (e.key) {
      case 'ArrowUp':
      case 'k':
        e.preventDefault();
        selectedIndex = Math.max(0, selectedIndex - 1);
        break;
      case 'ArrowDown':
      case 'j':
        e.preventDefault();
        selectedIndex = Math.min(maxIndex, selectedIndex + 1);
        break;
      case 'Delete':
      case 'x':
        e.preventDefault();
        if (filteredJobs[selectedIndex]) {
          removeJob(filteredJobs[selectedIndex].id);
        }
        break;
      case ' ':
        e.preventDefault();
        const job = filteredJobs[selectedIndex];
        if (job) {
          if (job.status === 'paused') {
            resumeJob(job.id);
          } else if (job.status === 'queued' || job.status === 'mining') {
            pauseJob(job.id);
          }
        }
        break;
    }
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div 
  class="bg-black p-2 font-mono text-xs text-green-400 max-w-sm focus:outline-none"
  tabindex="0"
  on:keydown={handleKeydown}
>
  <div class="flex justify-between items-center mb-1">
    <span>MINING_QUEUE[{filteredJobs.length}/{jobs.length}]</span>
    <div class="flex items-center gap-2">
      {#if currentHashRate > 0}
        <span class="text-orange-400 text-xs animate-pulse">
          {(currentHashRate / 1000).toFixed(1)} KH/s
        </span>
      {/if}
      <button 
        on:click={() => showCompleted = !showCompleted}
        class="text-green-600 hover:text-green-400"
        title="Toggle completed jobs"
      >
        {showCompleted ? '👁️' : '👁️‍🗨️'}
      </button>
    </div>
  </div>
  
  {#if filteredJobs.length > 0}
    <div class="space-y-1 mb-2">
      {#each filteredJobs as job, i}
        <div 
          class="flex items-center space-x-2 p-1 rounded {i === selectedIndex ? 'bg-green-900/20 border border-green-800' : 'hover:bg-green-900/10'}"
          class:selected={i === selectedIndex}
        >
          <span class="{getStatusColor(job.status)}">{getStatusSymbol(job.status)}</span>
          <span class="text-green-600">D{job.difficulty}</span>
          <span class="flex-1 truncate opacity-70">{job.content}</span>
          
          <!-- Controls for selected item -->
          {#if i === selectedIndex}
            <div class="flex gap-1">
              {#if i > 0}
                <button 
                  on:click={() => moveUp(i)}
                  class="text-blue-400 hover:text-blue-300"
                  title="Move up"
                >↑</button>
              {/if}
              {#if i < filteredJobs.length - 1}
                <button 
                  on:click={() => moveDown(i)}
                  class="text-blue-400 hover:text-blue-300"
                  title="Move down"
                >↓</button>
              {/if}
              <button 
                on:click={() => removeJob(job.id)}
                class="text-red-400 hover:text-red-300"
                title="Remove"
              >✕</button>
            </div>
          {/if}
          
          {#if job.status === 'mining'}
            <span class="text-yellow-400 animate-pulse">⚡</span>
          {/if}
        </div>
      {/each}
    </div>
    
    <!-- Help text -->
    <div class="text-green-600 text-xs opacity-60 border-t border-green-800 pt-1">
      <div>↑↓/jk: navigate | Space: pause/resume | x/Del: remove</div>
    </div>
  {:else}
    <div class="text-green-600 text-center py-4">
      <p class="mb-1">No mining jobs in queue</p>
      <p class="text-xs opacity-70">Create a note to start mining</p>
    </div>
  {/if}
</div>