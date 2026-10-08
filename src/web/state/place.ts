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

/**
 * Whether the islands are on screen: at home, and during the rise up (or down) the tower. With
 * reduced motion the scenes swap halfway through the cross-fade, while the veil is darkest.
 * @param place - current place
 * @param at - current time
 * @param reducedMotion - whether the person prefers reduced motion
 * @returns true to draw the world, false to draw the ship
 */
export function showsWorld(place: Place, at: number, reducedMotion: boolean): boolean {
  if (place.kind === 'world') return true;
  if (place.kind === 'ship') return false;
  const phase = warpPhase(place, at, reducedMotion);
  if (reducedMotion) return place.kind === 'warping-in' ? (phase?.progress ?? 1) < 0.5 : (phase?.progress ?? 0) >= 0.5;
  return phase?.phase === 'rise';
}

/**
 * How dark the veil over the screen is: it lifts as you arrive on the bridge and falls as you
 * leave it; with reduced motion it rises and falls once across the cross-fade.
 * @param place - current place
 * @param at - current time
 * @param reducedMotion - whether the person prefers reduced motion
 * @returns opacity from 0 to 1
 */
export function veilOpacity(place: Place, at: number, reducedMotion: boolean): number {
  const phase = warpPhase(place, at, reducedMotion);
  if (!phase || phase.phase !== 'fade') return 0;
  if (reducedMotion) return 1 - Math.abs(2 * phase.progress - 1);
  return place.kind === 'warping-in' ? 1 - phase.progress : phase.progress;
}

/**
 * Which tower move the world camera should make: up it as the warp to the ship starts, down it as
 * the warp back ends. Reduced motion has neither.
 * @param place - current place
 * @param at - current time
 * @param reducedMotion - whether the person prefers reduced motion
 * @returns the move, or null
 */
export function cameraCue(place: Place, at: number, reducedMotion: boolean): 'rise' | 'descend' | null {
  if (reducedMotion || warpPhase(place, at, reducedMotion)?.phase !== 'rise') return null;
  return place.kind === 'warping-in' ? 'rise' : 'descend';
}
