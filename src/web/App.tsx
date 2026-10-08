import { Component, useCallback, useEffect, useMemo, useReducer, useRef, useState, type Dispatch, type ReactElement, type ReactNode } from 'react';
import { replayAt, timelineBounds } from '../shared/replay';
import type { WorldSummary } from '../shared/types';
import { useLabDetail, useNow, usePrefersReducedMotion, useWorld } from './state/hooks';
import { continentPlacements, sessionLayout, type Placement } from './scene/layout';
import { WorldScene, type CameraFocus, type CameraHandle } from './scene/WorldScene';
import { Hud } from './ui/Hud';
import { InspectPanel, type PanelView } from './ui/InspectPanel';
import { ReplayBar, type ReplaySpeed } from './ui/ReplayBar';
import { ViewControls } from './ui/ViewControls';
import { RequestCards } from './ui/RequestCards';
import { useControlAccess } from './state/control';
import { placeRequests } from './state/requests';
import { placeReducer, showsWorld, veilOpacity, warpPhase, type Place, type PlaceAction } from './state/place';
import { ShipScene } from './ship/ShipScene';
import { Icon } from './ui/icons';

interface Selection {
  sessionId: string;
  labId: string;
}

interface ReplayControl {
  atMs: number | null;
  playing: boolean;
  speed: ReplaySpeed;
}

const LAB_FOCUS_DISTANCE = 13;
const START_FOCUS_DISTANCE = 16;
const IDLE_REPLAY: ReplayControl = { atMs: null, playing: false, speed: 4 };

/**
 * The whole app: the live 3D world, the HUD, and the inspect panel for the selected lab.
 * @returns the app
 */
