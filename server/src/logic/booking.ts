export interface BundleCount {
  size: number;
  count: number;
}

export type BookingQuote =
  | { possible: true; totalBundles: number; bundles: BundleCount[] }
  | { possible: false; totalBundles: null; bundles: [] };

export function quoteBundles(bundleSizes: readonly number[], groupSize: number): BookingQuote {
  const sizes = [...new Set(bundleSizes)].filter((s) => s > 0).sort((a, b) => b - a);

  const fewest = new Array<number>(groupSize + 1).fill(Infinity);
  const lastBundle = new Array<number>(groupSize + 1).fill(0);
  fewest[0] = 0;

  for (let seats = 1; seats <= groupSize; seats++) {
    for (const size of sizes) {
      if (size > seats) continue;
      const candidate = fewest[seats - size] + 1;
      if (candidate < fewest[seats]) {
        fewest[seats] = candidate;
        lastBundle[seats] = size;
      }
    }
  }

  if (fewest[groupSize] === Infinity) {
    return { possible: false, totalBundles: null, bundles: [] };
  }

  const counts = new Map<number, number>();
  for (let seats = groupSize; seats > 0; seats -= lastBundle[seats]) {
    const size = lastBundle[seats];
    counts.set(size, (counts.get(size) ?? 0) + 1);
  }

  const bundles = [...counts.entries()]
    .map(([size, count]) => ({ size, count }))
    .sort((a, b) => b.size - a.size);

  return { possible: true, totalBundles: fewest[groupSize], bundles };
}
