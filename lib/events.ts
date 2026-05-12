import { db } from './db/client';
import { generationEvents } from './db/schema';

export type EventType =
  | 'generated' | 'approved' | 'rejected' | 'regenerated'
  | 'published' | 'publish_failed' | 'sale_recorded';

export async function logEvent(opts: {
  type: EventType;
  designId?: string;
  batchId?: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(generationEvents).values({
    eventType: opts.type,
    designId: opts.designId,
    batchId: opts.batchId,
    payload: opts.payload ?? {},
  });
}
