import { describe, expect, it } from 'vitest';
import { quoteBundles } from '../src/logic/booking.js';
import { rewatchOrder, wouldCreateCycle, type PrerequisiteGraph } from '../src/logic/graph.js';

const IM = 1, CA = 2, AV = 3, CW = 4, TR = 5, IW = 6, EG = 7, DD = 8;
const graph: PrerequisiteGraph = new Map([
  [AV, [IM, CA]],
  [CW, [AV]],
  [IW, [CW, TR]],
  [EG, [IW]],
  [DD, [EG]],
]);
const years = new Map(
  [IM, CA, AV, CW, TR, IW, EG, DD].map((id, i) => [id, { releaseYear: 2008 + i, title: String(id) }]),
);

function expectValidOrder(order: number[]) {
  for (const [movie, prereqs] of graph) {
    if (!order.includes(movie)) continue;
    for (const p of prereqs) expect(order.indexOf(p)).toBeLessThan(order.indexOf(movie));
  }
}

describe('rewatchOrder', () => {
  it('returns all 7 other movies in a valid order for Avengers: Doomsday', () => {
    const order = rewatchOrder(graph, DD, years);
    expect(order).toHaveLength(7);
    expect(new Set(order)).toEqual(new Set([IM, CA, AV, CW, TR, IW, EG]));
    expectValidOrder(order);
  });

  it('returns Iron Man and The First Avenger, then The Avengers, for Civil War', () => {
    const order = rewatchOrder(graph, CW, years);
    expect(order).toHaveLength(3);
    expect(new Set(order.slice(0, 2))).toEqual(new Set([IM, CA]));
    expect(order[2]).toBe(AV);
  });

  it('returns an empty list for Thor: Ragnarok', () => {
    expect(rewatchOrder(graph, TR, years)).toEqual([]);
  });

  it('lists a shared prerequisite only once (diamond)', () => {
    const diamond: PrerequisiteGraph = new Map([
      [2, [1]],
      [3, [1]],
      [4, [2, 3]],
    ]);
    expect(rewatchOrder(diamond, 4, new Map())).toEqual([1, 2, 3]);
  });

  it('breaks ties by release year so the plan reads chronologically', () => {
    expect(rewatchOrder(graph, DD, years)).toEqual([IM, CA, AV, CW, TR, IW, EG]);
  });
});

describe('wouldCreateCycle', () => {
  it('rejects making Avengers: Endgame a prerequisite of Iron Man', () => {
    expect(wouldCreateCycle(graph, IM, [EG])).toBe(true);
  });

  it('rejects a movie depending on itself', () => {
    expect(wouldCreateCycle(graph, TR, [TR])).toBe(true);
  });

  it('allows edges that keep the graph acyclic', () => {
    expect(wouldCreateCycle(graph, TR, [IM, AV])).toBe(false);
    expect(wouldCreateCycle(graph, DD, [EG, TR])).toBe(false);
  });

  it('ignores the movie’s current edges, since they are being replaced', () => {
    expect(wouldCreateCycle(graph, CW, [IM])).toBe(false);
  });
});

describe('quoteBundles', () => {
  it.each([
    { sizes: [1, 3, 4], group: 6, total: 2, bundles: [{ size: 3, count: 2 }] },
    { sizes: [2, 5], group: 11, total: 4, bundles: [{ size: 5, count: 1 }, { size: 2, count: 3 }] },
    {
      sizes: [6, 9, 20],
      group: 44,
      total: 4,
      bundles: [{ size: 20, count: 1 }, { size: 9, count: 2 }, { size: 6, count: 1 }],
    },
  ])('bundles $sizes for a group of $group → $total bundles', ({ sizes, group, total, bundles }) => {
    expect(quoteBundles(sizes, group)).toEqual({ possible: true, totalBundles: total, bundles });
  });

  it('says not possible for sizes 4, 6 and a group of 7', () => {
    expect(quoteBundles([4, 6], 7)).toEqual({ possible: false, totalBundles: null, bundles: [] });
  });

  it('beats the greedy answer when greedy is wrong', () => {
    expect(quoteBundles([4, 3, 1], 6).totalBundles).toBe(2);
  });

  it('handles the largest allowed group quickly', () => {
    const quote = quoteBundles([7, 13, 499, 500], 10_000);
    expect(quote).toEqual({ possible: true, totalBundles: 20, bundles: [{ size: 500, count: 20 }] });
  });

  it('always adds up to exactly the group size', () => {
    for (let group = 1; group <= 200; group++) {
      const quote = quoteBundles([6, 9, 20], group);
      if (quote.possible) {
        expect(quote.bundles.reduce((sum, b) => sum + b.size * b.count, 0)).toBe(group);
      }
    }
  });
});
