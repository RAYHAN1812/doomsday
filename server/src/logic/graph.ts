export type PrerequisiteGraph = Map<number, readonly number[]>;

export interface SortKey {
  releaseYear: number;
  title: string;
}

export function wouldCreateCycle(
  graph: PrerequisiteGraph,
  movieId: number,
  newPrerequisites: readonly number[],
): boolean {
  const visited = new Set<number>();
  const stack: number[] = [...newPrerequisites];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === movieId) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const next of graph.get(current) ?? []) {
      if (!visited.has(next)) stack.push(next);
    }
  }
  return false;
}

export function collectAncestors(graph: PrerequisiteGraph, targetId: number): Set<number> {
  const ancestors = new Set<number>();
  const stack: number[] = [...(graph.get(targetId) ?? [])];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === targetId || ancestors.has(current)) continue;
    ancestors.add(current);
    for (const next of graph.get(current) ?? []) stack.push(next);
  }
  return ancestors;
}

export class CycleDetectedError extends Error {
  constructor() {
    super('The prerequisite graph contains a cycle');
  }
}

export function rewatchOrder(
  graph: PrerequisiteGraph,
  targetId: number,
  sortKeys: Map<number, SortKey>,
): number[] {
  const nodes = collectAncestors(graph, targetId);

  const remaining = new Map<number, number>();
  const unlocks = new Map<number, number[]>();

  for (const id of nodes) {
    const prereqs = (graph.get(id) ?? []).filter((p) => nodes.has(p));
    remaining.set(id, prereqs.length);
    for (const p of prereqs) {
      const list = unlocks.get(p);
      if (list) list.push(id);
      else unlocks.set(p, [id]);
    }
  }

  const compare = (a: number, b: number): number => {
    const ka = sortKeys.get(a);
    const kb = sortKeys.get(b);
    if (ka && kb) {
      if (ka.releaseYear !== kb.releaseYear) return ka.releaseYear - kb.releaseYear;
      const byTitle = ka.title.localeCompare(kb.title);
      if (byTitle !== 0) return byTitle;
    }
    return a - b;
  };

  const ready: number[] = [];
  for (const [id, count] of remaining) if (count === 0) ready.push(id);

  const order: number[] = [];
  while (ready.length > 0) {
    ready.sort(compare);
    const next = ready.shift()!;
    order.push(next);

    for (const waiting of unlocks.get(next) ?? []) {
      const left = remaining.get(waiting)! - 1;
      remaining.set(waiting, left);
      if (left === 0) ready.push(waiting);
    }
  }

  if (order.length !== nodes.size) throw new CycleDetectedError();
  return order;
}
