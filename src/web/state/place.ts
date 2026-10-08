/** Where to land in the world after warping back. */
export interface WorldTarget {
  sessionId: string;
  labId: string;
  scientistId: string | null;
}

/** Where you are: the islands, the ship, or warping between them. */
export type Place = { kind: 'world' } | { kind: 'warping-in'; startedAt: number } | { kind: 'ship' } | { kind: 'warping-out'; startedAt: number; target: WorldTarget | null };

/** What can change the place. */
export type PlaceAction = { type: 'enter'; at: number } | { type: 'leave'; at: number; target?: WorldTarget | null } | { type: 'tick'; at: number; reducedMotion: boolean };

/** Warp phases in milliseconds, on the way in. */
export const WARP = { rise: 600, tunnel: 1600, fade: 300 } as const;

/** The whole warp with reduced motion: a cross-fade. */
export const REDUCED_WARP_MS = 300;

/**
 * How long a warp takes.
 * @param reducedMotion - whether the person prefers reduced motion
 * @returns milliseconds
 */
export function warpDuration(reducedMotion: boolean): number {
  return reducedMotion ? REDUCED_WARP_MS : WARP.rise + WARP.tunnel + WARP.fade;
}

/**
 * The next place.
 * @param place - current place
 * @param action - what happened
 * @returns next place (the same object when nothing changes)
 */
export function placeReducer(place: Place, action: PlaceAction): Place {
  if (action.type === 'enter') return place.kind === 'world' ? { kind: 'warping-in', startedAt: action.at } : place;
  if (action.type === 'leave') return place.kind === 'ship' ? { kind: 'warping-out', startedAt: action.at, target: action.target ?? null } : place;
  if (place.kind !== 'warping-in' && place.kind !== 'warping-out') return place;
  if (action.at - place.startedAt < warpDuration(action.reducedMotion)) return place;
  return place.kind === 'warping-in' ? { kind: 'ship' } : { kind: 'world' };
}

/**
 * Which part of the warp is showing.
 * @param place - current place
 * @param at - current time
 * @param reducedMotion - whether the person prefers reduced motion
 * @returns the phase and how far into it, or null when not warping
 */
export function warpPhase(place: Place, at: number, reducedMotion: boolean): { phase: 'rise' | 'tunnel' | 'fade'; progress: number } | null {
  if (place.kind !== 'warping-in' && place.kind !== 'warping-out') return null;
  const elapsed = Math.max(0, at - place.startedAt);
  if (reducedMotion) return { phase: 'fade', progress: Math.min(1, elapsed / REDUCED_WARP_MS) };
  const phases = place.kind === 'warping-in' ? (['rise', 'tunnel', 'fade'] as const) : (['fade', 'tunnel', 'rise'] as const);
  let start = 0;
  for (const phase of phases) {
    const length = WARP[phase];
    if (elapsed < start + length) return { phase, progress: (elapsed - start) / length };
    start += length;
  }
  return { phase: phases[2], progress: 1 };
}
