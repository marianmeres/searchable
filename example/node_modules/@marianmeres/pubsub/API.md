# API Reference

Complete API documentation for `@marianmeres/pubsub`.

## Table of Contents

- [Factory Function](#factory-function)
- [PubSub Class](#pubsub-class)
  - [Constructor](#constructor)
  - [Methods](#methods)
- [Types](#types)

---

## Factory Function

### `createPubSub(options?)`

Creates a new PubSub instance. This is a convenience function equivalent to `new PubSub(options)`.

**Parameters:**
- `options` (optional): `PubSubOptions` - Configuration options

**Returns:** `PubSub` - A new PubSub instance

**Example:**
```ts
import { createPubSub } from '@marianmeres/pubsub';

const pubsub = createPubSub();

// With custom error handling
const pubsub = createPubSub({
  onError: (error, topic) => myLogger.error(error, { topic })
});
```

---

## PubSub Class

A lightweight, type-safe publish-subscribe implementation.

Supports topic-based subscriptions with wildcard (`"*"`) support for listening to all events. Subscriber errors are caught and handled without breaking other subscribers. Empty topics are automatically cleaned up when all subscribers are removed.

### Constructor

```ts
new PubSub(options?: PubSubOptions)
```

**Parameters:**
- `options` (optional): `PubSubOptions` - Configuration options

**Example:**
```ts
import { PubSub } from '@marianmeres/pubsub';

const pubsub = new PubSub();

// With silent error handling
const pubsub = new PubSub({ onError: () => {} });
```

---

### Methods

#### `publish(topic, data?)`

Publishes data to all subscribers of a topic.

Subscribers are called synchronously in the order they were added. If a subscriber throws an error, it is caught and passed to the error handler, and remaining subscribers continue to execute.

Wildcard (`"*"`) subscribers also receive the data wrapped in an envelope: `{ event: string, data: any }`.

**Parameters:**
- `topic`: `string` - The topic/event name to publish to
- `data` (optional): `any` - Data to pass to subscribers

**Returns:** `boolean` - `true` if the topic has direct subscribers, `false` otherwise

**Example:**
```ts
pubsub.publish('user:login', { userId: 123 });
pubsub.publish('notification'); // data is optional
```

---

#### `subscribe(topic, callback)`

Subscribes a callback to a topic.

Use the special topic `"*"` to subscribe to all events (wildcard subscription). Wildcard subscribers receive an envelope: `{ event: string, data: any }`.

**Parameters:**
- `topic`: `string` - The topic/event name to subscribe to, or `"*"` for all events
- `callback`: `Subscriber` - The callback function to invoke when the topic is published

**Returns:** `Unsubscriber` - An unsubscribe function that removes this subscription when called

**Example:**
```ts
// Regular subscription
const unsub = pubsub.subscribe('foo', (data) => console.log(data));

// Wildcard subscription
pubsub.subscribe('*', ({ event, data }) => console.log(event, data));

// Unsubscribe
unsub();
```

---

#### `subscribeOnce(topic, callback)`

Subscribes to a topic for only the first published event.

The subscription is automatically removed after the callback is invoked once. The callback is unsubscribed even if it throws an error.

**Parameters:**
- `topic`: `string` - The topic/event name to subscribe to
- `callback`: `Subscriber` - The callback function to invoke once

**Returns:** `Unsubscriber` - An unsubscribe function that can be used to cancel before the event fires

**Example:**
```ts
pubsub.subscribeOnce('init', (data) => {
  console.log('Initialized:', data);
});

pubsub.publish('init', { ready: true }); // logs once
pubsub.publish('init', { ready: true }); // no effect
```

---

#### `unsubscribe(topic, callback?)`

Unsubscribes a specific callback from a topic.

If no callback is provided, all subscribers for the topic are removed. Empty topics are automatically cleaned up after the last subscriber is removed.

**Parameters:**
- `topic`: `string` - The topic to unsubscribe from
- `callback` (optional): `Subscriber` - Specific callback to remove. If omitted, all subscribers are removed.

**Returns:** `boolean` - `true` if the callback was found and removed, `false` otherwise

**Example:**
```ts
// Unsubscribe specific callback
pubsub.unsubscribe('foo', myCallback);

// Unsubscribe all from topic
pubsub.unsubscribe('foo');
```

---

#### `unsubscribeAll(topic?)`

Unsubscribes all callbacks from a specific topic, or from all topics.

**Parameters:**
- `topic` (optional): `string` - Topic to clear. If omitted, all topics are cleared.

**Returns:** `boolean` - `true` if any subscriptions were removed, `false` if the topic didn't exist

**Example:**
```ts
// Clear all subscribers from a specific topic
pubsub.unsubscribeAll('foo');

// Clear all subscribers from all topics
pubsub.unsubscribeAll();
```

---

#### `isSubscribed(topic, callback, considerWildcard?)`

Checks if a callback is subscribed to a topic.

By default, also considers wildcard (`"*"`) subscriptions. A callback subscribed to `"*"` is considered subscribed to all topics.

**Parameters:**
- `topic`: `string` - The topic to check
- `callback`: `Subscriber` - The callback to look for
- `considerWildcard` (optional): `boolean` - Whether to include wildcard subscriptions in the check (default: `true`)

**Returns:** `boolean` - `true` if the callback is subscribed to the topic, `false` otherwise

**Example:**
```ts
pubsub.subscribe('*', myCallback);
pubsub.isSubscribed('foo', myCallback);        // true (via wildcard)
pubsub.isSubscribed('foo', myCallback, false); // false (excluding wildcard)
```

---

## Types

### `Subscriber`

```ts
type Subscriber = (detail: any) => void;
```

Callback function that receives published data. For regular subscriptions, receives the published data directly. For wildcard (`"*"`) subscriptions, receives an envelope with `event` and `data` properties.

---

### `Unsubscriber`

```ts
type Unsubscriber = () => void | boolean;
```

Function returned by subscribe methods to remove the subscription. Can be called multiple times safely (subsequent calls are no-ops).

---

### `ErrorHandler`

```ts
type ErrorHandler = (error: Error, topic: string, isWildcard: boolean) => void;
```

Custom error handler for subscriber errors. Called when a subscriber throws an error during publish.

**Parameters:**
- `error`: `Error` - The error that was thrown by the subscriber
- `topic`: `string` - The topic that was being published to
- `isWildcard`: `boolean` - `true` if the error came from a wildcard (`"*"`) subscriber

---

### `PubSubOptions`

```ts
interface PubSubOptions {
  onError?: ErrorHandler;
}
```

Configuration options for PubSub instance.

**Properties:**
- `onError` (optional): `ErrorHandler` - Custom error handler for subscriber errors. By default, errors are logged to `console.error`. Set to `() => {}` for silent mode.
