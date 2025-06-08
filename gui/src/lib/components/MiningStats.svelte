<script lang="ts">
  import { onMount } from 'svelte';
  import { miningQueue } from '$lib/services/mining-queue';
  import { db } from '$lib/services/database';
  import { fly, fade } from 'svelte/transition';
  import { powClient } from '$lib/services/pow-client';
  import type { PoWMiningProgress } from '$lib/services/pow-client';
  import MiningHistory from './MiningHistory.svelte';
  
  let showStats = false;
  let activeTab: 'stats' | 'history' = 'stats';
  let completedJobs: any[] = [];
  let totalMined = 0;
  let averageDifficulty = 0;
  let totalHashesComputed = 0;
  let averageTimePerNote = 0;
  let currentMiningProgress: Map<string, PoWMiningProgress[]> = new Map();
  let totalHashRate = 0;
  let activeJobId: string | null = null;
  
  onMount(async () => {
    // Load completed mining jobs from database
    const jobs = await db.getAllMiningJobs('completed');
    completedJobs = jobs.slice(-10).reverse(); // Last 10 completed
    
    // Calculate statistics
    totalMined = jobs.length;
    
    // Subscribe to mining progress
    if (powClient) {
      powClient.miningProgress.subscribe(progress => {
        currentMiningProgress = progress;
        
        // Calculate total hash rate
        totalHashRate = 0;
        for (const [jobId, workers] of progress) {
          activeJobId = jobId; // Track the active job
          for (const worker of workers) {
            if (worker.hashRate) {
              totalHashRate += worker.hashRate;
            }
          }
        }
      });
    }
    
    if (jobs.length > 0) {
      const difficulties = jobs.map(j => j.targetDifficulty || 21);
      averageDifficulty = difficulties.reduce((a, b) => a + b, 0) / difficulties.length;
      
      // Estimate total hashes (simplified)
      totalHashesComputed = jobs.reduce((sum, job) => {
        const difficulty = job.targetDifficulty || 21;
        return sum + Math.pow(2, difficulty);
      }, 0);
      
      // Calculate average mining time
      const miningTimes = jobs
        .filter(j => j.created_at && j.updatedAt)
        .map(j => j.updatedAt - j.created_at);
      
      if (miningTimes.length > 0) {
        averageTimePerNote = miningTimes.reduce((a, b) => a + b, 0) / miningTimes.length / 1000; // in seconds
      }
    }
  });
  
  function formatTime(seconds: number): string {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
    return `${(seconds / 3600).toFixed(1)}h`;
  }
  
  function formatNumber(num: number): string {
    if (num >= 1e12) return `${(num / 1e12).toFixed(1)}T`;
    if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
    return num.toFixed(0);
  }
  
  function getTimeAgo(timestamp: number): string {
    const seconds = (Date.now() - timestamp) / 1000;
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }
</script>

<!-- Compact Toggle Button -->
<div class="fixed bottom-20 right-4 z-40">
  <button
    on:click={() => showStats = !showStats}
    class="bg-neutral-900 border border-neutral-800 text-neutral-400 p-3 rounded-full hover:bg-neutral-800 hover:text-white transition-all duration-200 shadow-lg"
  >
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  </button>
</div>

