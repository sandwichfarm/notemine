# note⛏️ (js)

[![npm](https://img.shields.io/npm/v/notemine)]( https://www.npmjs.com/package/notemine )
[![build](https://github.com/sandwichfarm/notemine-js/actions/workflows/build.yaml/badge.svg)]( https://github.com/sandwichfarm/notemine-js/actions/workflows/build.yaml ) 
[![test](https://github.com/sandwichfarm/notemine-js/actions/workflows/test.yaml/badge.svg)]( https://github.com/sandwichfarm/notemine-js/actions/workflows/test.yaml )

`@notemine/wrapper` is a typescript module that wraps [notemine](https://github.com/sandwichfarm/notemine) `wasm-bindgen` interfaces. More convenient and has added observables for more consistent use throughout modern web stacks. 

## install
package name: `@notemine/wrapper`

**npm**
```bash
  npm install @notemine/wrapper
```

<details>
<summary>pnpm</summary>

```bash
  pnpm install @notemine/wrapper
```
</details>

<details>
<summary>yarn</summary>

```bash
  yarn install @notemine/wrapper
```
</details>

## usage 
_untested_

```typescript 
  import Notemine from "@notemine/wrapper"

  //prepare meta for event 
  const content = "hello world."
  const tags = [ "#t", "introduction"]
  const pubkey = "e771af0b05c8e95fcdf6feb3500544d2fb1ccd384788e9f490bb3ee28e8ed66f"

  //set options for notemine 
  const difficulty = 21
  const numberOfWorkers = 7
 

  const notemine = new Notemine({
    content,
    tags,
    difficulty,
    numberOfWorkers    
  })

  //you can also set content, tags and pubkey via assessors after initialization. 
  notemine.pubkey = pubkey

  //start notemine
  notemine.mine()
```

Updates to notemine can be accessed via observables.
```
notemine.progress$
notemine.error$
notemine.cancelled$
notemine.success$
```



<details>
<summary>svelte</summary>

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { type Writable, writable } from 'svelte/store';
  import { type ProgressEvent, Notemine } from '@notemine/wrapper';


  const numberOfMiners = 8
  let notemine: Notemine;
  let progress: Writable<ProgressEvent[]> = new writable(new Array(numberOfMiners))
  let success: Writeable<SuccessEvent> = new writable(null)

  onMount(() => {
    notemine = new Notemine({ content: 'Hello, Nostr!', numberOfMiners  });

    const progress$ = miner.progress$.subscribe(progress_ => {
      progress.update( _progress => {
        _progress[progress_.workerId] = progress_
        return _progress
      })
    });

    const success$ = miner.progress$.subscribe(success_ => {
      const {event, totalTime, hashRate}
      success.update( _success => {
        _success = success_
        return _success
      })
      miner.cancel();
    });

    notemine.mine();

    return () => {
      progress$.unsubscribe();
      success$.unsubscribe();
      miner.cancel();
    };
  });
  $: miners = $progress
</script>


<div>
{#each $miners as miner}
<span>Miner #{miner.workerId}: {miner.hashRate}kH/s [Best PoW: ${miner.bestPowData}]
{/each}

{#if($success !== null)}
  <pre>
  {$success.event}
  </pre>
{/if}

</div>
```
</details>



<details>
<summary>react</summary>

```reactjs
  import React, { useEffect } from 'react';
  import { Notemine } from '@notemine/wrapper';

  const MyComponent = () => {
    const notemine = new Notemine({ content: 'Hello, Nostr!' });

    useEffect(() => {
      const subscription = notemine.progress$.subscribe(progress => {
        // Update progress bar or display notemine's progress
      });

      notemine.mine();

      return () => {
        subscription.unsubscribe();
        notemine.cancel();
      };
    }, []);

    return (
      <div>
        {/* Your UI components */}
      </div>
    );
  };

```
</details>

<details>
<summary>vue</summary>

```vue
<template>
  <div>
    <!-- Your UI components -->
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, onUnmounted } from 'vue';
import { Notemine } from '@notemine/wrapper';

export default defineComponent({
  name: 'MinerComponent',
  setup() {
    const notemine = new Notemine({ content: 'Hello, Nostr!' });

    onMounted(() => {
      const subscription = notemine.progress$.subscribe(progress => {
        // Update progress bar or display notemine's progress
      });

      notemine.mine();

      onUnmounted(() => {
        subscription.unsubscribe();
        notemine.cancel();
      });
    });

    return {};
  },
});
</script>

```
</details>

<details>
<summary>angular</summary>

```javascript
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Notemine } from '@notemine/wrapper';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-notemine',
  templateUrl: './notemine.component.html',
})
export class MinerComponent implements OnInit, OnDestroy {
  notemine: Notemine;
  progressSubscription: Subscription;

  ngOnInit() {
    this.notemine = new Notemine({ content: 'Hello, Nostr!' });
    this.progressSubscription = this.notemine.progress$.subscribe(progress => {
      // Update progress bar or display notemine's progress
    });

    this.notemine.mine();
  }

  ngOnDestroy() {
    this.progressSubscription.unsubscribe();
    this.notemine.cancel();
  }
}
```
</details>

## build
The wasm is not included in version control, so to build you'll need rust and it's toolchain. That includes `rustup` and `cargo`

### install build deps

Install **wasm-pack** with `cargo install wasm-pack` 

### build wasm 
Build the wasm with `build:wasm` 

**npm**

```bash
  npm build:wasm
```

<details>
<summary>pnpm</summary>

```bash
  pnpm build:wasm
```
</details>

<details>
<summary>yarn</summary>

```bash
  yarn build:wasm
```
</details>

### build package 

Build the package with `build` 
**npm**

```bash
  npm run build
```

<details>
<summary>pnpm</summary>

```bash
  pnpm run build
```
</details>

<details>
<summary>yarn</summary>

```bash
  yarn build
```
</details>

### test 
<details>
<summary>npm</summary>

```bash
  npm run build
```
</details>

<details>
<summary>pnpm</summary>

```bash
  pnpm run build
```
</details>

<details>
<summary>yarn</summary>

```bash
  yarn build
```
</details>
