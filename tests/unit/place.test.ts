import { describe, expect, it } from 'vitest';
import { placeReducer, REDUCED_WARP_MS, warpDuration, warpPhase, type Place } from '../../src/web/state/place';

const world: Place = { kind: 'world' };

describe('placeReducer', () => {
  it('warps in, lands on the ship, warps out and lands in the world with a target', () => {
    let place = placeReducer(world, { type: 'enter', at: 0 });
    expect(place).toEqual({ kind: 'warping-in', startedAt: 0 });
    place = placeReducer(place, { type: 'tick', at: warpDuration(false) - 1, reducedMotion: false });
    expect(place.kind).toBe('warping-in');
    place = placeReducer(place, { type: 'tick', at: warpDuration(false), reducedMotion: false });
    expect(place).toEqual({ kind: 'ship' });
    const target = { sessionId: 's1', labId: 'l1', scientistId: null };
    place = placeReducer(place, { type: 'leave', at: 10_000, target });
    expect(place).toEqual({ kind: 'warping-out', startedAt: 10_000, target });
    expect(placeReducer(place, { type: 'tick', at: 10_000 + warpDuration(false), reducedMotion: false })).toEqual({ kind: 'world' });
  });

  it('ignores entering while not in the world and leaving while not on the ship', () => {
    const warping: Place = { kind: 'warping-in', startedAt: 0 };
    expect(placeReducer(warping, { type: 'enter', at: 5 })).toBe(warping);
    expect(placeReducer(world, { type: 'leave', at: 5 })).toBe(world);
  });

  it('takes a short cross-fade with reduced motion', () => {
    expect(warpDuration(true)).toBe(REDUCED_WARP_MS);
    expect(placeReducer({ kind: 'warping-in', startedAt: 0 }, { type: 'tick', at: REDUCED_WARP_MS, reducedMotion: true })).toEqual({ kind: 'ship' });
  });
});

describe('warpPhase', () => {
  it('rises, then tunnels, then fades on the way in', () => {
    const place: Place = { kind: 'warping-in', startedAt: 0 };
    expect(warpPhase(place, 300, false)).toEqual({ phase: 'rise', progress: 0.5 });
    expect(warpPhase(place, 1400, false)).toEqual({ phase: 'tunnel', progress: 0.5 });
    expect(warpPhase(place, 2350, false)).toEqual({ phase: 'fade', progress: 0.5 });
  });

  it('runs backwards on the way out and is only a fade with reduced motion', () => {
    const place: Place = { kind: 'warping-out', startedAt: 0, target: null };
    expect(warpPhase(place, 150, false)?.phase).toBe('fade');
    expect(warpPhase(place, 2400, false)?.phase).toBe('rise');
    expect(warpPhase({ kind: 'warping-in', startedAt: 0 }, 150, true)).toEqual({ phase: 'fade', progress: 0.5 });
    expect(warpPhase({ kind: 'ship' }, 0, false)).toBeNull();
  });
});
