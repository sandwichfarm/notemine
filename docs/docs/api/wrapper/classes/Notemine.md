[**@notemine/wrapper API v0.1.0**](../README.md)

***

# Class: Notemine

Defined in: [index.ts:76](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L76)

Class representing a miner for Notemine events

## Constructors

### new Notemine()

> **new Notemine**(`options`?): [`Notemine`](Notemine.md)

Defined in: [index.ts:121](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L121)

Creates a new Notemine miner instance

#### Parameters

##### options?

[`MinerOptions`](../interfaces/MinerOptions.md)

Configuration options for the miner

#### Returns

[`Notemine`](Notemine.md)

## Properties

### cancelled$

> **cancelled$**: `BehaviorSubject`\<`boolean`\>

Defined in: [index.ts:93](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L93)

Observable indicating if mining was cancelled

***

### cancelledEvent$

> **cancelledEvent$**: `Observable`\<[`CancelledEvent`](../interfaces/CancelledEvent.md)\>

Defined in: [index.ts:113](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L113)

Observable for mining cancellations

***

### error$

> **error$**: `Observable`\<[`ErrorEvent`](../interfaces/ErrorEvent.md)\>

Defined in: [index.ts:111](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L111)

Observable for errors encountered during mining

***

### highestPow$

> **highestPow$**: `BehaviorSubject`\<`null` \| [`WorkerPow`](../interfaces/WorkerPow.md)\>

Defined in: [index.ts:101](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L101)

Observable for the worker that found the best proof-of-work

***

### mining$

> **mining$**: `BehaviorSubject`\<`boolean`\>

Defined in: [index.ts:91](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L91)

Observable indicating whether mining is currently active

***

### progress$

> **progress$**: `Observable`\<[`ProgressEvent`](../interfaces/ProgressEvent.md)\>

Defined in: [index.ts:109](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L109)

Observable for mining progress updates

***

### result$

> **result$**: `BehaviorSubject`\<`null` \| [`MinedResult`](../interfaces/MinedResult.md)\>

Defined in: [index.ts:95](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L95)

Observable for the result of the mining operation

***

### success$

> **success$**: `Observable`\<[`SuccessEvent`](../interfaces/SuccessEvent.md)\>

Defined in: [index.ts:115](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L115)

Observable for successful mining results

***

### workers$

> **workers$**: `BehaviorSubject`\<`Worker`[]\>

Defined in: [index.ts:97](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L97)

Observable for the list of active workers

***

### workersPow$

> **workersPow$**: `BehaviorSubject`\<`Record`\<`number`, [`BestPowData`](../interfaces/BestPowData.md)\>\>

Defined in: [index.ts:99](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L99)

Observable tracking the proof-of-work data for each worker

***

### \_defaultTags

> `static` **\_defaultTags**: `string`[][]

Defined in: [index.ts:88](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L88)

## Accessors

### content

#### Get Signature

> **get** **content**(): `string`

Defined in: [index.ts:135](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L135)

Gets the current mining content

##### Returns

`string`

#### Set Signature

> **set** **content**(`content`): `void`

Defined in: [index.ts:130](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L130)

Sets the content to be used in the mining event

##### Parameters

###### content

`string`

##### Returns

`void`

***

### difficulty

#### Get Signature

> **get** **difficulty**(): `number`

Defined in: [index.ts:165](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L165)

Gets the current mining difficulty

##### Returns

`number`

#### Set Signature

> **set** **difficulty**(`difficulty`): `void`

Defined in: [index.ts:160](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L160)

Sets the mining difficulty

##### Parameters

###### difficulty

`number`

##### Returns

`void`

***

### lastRefresh

#### Get Signature

> **get** **lastRefresh**(): `number`

Defined in: [index.ts:185](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L185)

Gets the last refresh interval

##### Returns

`number`

#### Set Signature

> **set** **lastRefresh**(`interval`): `void`

Defined in: [index.ts:180](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L180)

Sets the last refresh interval

##### Parameters

###### interval

`number`

##### Returns

`void`

***

### numberOfWorkers

#### Get Signature

> **get** **numberOfWorkers**(): `number`

Defined in: [index.ts:175](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L175)

Gets the number of workers currently being used

##### Returns

`number`

#### Set Signature

> **set** **numberOfWorkers**(`numberOfWorkers`): `void`

Defined in: [index.ts:170](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L170)

Sets the number of workers for mining

##### Parameters

###### numberOfWorkers

`number`

##### Returns

`void`

***

### pubkey

#### Get Signature

> **get** **pubkey**(): `string`

Defined in: [index.ts:155](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L155)

Gets the current public key

##### Returns

`string`

#### Set Signature

> **set** **pubkey**(`pubkey`): `void`

Defined in: [index.ts:150](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L150)

Sets the public key for the event

##### Parameters

###### pubkey

`string`

##### Returns

`void`

***

### tags

#### Get Signature

> **get** **tags**(): `string`[][]

Defined in: [index.ts:145](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L145)

Gets the current tags

##### Returns

`string`[][]

#### Set Signature

> **set** **tags**(`tags`): `void`

Defined in: [index.ts:140](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L140)

Sets the tags to be used in the mining event

##### Parameters

###### tags

`string`[][]

##### Returns

`void`

***

### totalHashRate

#### Get Signature

> **get** **totalHashRate**(): `number`

Defined in: [index.ts:190](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L190)

Gets the total hash rate achieved

##### Returns

`number`

## Methods

### cancel()

> **cancel**(): `void`

Defined in: [index.ts:226](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L226)

Cancels the mining process

#### Returns

`void`

***

### mine()

> **mine**(): `Promise`\<`void`\>

Defined in: [index.ts:197](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L197)

Starts the mining process. Throws an error if pubkey or content is not set.

#### Returns

`Promise`\<`void`\>

***

### stop()

> **stop**(): `void`

Defined in: [index.ts:221](https://github.com/sandwichfarm/minnote-wasm/blob/41b3a43b3f031ef371ed1ca6da826ba1065c7889/packages/wrapper/src/index.ts#L221)

Stops the mining process

#### Returns

`void`
