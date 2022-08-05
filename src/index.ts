export * from './matchers/helpers';
export * from './spies/eventBridge';

import { EventBridgeEvent } from 'aws-lambda';
import { DocumentClient } from 'aws-sdk/clients/dynamodb';

declare global {
  namespace jest {
    interface Matchers<R> {
      toExist(): R;
      toExistAndMatchingObject(params: DocumentClient.AttributeMap): R;
      toExistAndMatchingSnapshot(propertiesOrHint?: string, hint?: string): R;
      toExistAndMatchingInlineSnapshot(
        propertiesOrHint?: string,
        hint?: string,
      ): R;
      toHaveEventMatchingObject(
        expected: Partial<EventBridgeEvent<string, unknown>>,
      ): R;
      toHaveEventMatchingObjectTimes(
        expected: Partial<EventBridgeEvent<string, unknown>>,
        times: number,
      ): R;
      toEvaluateTo(template: string | object): R;
      toEvaluateToSnapshot(propertiesOrHint?: string, hint?: string): R;
      toEvaluateToInlineSnapshot(propertiesOrHint?: string, hint?: string): R;
    }
  }
}
