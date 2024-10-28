[**@notemine/wrapper API v0.0.4**](../README.md) • **Docs**

***

# Class: Notemine

Class representing a miner for Notemine events

## Constructors

### new Notemine()

> **new Notemine**(`options`?): [`Notemine`](Notemine.md)

Creates a new Notemine miner instance

#### Parameters

• **options?**: [`MinerOptions`](../interfaces/MinerOptions.md)

Configuration options for the miner

#### Returns

[`Notemine`](Notemine.md)

#### Defined in

[index.ts:121](https://github.com/sandwichfarm/minnote-wasm/blob/dc6f370600c3d4348f40a1c0bba1ae3cb37dbb5a/packages/wrapper/src/index.ts#L121)

## Properties

### cancelled$

> **cancelled$**: `BehaviorSubject`\<`boolean`\>

Observable indicating if mining was cancelled

#### Defined in

[index.ts:93](https://github.com/sandwichfarm/minnote-wasm/blob/dc6f370600c3d4348f40a1c0bba1ae3cb37dbb5a/packages/wrapper/src/index.ts#L93)

***

### cancelledEvent$

> **cancelledEvent$**: `Observable`\<[`CancelledEvent`](../interfaces/CancelledEvent.md)\>

Observable for mining cancellations

#### Defined in

[index.ts:113](https://github.com/sandwichfarm/minnote-wasm/blob/dc6f370600c3d4348f40a1c0bba1ae3cb37dbb5a/packages/wrapper/src/index.ts#L113)

***

### error$

> **error$**: `Observable`\<[`ErrorEvent`](../interfaces/ErrorEvent.md)\>

Observable for errors encountered during mining

#### Defined in

[index.ts:111](https://github.com/sandwichfarm/minnote-wasm/blob/dc6f370600c3d4348f40a1c0bba1ae3cb37dbb5a/packages/wrapper/src/index.ts#L111)

***

### highestPow$

> **highestPow$**: `BehaviorSubject`\<`null` \| [`WorkerPow`](../interfaces/WorkerPow.md)\>

Observable for the worker that found the best proof-of-work

#### Defined in

[index.ts:101](https://github.com/sandwichfarm/minnote-wasm/blob/dc6f370600c3d4348f40a1c0bba1ae3cb37dbb5a/packages/wrapper/src/index.ts#L101)

***

### mining$

> **mining$**: `BehaviorSubject`\<`boolean`\>

Observable indicating whether mining is currently active

#### Defined in

[index.ts:91](https://github.com/sandwichfarm/minnote-wasm/blob/dc6f370600c3d4348f40a1c0bba1ae3cb37dbb5a/packages/wrapper/src/index.ts#L91)

***

### progress$

> **progress$**: `Observable`\<[`ProgressEvent`](../interfaces/ProgressEvent.md)\>

Observable for mining progress updates

#### Defined in

[index.ts:109](https://github.com/sandwichfarm/minnote-wasm/blob/dc6f370600c3d4348f40a1c0bba1ae3cb37dbb5a/packages/wrapper/src/index.ts#L109)

***

### result$

> **result$**: `BehaviorSubject`\<`null` \| [`MinedResult`](../interfaces/MinedResult.md)\>

Observable for the result of the mining operation

#### Defined in

[index.ts:95](https://github.com/sandwichfarm/minnote-wasm/blob/dc6f370600c3d4348f40a1c0bba1ae3cb37dbb5a/packages/wrapper/src/index.ts#L95)

***

### success$

> **success$**: `Observable`\<[`SuccessEvent`](../interfaces/SuccessEvent.md)\>

Observable for successful mining results

#### Defined in

[index.ts:115](https://github.com/sandwichfarm/minnote-wasm/blob/dc6f370600c3d4348f40a1c0bba1ae3cb37dbb5a/packages/wrapper/src/index.ts#L115)

***

### workers$

> **workers$**: `BehaviorSubject`\<`Worker`[]\>

Observable for the list of active workers

#### Defined in

[index.ts:97](https://github.com/sandwichfarm/minnote-wasm/blob/dc6f370600c3d4348f40a1c0bba1ae3cb37dbb5a/packages/wrapper/src/index.ts#L97)

***

### workersPow$

> **workersPow$**: `BehaviorSubject`\<`Record`\<`number`, [`BestPowData`](../interfaces/BestPowData.md)\>\>

Observable tracking the proof-of-work data for each worker

#### Defined in

[index.ts:99](https://github.com/sandwichfarm/minnote-wasm/blob/dc6f370600c3d4348f40a1c0bba1ae3cb37dbb5a/packages/wrapper/src/index.ts#L99)

***

### \_defaultTags

> `static` **\_defaultTags**: `string`[][]

#### Defined in

[index.ts:88](https://github.com/sandwichfarm/minnote-wasm/blob/dc6f370600c3d4348f40a1c0bba1ae3cb37dbb5a/packages/wrapper/src/index.ts#L88)

## Accessors

### content

> `get` **content**(): `string`

Gets the current mining content

> `set` **content**(`content`): `void`

Sets the content to be used in the mining event

#### Parameters

• **content**: `string`

#### Returns

`string`

#### Defined in

[index.ts:135](https://github.com/sandwichfarm/minnote-wasm/blob/dc6f370600c3d4348f40a1c0bba1ae3cb37dbb5a/packages/wrapper/src/index.ts#L135)

***

### difficulty

> `get` **difficulty**(): `number`

Gets the current mining difficulty

> `set` **difficulty**(`difficulty`): `void`

Sets the mining difficulty

#### Parameters

• **difficulty**: `number`

#### Returns

`number`

#### Defined in

[index.ts:165](https://github.com/sandwichfarm/minnote-wasm/blob/dc6f370600c3d4348f40a1c0bba1ae3cb37dbb5a/packages/wrapper/src/index.ts#L165)

***

### lastRefresh

> `get` **lastRefresh**(): `number`

Gets the last refresh interval

> `set` **lastRefresh**(`interval`): `void`

Sets the last refresh interval

#### Parameters

• **interval**: `number`

#### Returns

`number`

#### Defined in

[index.ts:185](https://github.com/sandwichfarm/minnote-wasm/blob/dc6f370600c3d4348f40a1c0bba1ae3cb37dbb5a/packages/wrapper/src/index.ts#L185)

***

### numberOfWorkers

> `get` **numberOfWorkers**(): `number`

Gets the number of workers currently being used

> `set` **numberOfWorkers**(`numberOfWorkers`): `void`

Sets the number of workers for mining

#### Parameters

• **numberOfWorkers**: `number`

#### Returns

`number`

#### Defined in

[index.ts:175](https://github.com/sandwichfarm/minnote-wasm/blob/dc6f370600c3d4348f40a1c0bba1ae3cb37dbb5a/packages/wrapper/src/index.ts#L175)

***

### pubkey

> `get` **pubkey**(): `string`

Gets the current public key

> `set` **pubkey**(`pubkey`): `void`

Sets the public key for the event

#### Parameters

• **pubkey**: `string`

#### Returns

`string`

#### Defined in

[index.ts:155](https://github.com/sandwichfarm/minnote-wasm/blob/dc6f370600c3d4348f40a1c0bba1ae3cb37dbb5a/packages/wrapper/src/index.ts#L155)

***

### tags

> `get` **tags**(): `string`[][]

Gets the current tags

> `set` **tags**(`tags`): `void`

Sets the tags to be used in the mining event

#### Parameters

• **tags**: `string`[][]

#### Returns

`string`[][]

#### Defined in

[index.ts:145](https://github.com/sandwichfarm/minnote-wasm/blob/dc6f370600c3d4348f40a1c0bba1ae3cb37dbb5a/packages/wrapper/src/index.ts#L145)

***

### totalHashRate

> `get` **totalHashRate**(): `number`

Gets the total hash rate achieved

#### Returns

`number`

#### Defined in

[index.ts:190](https://github.com/sandwichfarm/minnote-wasm/blob/dc6f370600c3d4348f40a1c0bba1ae3cb37dbb5a/packages/wrapper/src/index.ts#L190)

## Methods

### cancel()

> **cancel**(): `void`

Cancels the mining process

#### Returns

`void`

#### Defined in

[index.ts:226](https://github.com/sandwichfarm/minnote-wasm/blob/dc6f370600c3d4348f40a1c0bba1ae3cb37dbb5a/packages/wrapper/src/index.ts#L226)

***

### mine()

> **mine**(): `Promise`\<`void`\>

Starts the mining process. Throws an error if pubkey or content is not set.

#### Returns

`Promise`\<`void`\>

#### Defined in

[index.ts:197](https://github.com/sandwichfarm/minnote-wasm/blob/dc6f370600c3d4348f40a1c0bba1ae3cb37dbb5a/packages/wrapper/src/index.ts#L197)

***

### stop()

> **stop**(): `void`

Stops the mining process

#### Returns

`void`

#### Defined in

[index.ts:221](https://github.com/sandwichfarm/minnote-wasm/blob/dc6f370600c3d4348f40a1c0bba1ae3cb37dbb5a/packages/wrapper/src/index.ts#L221)