export function App(): ReactElement {
  const { world, connected, denied } = useWorld();
  const access = useControlAccess(connected);
  const [place, dispatch] = useReducer(placeReducer, AT_HOME);
  const [clock, setClock] = useState(0);
  const now = useNow();
  const reducedMotion = usePrefersReducedMotion();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [view, setView] = useState<PanelView>({ kind: 'lab' });
  const [focus, setFocus] = useState<CameraFocus>({ key: 'start', x: 0, z: 0, distance: 60 });
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null);
  const [replay, setReplay] = useState<ReplayControl>(IDLE_REPLAY);
  const [, setReading] = useState<string | null>(null);
  const cameraHandle: CameraHandle = useRef(null);

  const placements = useMemo(
    () =>
      world
        ? continentPlacements(
            world.sessions.map((session) => session.labs.length),
            world.sessions.map((session) => sessionLayout(session.labs).spacing),
          )
        : [],
    [world],
  );
  const session = world?.sessions.find((candidate) => candidate.sessionId === selection?.sessionId) ?? null;
  const lab = session?.labs.find((candidate) => candidate.id === selection?.labId) ?? null;
  const detail = useLabDetail(lab ? selection?.sessionId ?? null : null, lab ? selection?.labId ?? null : null, lab?.version ?? 0);
  const bounds = useMemo(() => timelineBounds(detail?.timeline ?? []), [detail]);
  const places = useMemo(() => placeRequests(world?.control?.requests ?? [], world?.sessions ?? []), [world]);

  useStartFocus(world, placements, setFocus);
  useReplayClock(replay, bounds.end, setReplay, reducedMotion);
  useWarpClock(place, reducedMotion, dispatch, setClock);

  const clearSelection = useCallback(() => {
    setSelection(null);
    setReplay(IDLE_REPLAY);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') clearSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clearSelection]);

  useEffect(() => {
    if (selection && world && !lab) clearSelection();
  }, [selection, world, lab, clearSelection]);

  const selectLab = useCallback(
    (sessionId: string, labId: string, nextView: PanelView = { kind: 'lab' }) => {
      if (!world) return;
      if (selection?.sessionId !== sessionId || selection.labId !== labId) setReplay(IDLE_REPLAY);
      setSelection({ sessionId, labId });
      setView(nextView);
      setFocusedSessionId(sessionId);
      const position = labPosition(world, placements, sessionId, labId);
      if (position) setFocus({ key: `lab:${sessionId}:${labId}:${Date.now()}`, ...position, distance: LAB_FOCUS_DISTANCE });
    },
    [world, placements, selection],
  );

  const focusContinent = useCallback(
    (sessionId: string) => {
      const index = world?.sessions.findIndex((candidate) => candidate.sessionId === sessionId) ?? -1;
      const placement = placements[index];
      if (!placement) return;
      setFocusedSessionId(sessionId);
      setFocus({ key: `continent:${sessionId}:${Date.now()}`, x: placement.x, z: placement.z, distance: placement.radius * 1.6 + 10 });
    },
    [world, placements],
  );

  const overview = useCallback(() => {
    setFocusedSessionId(null);
    setFocus({ key: `overview:${Date.now()}`, ...overviewFocus(placements) });
  }, [placements]);

  const enterShip = useCallback(() => dispatch({ type: 'enter', at: performance.now() }), []);
  const leaveShip = useCallback(() => dispatch({ type: 'leave', at: performance.now() }), []);

  const showOldestWaiting = useCallback(() => {
    const first = places.find((place) => place.labId);
    if (!first?.labId) return;
    selectLab(first.sessionId, first.labId, first.scientistId ? { kind: 'scientist', scientistId: first.scientistId } : { kind: 'lab' });
  }, [places, selectLab]);

  useLanding(place, selectLab);
  const atWorld = showsWorld(place, clock, reducedMotion);
  const rising = place.kind === 'warping-in' && warpPhase(place, clock, reducedMotion)?.phase === 'rise';

  const replayStates = replay.atMs !== null && detail && selection ? { ...selection, states: replayAt(detail.timeline, replay.atMs) } : null;

  return (
    <div className="app">
      {atWorld ? (
        <>
          <SceneBoundary>
            {world && (
              <WorldScene
                world={world}
                cameraHandle={cameraHandle}
                placements={placements}
                selection={selection}
                replay={replayStates}
                focus={focus}
                now={now}
                reducedMotion={reducedMotion}
                onSelectLab={(sessionId, labId) => selectLab(sessionId, labId)}
                onSelectScientist={(sessionId, labId, scientistId) => selectLab(sessionId, labId, { kind: 'scientist', scientistId })}
                onOpenChanges={(sessionId, labId) => selectLab(sessionId, labId, { kind: 'changes', changeIndex: null })}
                onFocusContinent={focusContinent}
                onClearSelection={clearSelection}
                waiting={places.length > 0}
                rising={rising}
                onEnterShip={enterShip}
              />
            )}
          </SceneBoundary>
          {world && (
            <div className={`view-controls-dock${session && lab ? ' view-controls-dock--beside-panel' : ''}`}>
              <ViewControls camera={cameraHandle} reducedMotion={reducedMotion} />
            </div>
          )}
          <Hud
            world={world}
            connected={connected}
            now={now}
            focusedSessionId={focusedSessionId}
            onFocusContinent={focusContinent}
            onOverview={overview}
            onCommand={enterShip}
            waiting={places}
            onShowWaiting={showOldestWaiting}
          />
          {world && (
            <RequestCards access={access} requests={world.control?.requests ?? []} sessions={world.sessions} now={now} />
          )}
          {denied && !connected && (
            <p className="notice notice--access" role="alert">
              This page needs its access link. Open the link Agent World printed in the terminal (it ends in <code>#token=…</code>); a new one is
              printed every time it starts.
            </p>
          )}
          {!world && !denied && <p className="notice">Connecting to the agent-world server…</p>}
          {world && world.sessions.length === 0 && (
            <p className="notice">No Claude Code sessions are running. Start one and it will rise here as a new continent.</p>
          )}
          {session && lab && (
            <InspectPanel
              session={session}
              lab={lab}
              detail={detail}
              view={view}
              now={now}
              access={access}
              onView={setView}
              onClose={clearSelection}
              places={places}
              onReadConversation={setReading}
              replayBar={
                <ReplayBar
                  start={bounds.start}
                  end={bounds.end}
                  atMs={replay.atMs}
                  playing={replay.playing}
                  speed={replay.speed}
                  onStart={() => setReplay((current) => ({ ...current, atMs: bounds.start, playing: true }))}
                  onSeek={(atMs) => setReplay((current) => ({ ...current, atMs }))}
                  onTogglePlay={() =>
                    setReplay((current) => {
                      const atEnd = current.atMs !== null && current.atMs >= bounds.end;
                      return current.playing ? { ...current, playing: false } : { ...current, atMs: atEnd ? bounds.start : current.atMs, playing: true };
                    })
                  }
                  onSpeed={(speed) => setReplay((current) => ({ ...current, speed }))}
                  onStop={() => setReplay(IDLE_REPLAY)}
                />
              }
            />
          )}
        </>
      ) : (
        <SceneBoundary>
          <ShipScene place={place} now={clock} reducedMotion={reducedMotion} waiting={places.length > 0} onLeave={leaveShip} screens={null} />
        </SceneBoundary>
      )}
      {place.kind === 'ship' && (
        <div className="ship-overlay">
          <button type="button" className="button" onClick={leaveShip}>
            <Icon name="back" />
            Return to world
          </button>
        </div>
      )}
      <div className="warp-veil" style={{ opacity: veilOpacity(place, clock, reducedMotion) }} aria-hidden="true" />
    </div>
  );
}

/**
 * Once, when the first world message arrives, zoom in on the lab with the latest activity so the
 * scientists are visible straight away (the title button still shows the whole world).
 * @param world - world summary
 * @param placements - continent placements
 * @param setFocus - camera focus setter
 */
function useStartFocus(world: WorldSummary | null, placements: Placement[], setFocus: (focus: CameraFocus) => void): void {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (done || !world || !placements.length) return;
    setDone(true);
    const latest = world.sessions
      .flatMap((session) => session.labs.map((lab) => ({ session, lab })))
      .sort((left, right) => Date.parse(right.lab.updatedAt) - Date.parse(left.lab.updatedAt))[0];
    const position = latest ? labPosition(world, placements, latest.session.sessionId, latest.lab.id) : null;
    setFocus(position ? { key: 'start', ...position, distance: START_FOCUS_DISTANCE } : { key: 'start', ...overviewFocus(placements) });
  }, [done, world, placements, setFocus]);
}