<!-- Full Screen Mining Panel -->
{#if showStats}
  <div class="fixed inset-0 bg-neutral-950 z-50 flex flex-col" in:fly={{ x: '100%', duration: 300 }}>
    <!-- Header -->
    <div class="border-b border-neutral-800">
      <div class="flex items-center justify-between p-6">
        <div class="flex items-center gap-3">
          <svg class="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <h1 class="text-2xl font-bold text-white">Mining</h1>
        </div>
        <button
          on:click={() => showStats = false}
          class="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <!-- Tab Navigation -->
      <div class="flex gap-1 px-6 pb-0">
        <button
          on:click={() => activeTab = 'stats'}
          class="px-4 py-2 rounded-t-lg transition-colors {activeTab === 'stats' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-900'}"
        >
          Statistics
        </button>
        <button
          on:click={() => activeTab = 'history'}
          class="px-4 py-2 rounded-t-lg transition-colors {activeTab === 'history' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-900'}"
        >
          History
        </button>
      </div>
    </div>
    
    <!-- Content Area -->
    <div class="flex-1 p-6 overflow-y-auto">
      {#if activeTab === 'stats'}
        <!-- Grid Layout for Full Screen -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
        
        <!-- Left Panel: Summary Stats -->
        <div class="space-y-6">
          <h2 class="text-lg font-semibold text-white border-b border-neutral-800 pb-2">Overview</h2>
          <div class="grid grid-cols-2 gap-4">
            <div class="bg-neutral-800 rounded-lg p-4">
              <div class="text-neutral-400 text-xs mb-1">Total Mined</div>
              <div class="text-2xl font-mono text-white">{totalMined}</div>
            </div>
            <div class="bg-neutral-800 rounded-lg p-4">
              <div class="text-neutral-400 text-xs mb-1">Avg Difficulty</div>
              <div class="text-2xl font-mono text-purple-400">{averageDifficulty.toFixed(1)}</div>
            </div>
            <div class="bg-neutral-800 rounded-lg p-4">
              <div class="text-neutral-400 text-xs mb-1">Total Hashes</div>
              <div class="text-2xl font-mono text-blue-400">{formatNumber(totalHashesComputed)}</div>
            </div>
            <div class="bg-neutral-800 rounded-lg p-4">
              <div class="text-neutral-400 text-xs mb-1">Avg Time</div>
              <div class="text-2xl font-mono text-orange-400">{formatTime(averageTimePerNote)}</div>
            </div>
          </div>
        </div>
      
        <!-- Center Panel: Recent History -->
        <div class="space-y-6">
          <h2 class="text-lg font-semibold text-white border-b border-neutral-800 pb-2">Recent History</h2>
          {#if completedJobs.length > 0}
          <div class="space-y-2">
            {#each completedJobs as job (job.id)}
              <div 
                class="bg-neutral-800 rounded-lg p-3 flex items-center justify-between"
                in:fade={{ duration: 200 }}
              >
                <div class="flex-1">
                  <div class="text-sm text-white truncate pr-4">{job.content}</div>
                  <div class="text-xs text-neutral-500 mt-1">
                    {getTimeAgo(job.updatedAt)}
                  </div>
                </div>
                <div class="text-right">
                  <div class="text-xs text-neutral-400">Difficulty</div>
                  <div class="text-sm font-mono text-purple-400">{job.targetDifficulty || 21}</div>
                </div>
                {#if job.minedEvent}
                  <div class="ml-4">
                    <div class="text-xs text-green-400">✓ Mined</div>
                    <div class="text-xs font-mono text-neutral-600">
                      {job.minedEvent.id.slice(0, 8)}...
                    </div>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
          {:else}
            <div class="text-center text-neutral-500 py-8">
              No mining history yet. Start mining some notes!
            </div>
          {/if}
        </div>

        <!-- Right Panel: Live Stats & Queue -->
        <div class="space-y-6">
          <h2 class="text-lg font-semibold text-white border-b border-neutral-800 pb-2">Live Stats</h2>
          
          <!-- Current Mining Status -->
          {#if totalHashRate > 0}
          <div class="bg-gradient-to-br from-orange-900/20 to-red-900/20 border border-orange-700 rounded-lg p-4 animate-pulse">
            <div class="flex items-center justify-between mb-3">
              <div class="text-sm text-orange-400">Total Hash Rate</div>
              <div class="text-2xl font-mono text-orange-400">{(totalHashRate / 1000).toFixed(2)} KH/s</div>
            </div>
            
            <!-- Per-Worker Stats -->
            {#if activeJobId && currentMiningProgress.get(activeJobId)}
              <div class="mt-4 space-y-2">
                <div class="text-xs text-neutral-400 mb-2">Worker Performance</div>
                {#each currentMiningProgress.get(activeJobId) as worker, i}
                  <div class="flex items-center justify-between text-xs">
                    <span class="text-neutral-500">Worker {i + 1}</span>
                    <div class="flex items-center gap-2">
                      <span class="text-orange-400 font-mono">{(worker.hashRate / 1000).toFixed(2)} KH/s</span>
                      {#if (worker.bestPow || 0) > 0}
                        <span class="text-purple-400 flex items-center gap-1">
                          <span>⛏️</span>
                          <span>{worker.bestPow}</span>
                        </span>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
          {:else}
          <div class="bg-neutral-800 rounded-lg p-4 text-center">
            <div class="text-neutral-500 text-sm">No active mining</div>
          </div>
          {/if}
          
          <!-- Current Queue Status -->
          <div class="bg-neutral-800 rounded-lg p-4">
            <div class="flex items-center justify-between mb-3">
              <div class="text-sm text-neutral-400">Current Queue</div>
              <div class="text-xl font-mono text-white">{$miningQueue.queuedJobs.length}</div>
            </div>
            <div class="flex items-center justify-between">
              <div class="text-sm text-neutral-400">Completed Today</div>
              <div class="text-xl font-mono text-green-400">{$miningQueue.completedJobs.length}</div>
            </div>
          </div>
        </div>
        </div>
      {:else if activeTab === 'history'}
        <!-- Mining History Tab -->
        <div class="h-full">
          <MiningHistory />
        </div>
      {/if}
    </div>
  </div>
{/if}