# AGENTS.md

Machine-readable context for AI agents working with this codebase.

## Package Overview

- **Name:** `@marianmeres/pubsub`
- **Type:** Lightweight publish-subscribe (pub/sub) library
- **Runtime:** Deno-first, cross-published to npm
- **Language:** TypeScript
- **Dependencies:** Zero runtime dependencies
- **License:** MIT

## Architecture

### File Structure

```
src/
  mod.ts          # Re-exports from pubsub.ts
  pubsub.ts       # All implementation code
tests/
  pubsub.test.ts  # All tests
scripts/
  build-npm.ts    # npm build script
```

### Core Design

Single-file implementation with:
- `PubSub` class - Main implementation
- `createPubSub()` - Factory function
- Private `Map<string, Set<Subscriber>>` for storage
- Wildcard topic `"*"` for global subscriptions

## Public API

### Exports

| Export | Type | Description |
|--------|------|-------------|
| `PubSub` | class | Main pub/sub implementation |
| `createPubSub` | function | Factory function |
| `Subscriber` | type | `(detail: any) => void` |
| `Unsubscriber` | type | `() => void \| boolean` |
| `ErrorHandler` | type | `(error: Error, topic: string, isWildcard: boolean) => void` |
| `PubSubOptions` | interface | `{ onError?: ErrorHandler }` |

### PubSub Methods

| Method | Signature | Returns |
|--------|-----------|---------|
| `publish` | `(topic: string, data?: any)` | `boolean` |
| `subscribe` | `(topic: string, cb: Subscriber)` | `Unsubscriber` |
| `subscribeOnce` | `(topic: string, cb: Subscriber)` | `Unsubscriber` |
| `unsubscribe` | `(topic: string, cb?: Subscriber)` | `boolean` |
| `unsubscribeAll` | `(topic?: string)` | `boolean` |
| `isSubscribed` | `(topic: string, cb: Subscriber, considerWildcard?: boolean)` | `boolean` |
| `__dump` | `()` | `Record<string, Set<Subscriber>>` (internal/debug) |

## Key Behaviors

### Wildcard Subscriptions

- Topic `"*"` subscribes to all events
- Wildcard subscribers receive envelope: `{ event: string, data: any }`
- Publishing to `"*"` only triggers wildcard subscribers

### Error Handling

- Subscriber errors are caught, not propagated
- Other subscribers continue executing after error
- Custom error handler via `onError` option
- Default: `console.error`

### Memory Management

- Empty topics auto-cleanup when last subscriber removed
- Unsubscriber functions are idempotent (safe to call multiple times)

### Execution Model

- Synchronous execution
- Subscribers called in registration order

## Development Commands

```bash
deno test              # Run tests once
deno task test         # Run tests in watch mode
deno task npm:build    # Build npm package
deno task npm:publish  # Build and publish to npm
```

## Testing

- Framework: Deno test
- Location: `tests/pubsub.test.ts`
- Test count: 13 tests
- Coverage: All public methods and edge cases

## Code Style

- Tabs for indentation
- Line width: 90
- No explicit `any` lint warnings (disabled)
- Uses Deno fmt

## Publishing

- JSR: Publish via `deno publish`
- npm: Build with `deno task npm:build`, outputs to `.npm-dist/`
- Uses `@marianmeres/npmbuild` for npm package generation

## Common Patterns

### Basic Usage

```ts
const pubsub = createPubSub();
const unsub = pubsub.subscribe('topic', (data) => { /* handle */ });
pubsub.publish('topic', data);
unsub();
```

### Silent Error Mode

```ts
const pubsub = createPubSub({ onError: () => {} });
```

### One-time Subscription

```ts
pubsub.subscribeOnce('init', (data) => { /* runs once */ });
```

### Global Event Logging

```ts
pubsub.subscribe('*', ({ event, data }) => console.log(event, data));
```