/**
 * Advance the replay position while playing, stopping at the end of the timeline.
 * @param replay - replay state
 * @param end - last timeline moment
 * @param setReplay - replay setter
 * @param reducedMotion - jump to the end instead of animating
 */
function useReplayClock(replay: ReplayControl, end: number, setReplay: (update: (current: ReplayControl) => ReplayControl) => void, reducedMotion: boolean): void {
  useEffect(() => {
    if (!replay.playing) return undefined;
    let frame = 0;
    let last = performance.now();
    const tick = (time: number): void => {
      const elapsed = time - last;
      last = time;
      setReplay((current) => {
        if (current.atMs === null) return current;
        const next = reducedMotion ? end : Math.min(end, current.atMs + elapsed * current.speed);
        return { ...current, atMs: next, playing: next < end };
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [replay.playing, end, setReplay, reducedMotion]);
}

/**
 * Camera framing that shows every continent.
 * @param placements - continent placements
 * @returns centre and distance
 */
function overviewFocus(placements: Placement[]): { x: number; z: number; distance: number } {
  const extent = placements.reduce((max, placement) => Math.max(max, Math.hypot(placement.x, placement.z) + placement.radius), 20);
  return { x: 0, z: 0, distance: extent * 1.5 };
}

/**
 * World position of a lab.
 * @param world - world summary
 * @param placements - continent placements
 * @param sessionId - session id
 * @param labId - lab id
 * @returns x and z, or null when not found
 */
function labPosition(world: WorldSummary, placements: Placement[], sessionId: string, labId: string): { x: number; z: number } | null {
  const index = world.sessions.findIndex((session) => session.sessionId === sessionId);
  const session = world.sessions[index];
  const placement = placements[index];
  if (!session || !placement) return null;
  const labIndex = session.labs.findIndex((lab) => lab.id === labId);
  const cell = sessionLayout(session.labs).cells[labIndex];
  return cell ? { x: placement.x + cell.x, z: placement.z + cell.z } : null;
}

/** Shows a plain message instead of a blank screen when 3D graphics cannot start. */
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  /**
   * Switch to the fallback after a render error.
   * @returns the failed state
   */
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  /**
   * Render the scene or the fallback.
   * @returns content
   */
  render(): ReactNode {
    if (this.state.failed) {
      return <p className="notice">This browser could not start 3D graphics (WebGL). Try a recent Chrome, Edge or Firefox with hardware acceleration on.</p>;
    }
    return this.props.children;
  }
}

/** Where you start: on the islands. */
const AT_HOME: Place = { kind: 'world' };

/**
 * While warping, tick the place every animation frame so the warp advances and ends on time.
 * @param place - current place
 * @param reducedMotion - whether the person prefers reduced motion
 * @param dispatch - place dispatcher
 * @param setClock - clock setter, so the scenes can draw the right phase
 */
function useWarpClock(place: Place, reducedMotion: boolean, dispatch: Dispatch<PlaceAction>, setClock: (at: number) => void): void {
  const warping = place.kind === 'warping-in' || place.kind === 'warping-out';
  useEffect(() => {
    if (!warping) return undefined;
    let frame = 0;
    const tick = (): void => {
      const at = performance.now();
      setClock(at);
      dispatch({ type: 'tick', at, reducedMotion });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [warping, reducedMotion, dispatch, setClock]);
}

/**
 * When a warp back to the world lands with a target, open that lab (or agent).
 * @param place - current place
 * @param selectLab - opens a lab panel and flies the camera there
 */
function useLanding(place: Place, selectLab: (sessionId: string, labId: string, view?: PanelView) => void): void {
  const previous = useRef<Place>(place);
  useEffect(() => {
    const before = previous.current;
    previous.current = place;
    if (before.kind !== 'warping-out' || place.kind !== 'world' || !before.target) return;
    const { sessionId, labId, scientistId } = before.target;
    selectLab(sessionId, labId, scientistId ? { kind: 'scientist', scientistId } : { kind: 'lab' });
  }, [place, selectLab]);
}
