[**@notemine/wrapper API v0.0.4**](../README.md) • **Docs**

***

# Interface: ProgressEvent

Data structure representing a progress event during mining

## Properties

### bestPowData?

> `optional` **bestPowData**: [`BestPowData`](BestPowData.md)

Current best proof-of-work data

#### Defined in

[index.ts:26](https://github.com/sandwichfarm/minnote-wasm/blob/dc6f370600c3d4348f40a1c0bba1ae3cb37dbb5a/packages/wrapper/src/index.ts#L26)

***

### hashRate?

> `optional` **hashRate**: `number`

Current hash rate of the worker (in hashes per second)

#### Defined in

[index.ts:24](https://github.com/sandwichfarm/minnote-wasm/blob/dc6f370600c3d4348f40a1c0bba1ae3cb37dbb5a/packages/wrapper/src/index.ts#L24)

***

### workerId

> **workerId**: `number`

ID of the worker making progress

#### Defined in

[index.ts:22](https://github.com/sandwichfarm/minnote-wasm/blob/dc6f370600c3d4348f40a1c0bba1ae3cb37dbb5a/packages/wrapper/src/index.ts#L22)
