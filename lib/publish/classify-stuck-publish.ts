export type StuckPublishDecision = 'live' | 'failed' | 'wait';

export function classifyStuckPublish(opts: {
  isLocked: boolean;
  hasExternal: boolean;
  ageMs: number;
  cutoffMs: number;
}): StuckPublishDecision {
  if (opts.hasExternal) return 'live';
  if (opts.isLocked) return 'wait';
  if (opts.ageMs >= opts.cutoffMs) return 'failed';
  return 'wait';
}
