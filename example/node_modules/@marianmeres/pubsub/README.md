# @marianmeres/pubsub

[![NPM version](https://img.shields.io/npm/v/@marianmeres/pubsub)](https://www.npmjs.com/package/@marianmeres/pubsub)
[![JSR version](https://jsr.io/badges/@marianmeres/pubsub)](https://jsr.io/@marianmeres/pubsub)

Lightweight, type-safe publish-subscribe implementation with zero dependencies.

## Features

- **Wildcard subscriptions** - Subscribe to all events with `"*"` topic
- **Memory efficient** - Automatic cleanup of empty topics
- **Error handling** - Subscriber errors don't break other subscribers

## Install

```sh
# Deno
deno add jsr:@marianmeres/pubsub
```

```sh
# npm
npm install @marianmeres/pubsub
```

## Basic Usage

```js
import { createPubSub } from '@marianmeres/pubsub';

const { publish, subscribe, subscribeOnce, unsubscribe, unsubscribeAll } = createPubSub();

// Create subscription (returns unsubscribe function)
const unsub = subscribe('foo', console.log);

// Publish data
publish('foo', 'bar'); // logs 'bar'

// Unsubscribe
unsub();

// Alternative unsubscribe methods
unsubscribe('foo', console.log);
unsubscribeAll('foo');

// Now this is a no-op as no subscription exists
publish('foo', 'baz');
```

## Advanced Usage

### Subscribe Once

Subscribe to an event that auto-unsubscribes after first trigger:

```js
const pubsub = createPubSub();

pubsub.subscribeOnce('init', (data) => {
  console.log('Initialized:', data);
});

pubsub.publish('init', { ready: true }); // logs "Initialized: { ready: true }"
pubsub.publish('init', { ready: true }); // no effect - already unsubscribed
```

### Wildcard Subscriptions

Subscribe to all events using the `"*"` topic. Wildcard subscribers receive an envelope with `event` and `data` properties:

```js
const pubsub = createPubSub();

// Subscribe to all events
pubsub.subscribe('*', ({ event, data }) => {
  console.log(`Event "${event}" published with data:`, data);
});

pubsub.publish('user:login', { userId: 123 });
// logs: Event "user:login" published with data: { userId: 123 }

pubsub.publish('user:logout', { userId: 123 });
// logs: Event "user:logout" published with data: { userId: 123 }
```

### Check Subscription Status

```js
const pubsub = createPubSub();
const callback = (data) => console.log(data);

pubsub.subscribe('foo', callback);

// Check if subscribed
pubsub.isSubscribed('foo', callback); // true

// Check excluding wildcard
pubsub.subscribe('*', callback);
pubsub.isSubscribed('bar', callback); // true (because of wildcard)
pubsub.isSubscribed('bar', callback, false); // false (excluding wildcard)
```

### Custom Error Handling

By default, errors thrown by subscribers are logged to `console.error`. You can customize this behavior with the `onError` option:

```js
// Silent mode - suppress error logging
const pubsub = createPubSub({
  onError: () => {}
});

// Custom error handler - send to logging service
const pubsub = createPubSub({
  onError: (error, topic, isWildcard) => {
    myLogger.error('Subscriber error', {
      error,
      topic,
      isWildcard,
      timestamp: Date.now()
    });
  }
});

// Subscribe to a topic
pubsub.subscribe('user:action', (data) => {
  // If this throws, it will be handled by your custom onError
  processUserAction(data);
});
```

The `onError` callback receives three parameters:
- `error: Error` - The error that was thrown
- `topic: string` - The topic that was being published to
- `isWildcard: boolean` - Whether the error came from a wildcard subscriber

## API Reference

For complete API documentation, see [API.md](API.md).

### Quick Reference

- **`createPubSub(options?)`** - Factory function to create a new PubSub instance
- **`new PubSub(options?)`** - Constructor for creating a PubSub instance
- **`publish(topic, data?)`** - Publish data to subscribers
- **`subscribe(topic, callback)`** - Subscribe to a topic (returns unsubscribe function)
- **`subscribeOnce(topic, callback)`** - Subscribe for first event only
- **`unsubscribe(topic, callback?)`** - Unsubscribe from a topic
- **`unsubscribeAll(topic?)`** - Unsubscribe all from a topic or all topics
- **`isSubscribed(topic, callback, considerWildcard?)`** - Check subscription status

## TypeScript

The library includes full TypeScript support:

```typescript
import { PubSub, PubSubOptions, Subscriber, Unsubscriber } from '@marianmeres/pubsub';

const options: PubSubOptions = {
  onError: (error, topic, isWildcard) => {
    console.log(`Error in ${isWildcard ? 'wildcard' : 'regular'} subscriber for ${topic}`);
  }
};

const pubsub = new PubSub(options);
```

## Important Notes

- Subscribers are executed **synchronously** in the order they were added
- Subscriber errors are caught and logged, preventing them from affecting other subscribers
- Empty topics are automatically cleaned up after all subscribers are removed
- Publishing to `"*"` will only trigger wildcard subscribers, not specific topic subscribers


## Package Identity

- **Name:** @marianmeres/pubsub
- **Author:** Marian Meres
- **Repository:** https://github.com/marianmeres/pubsub
- **License:** MIT
