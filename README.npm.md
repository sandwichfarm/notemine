# note⛏️
**notemine** mines nostr notes, is written in rust, targets web and compiles to wasm. Variable difficulty and realtime hashrate. There's a [demo](https://sandwichfarm.github.io/notemine).

If you're looking for a native miner that leverages hardware acceleration, check out [`notemine-hw`](https://github.com/plebemineira/notemine_hw)

# bindings 

# install 
```js
npm install notemine
pnpm install notemine
yarn add notemine
```

# usage
```js
import init, { mine_event } from './pkg/notemine.js';

//You shouldn't need to pass id or sig, and created_at is optional.
const event = {
  "pubkey": "e771af0b05c8e95fcdf6feb3500544d2fb1ccd384788e9f490bb3ee28e8ed66f",
  "kind": 1,
  "tags": [],
  "content": "hello world",
}

const difficulty = 21
let cancel = false 

function reportProgress(hashRate = undefined, bestPow = undefined) {
  if(hashRate){
    console.log(`hash rate: ${hashRate}`);
  }
  if(bestPow){
    console.log('best pow: ', bestPow);
  }
}

function shouldCancel() {
  //Add some logic here
  //if it returns true, wasm should stop mining.
  return cancel 
}

const run = async () => {
  //this is synchronous.
  const minedResult = mine_event(
    event,
    difficulty,
    startNonce.toString(),
    nonceStep.toString(),
    reportProgress,
    shouldCancel
  );
}
await init({});
```

# build

## deps 
```
cargo install wasm-pack
```

## build
```
cargo clean
wasm-pack build --target web --release
```

## run demo
```
cd demo && npx serve 
```

# license
GNU General Public License v3.0