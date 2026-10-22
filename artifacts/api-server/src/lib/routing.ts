export type RoutingPair = { sourceId: number; destinationId: number };

export function findSourcesWithMultipleDestinations(rules: RoutingPair[]): number[] {
  const seen = new Set<number>();
  const duplicates = new Set<number>();
  for (const rule of rules) {
    if (seen.has(rule.sourceId)) duplicates.add(rule.sourceId);
    seen.add(rule.sourceId);
  }
  return [...duplicates];
}
