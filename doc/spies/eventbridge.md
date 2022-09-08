# EventBridge Spy

EventBridge Spies work similarely to [Jest Function Spies](https://jestjs.io/docs/mock-function-api). They let you spy on a specific EventBridge bus to test if events have been placed into it.

## How it works

Under the hood, EventBridge spies needs to subscribe to an EventBridge bus in order to grab all the events that were put into it. It then keeps track of them and you can later assert on them. To do so, it deploys either an SQS queue or a CloudWatch log group and subscribes it to the bus you are spying on. Spies can then use them to collect all the events from the bus and make them available to [matchers](#Matchers).

## The `eventBridgeSpy()` helper function

This helper creates a new spy for a given event bus. Parameters:

- `adapter`: `sqs` or `cw`. Specified how you would like the spy to subscribe to the bus. See [SQS vs CloudWatch](#SQS-vs-CloudWatch). Defaults to `sqs`.
- `busName`: The bus name you are spying on.
- `config`: configuration for the Spy adapter (see below)

Config:

- `matcherDefaultTimeout`: The default timeout for event matchers, in milliseconds. Defaults to `10000`.

**with the sqs adapter**:

- `waitTimeSeconds`: number, optional: The maximum polling time of the the sqs poller (uses long polling). Defaults to `20`. Must be between `0` (use short polling) and `20`.
- `clientConfig`: [SQSClientConfig](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-sqs/interfaces/sqsclientconfig.html), optional. Custom AWS SDK config.

**with the cloudwatch adapter**:

- `interval`: number, optional: The interval at which the spy will pull logs.
- `clientConfig`: [CloudWatchLogsClientConfig](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-cloudwatch-logs/interfaces/cloudwatchlogsclientconfig.html), optional. Custom AWS SDK config.

## Usage

The simplest and more efficient way to use EventBridge spies is to create it at the very begining of your tests. i.e.: in a `beforeAll()` hook at the top of your file or a `describe` block. The first time you create s spy for a given configuration combination, a new CloudFormation stack will be deployed automatically with the required resources. Further usage of a similar stack will re-use the already deployed resources.

```ts
let spy: EventBridgeSpy;

beforeAll(async () => {
  // create a spy. This will also deploy the required infrastructure, if need be.
  spy = await eventBridgeSpy({
    adapter: 'sqs',
    busName: 'my-bus',
  });
});

afterEach(() => {
  // clean up all events in memory between each test.
  spy.reset();
});

afterAll(async () => {
  // stop spying on the bus.
  await spy.stop();
});

it('should have event matching object', async () => {
  const order = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };

  await client.send(
    new PutEventsCommand({
      Entries: [
        {
          EventBusName: 'default',
          DetailType: 'orderCreated',
          Source: 'sls-jest',
          Detail: JSON.stringify(order),
        },
      ],
    }),
  );

  await expect(spy).toHaveEventMatchingObject({
    'detail-type': 'orderCreated',
    detail: {
      id: order.id,
    },
  });
});
```

## Matchers

### `toHaveEventMatchingObject`

Asserts that an event was put on the spied event bus, and that it matches a subset of the properties of an objec. It works similarely to jest's [toMatchObject](https://jestjs.io/docs/expect#tomatchobjectobject).

```ts
await expect(spy).toHaveEventMatchingObject({
  'detail-type': 'orderCreated',
  detail: {
    id: order.id,
  },
});
```

### `toHaveEventMatchingObjectTimes`

Same as `toHaveEventMatchingObject`, but it ensures that `n` matching, but different, events have been seen in total.

Note: The spy will deduplicate any event that might have been received more than once (because of the at-least-once delivery policy nature of EventBridge). It does so based on the event id.

```ts
await expect(spy).toHaveEventMatchingObjectTimes(
  {
    'detail-type': 'orderCreated',
    detail: {
      id: order.id,
    },
  },
  1,
);
```

## EventBridge Spy Reference

### `spy.reset()`

Resets the spy. All events caputerd so far will be deleted.

Use this helper between tests to cleanup the state of the spy.

```ts
afterEach(() => {
  spy.reset();
});
```

### `spy.stop()`

Stops the spy completely. The Spy eill stop capturing events from event bridge.

You SOULD call this method at the end of each set of tests.

```ts
afterAll(async () => {
  await spy.stop();
});
```

### `spy.destroyStack()`

Destroys the stack used by this spy. The destruction of the stack happens asynchronously.

```ts
afterAll(async () => {
  await spy.destroyStack();
});
```

💡 You usually will want to RETAIN the stack. i.e. for further tests, or for re-running the same test later without having to re-deploy the stack. Consider using the [npx sls-jest destroy](../../README.md#cleaning-up) CLI command when you are done, instead.

## SQS vs CloudWatch

Both methods have pros and cons. Based on your use case, you might consider using one or the other. Here are a few differences to take into account:

**SQS**

Pros:

- it is usually faster because events hit the queue as soon as they get on the bus. They also hit the spy quicker thanks to [long-polling](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-short-and-long-polling.html).

Cons:

- Harder to debug. Spies delete received messages as soon as they are received. When debugging, you cannot go check later if a message was missed by the spy, or by an invalid event pattern, for example.

**CloudWatch**

Pros:

- By default, events are retained in the log group for 1 day. That allows you to go and check waht events where received as you write your tests. This can help finding issues or adjust [timeouts](#recommendations) for example

Cons:

- This method is slower as spies must wait until the logs are ingested by CloudWatch. Spies also do interval polling when reding them from the logs.

## Recommendations

In practice, because of the asynchronous nature of EventBridge, there it is hard to control how events are collected. For example, there is a chance that events generated by a previous test (`it`) could be delayed and might interfere with the following tests. Here are some recommendations that can help mitigate this problem.

**Always use random ids and assert on them**

By using random ids and matching them in your test, you are avoiding false positive and false negative results.
For example, here is a good example of a bad test:

```ts
it('should see an orderCreated event - use case 1', async () => {
  // test case 1
  await createOrder(...);
  await expect(spy).toHaveEventMatchingObject({
    'detail-type': 'orderCreated',
  });
});

it('should see an orderCreated event - use case 2', async () => {
  // test case 2
  await createOrder(...);
  await expect(spy).toHaveEventMatchingObject({
    'detail-type': 'orderCreated',
  });
});
```

Matching only against the `detail-type` is not specific enough. The second test might see the event from the previous one and return successfully, when in fact no event was placed in that scenario.

better:

```ts
it('should see an orderCreated event - use case 1', async () => {
  // test case 1
  const randomId = crypto.randomUUID();
  await createOrder({
    id: randomId,
    //...
  });
  await expect(spy).toHaveEventMatchingObject({
    'detail-type': 'orderCreated',
    details: {
      id: randomId,
    },
  });
});

it('should see an orderCreated event - use case 2', async () => {
  // test case 2
  const randomId = crypto.randomUUID();
  await createOrder({
    id: randomId,
    //...
  });
  await expect(spy).toHaveEventMatchingObject({
    'detail-type': 'orderCreated',
    details: {
      id: randomId,
    },
  });
});
```

**Use adequate timeouts**

When matchers evaluate an assertion, they wait up to a certain amount of time until the assertion can either be resolved, in which case the matcher returns immediately, or it stops and evaluates the assertion with the data it has at that moment. Using too short timeouts can cause false negatives or positives as events that affect the result might arrive shortly after. On the other hand, using too long timeouts can artifitially slow down your test suite in some cases. Playing with different timeouts can reduce this inconvenient.

Cases where a long timeout can slow down your tests:

- `expect(spy).not.toHaveEventMatchingObject(...): The macher must wait the full timeout in order to ensure the event is not seen.

- `expect(spy).toHaveEventMatchingObjectTimes(...)`: The matcher must make sure that no extra event is received.

In any case, as soon as the assertion can be resolved, the matcher will return immediately. e.g. the matcher expects exaclty 2 events, but sees 3.

Timeouts can be specified at the spy leve, in the config, or case by case. Example:

```ts
await expect(spy).not.toHaveEventMatchingObject(
  {
    'detail-type': 'orderCreated',
    detail: {
      id: order.id,
    },
  },
  {
    timeout: 15000, // 15 seconds timeout
  },
);
```