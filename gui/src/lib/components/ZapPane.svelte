<script lang="ts">
  import { onMount } from 'svelte';
  import { Zap, Copy, Check, Loader, ExternalLink } from 'lucide-svelte';
  import { reactionsService } from '$lib/services/reactions';
  import type { NostrEvent } from '$lib/types/nostr';
  import QRCode from 'qrcode';
  
  let event: NostrEvent | null = null;
  let pubkey: string | null = null;
  
  // Get event data from global context on mount
  onMount(() => {
    console.log('ZapPane mounted, checking for zapEventData...');
    
    // Try multiple approaches to get the data
    if (typeof window !== 'undefined') {
      // Try direct property first
      if ((window as any).zapEventData) {
        const data = (window as any).zapEventData;
        console.log('Found zapEventData:', data);
        event = data.event || null;
        pubkey = data.pubkey || null;
        console.log('Set event:', event?.id, 'pubkey:', pubkey);
        // Clear the global data
        delete (window as any).zapEventData;
        return;
      }
      
      // Try localStorage as backup
      const storedData = localStorage.getItem('tempZapData');
      if (storedData) {
        try {
          const data = JSON.parse(storedData);
          console.log('Found stored zap data:', data);
          event = data.event || null;
          pubkey = data.pubkey || null;
          console.log('Set event from storage:', event?.id, 'pubkey:', pubkey);
          // Clear the stored data
          localStorage.removeItem('tempZapData');
          return;
        } catch (e) {
          console.error('Failed to parse stored zap data:', e);
        }
      }
    }
    
    console.log('No zapEventData found anywhere');
  });
  
  let amountSats = 21;
  let comment = '';
  let invoice = '';
  let qrCodeUrl = '';
  let isLoading = false;
  let error = '';
  let copied = false;
  
  const presetAmounts = [21, 100, 500, 1000, 5000, 10000];
  
  // Get event/profile info
  $: targetName = event ? 
    `Note by ${event.pubkey.slice(0, 8)}...` : 
    pubkey ? `Profile ${pubkey.slice(0, 8)}...` : 'Unknown';
  
  async function generateInvoice() {
    console.log('generateInvoice called with:', { event: event?.id, pubkey, amountSats });
    isLoading = true;
    error = '';
    invoice = '';
    qrCodeUrl = '';
    
    try {
      if (event) {
        console.log('Creating zap invoice for event:', event.id);
        invoice = await reactionsService.createZapInvoice(event.id, amountSats, comment);
        console.log('Successfully created zap invoice, length:', invoice?.length);
      } else if (pubkey) {
        console.log('Creating zap invoice for pubkey:', pubkey);
        invoice = await reactionsService.createProfileZapInvoice(pubkey, amountSats, comment);
        console.log('Successfully created profile zap invoice, length:', invoice?.length);
      } else {
        console.error('No event or pubkey available when generating invoice');
        throw new Error('No event or pubkey provided');
      }
      
      // Generate QR code
      qrCodeUrl = await QRCode.toDataURL(`lightning:${invoice}`, {
        color: {
          dark: '#22c55e',
          light: '#000000'
        },
        width: 256
      });
    } catch (err) {
      console.error('Error generating zap invoice:', err);
      error = err instanceof Error ? err.message : 'Failed to generate invoice';
    } finally {
      isLoading = false;
    }
  }
  
  async function copyInvoice() {
    try {
      await navigator.clipboard.writeText(invoice);
      copied = true;
      setTimeout(() => copied = false, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }
  
  function openInWallet() {
    window.open(`lightning:${invoice}`, '_blank');
  }
  
  function resetForm() {
    invoice = '';
    qrCodeUrl = '';
    error = '';
    comment = '';
  }
</script>

<div class="h-full flex flex-col bg-black text-green-400 font-mono">
  <!-- Header -->
  <div class="p-2 border-b border-green-800 bg-green-900/10">
    <div class="flex items-center gap-2">
      <Zap class="w-4 h-4" />
      <h2 class="text-sm font-bold">ZAP {targetName}</h2>
    </div>
  </div>
  
  <!-- Content -->
  <div class="flex-1 overflow-y-auto p-4">
    {#if !invoice}
      <!-- Amount Selection -->
      <div class="space-y-4">
        <div>
          <label class="text-green-600 text-xs block mb-2">AMOUNT (SATS)</label>
          <div class="grid grid-cols-3 gap-2">
            {#each presetAmounts as amount}
              <button
                onclick={() => amountSats = amount}
                class="px-3 py-2 text-xs border rounded transition-colors
                       {amountSats === amount 
                         ? 'bg-green-900 border-green-400 text-green-400' 
                         : 'border-green-800 text-green-600 hover:border-green-600'}"
              >
                {amount.toLocaleString()}
              </button>
            {/each}
          </div>
          <input
            type="number"
            bind:value={amountSats}
            min="1"
            class="mt-2 w-full bg-transparent border border-green-800 px-3 py-2 text-green-400
                   text-sm rounded focus:border-green-600 focus:outline-none"
            placeholder="Custom amount..."
          />
        </div>
        
        <!-- Comment -->
        <div>
          <label class="text-green-600 text-xs block mb-1">COMMENT (OPTIONAL)</label>
          <textarea
            bind:value={comment}
            rows="3"
            class="w-full bg-transparent border border-green-800 px-3 py-2 text-green-400
                   text-sm rounded focus:border-green-600 focus:outline-none resize-none"
            placeholder="Add a comment with your zap..."
          />
        </div>
        
        <!-- Error -->
        {#if error}
          <div class="text-red-400 text-xs p-2 bg-red-900/20 border border-red-800 rounded">
            {error}
          </div>
        {/if}
      </div>
    {:else}
      <!-- Invoice Display -->
      <div class="space-y-4">
        <div class="text-center">
          <div class="text-green-400 text-3xl font-bold mb-1">
            {amountSats.toLocaleString()} sats
          </div>
          {#if comment}
            <div class="text-green-600 text-sm italic">"{comment}"</div>
          {/if}
        </div>
        
        <!-- QR Code -->
        {#if qrCodeUrl}
          <div class="flex justify-center p-4 bg-white rounded">
            <img src={qrCodeUrl} alt="Lightning invoice QR code" />
          </div>
        {/if}
        
        <!-- Invoice Text -->
        <div>
          <label class="text-green-600 text-xs block mb-1">INVOICE</label>
          <div class="relative">
            <div class="bg-green-950/30 border border-green-800 rounded p-3 text-xs
                        font-mono text-green-600 break-all max-h-32 overflow-y-auto">
              {invoice}
            </div>
            <button
              onclick={copyInvoice}
              class="absolute top-2 right-2 p-1 hover:bg-green-900/50 rounded"
              title="Copy invoice"
            >
              {#if copied}
                <Check class="w-4 h-4 text-green-400" />
              {:else}
                <Copy class="w-4 h-4 text-green-600" />
              {/if}
            </button>
          </div>
        </div>
        
        <!-- Expiry Warning -->
        <div class="text-yellow-400 text-xs text-center">
          ⚠️ Invoice expires in ~10 minutes
        </div>
      </div>
    {/if}
  </div>
  
  <!-- Footer Actions -->
  <div class="p-4 border-t border-green-800 bg-green-900/10">
    {#if !invoice}
      <button
        onclick={generateInvoice}
        disabled={isLoading || amountSats < 1}
        class="w-full px-4 py-2 bg-green-900 hover:bg-green-800 disabled:bg-green-950
               disabled:opacity-50 border border-green-600 rounded text-green-400
               font-bold flex items-center justify-center gap-2 transition-colors"
      >
        {#if isLoading}
          <Loader class="w-4 h-4 animate-spin" />
          Generating Invoice...
        {:else}
          <Zap class="w-4 h-4" />
          Generate Invoice
        {/if}
      </button>
    {:else}
      <div class="space-y-2">
        <button
          onclick={openInWallet}
          class="w-full px-3 py-2 bg-green-900 hover:bg-green-800 border border-green-600
                 rounded text-green-400 text-sm font-bold flex items-center justify-center gap-2"
        >
          <ExternalLink class="w-4 h-4" />
          Open in Wallet
        </button>
        
        <div class="grid grid-cols-2 gap-2">
          <button
            onclick={copyInvoice}
            class="px-3 py-2 bg-transparent hover:bg-green-900/30 border border-green-800
                   rounded text-green-600 text-sm flex items-center justify-center gap-1"
          >
            <Copy class="w-3 h-3" />
            Copy
          </button>
          
          <button
            onclick={resetForm}
            class="px-3 py-2 bg-transparent hover:bg-green-900/30 border border-green-800
                   rounded text-green-600 text-sm"
          >
            New Invoice
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>