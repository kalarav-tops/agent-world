import type { ReactElement } from 'react';
import { Icon } from './icons';

/** Replay playback speeds. */
export const REPLAY_SPEEDS = [1, 4, 16] as const;
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number];

/** Props for the replay controls. */
interface ReplayBarProps {
  start: number;
  end: number;
  atMs: number | null;
  playing: boolean;
  speed: ReplaySpeed;
  onStart: () => void;
  onSeek: (atMs: number) => void;
  onTogglePlay: () => void;
  onSpeed: (speed: ReplaySpeed) => void;
  onStop: () => void;
}

/**
 * Controls to replay a lab: play or pause, scrub through its timeline, pick a speed, and return to live.
 * @param props - timeline bounds, playback state and handlers
 * @returns the controls
 */
export function ReplayBar(props: ReplayBarProps): ReactElement {
  const { start, end, atMs, playing, speed } = props;
  if (end <= start) return <p className="replay replay--empty">Nothing to replay yet.</p>;
  if (atMs === null) {
    return (
      <div className="replay">
        <button type="button" className="button" onClick={props.onStart}>
          <Icon name="replay" />
          Replay this lab
        </button>
        <span className="replay__length">{duration(end - start)} of work</span>
      </div>
    );
  }
  return (
    <div className="replay replay--on">
      <button type="button" className="button" onClick={props.onTogglePlay} aria-pressed={playing}>
        <Icon name={playing ? 'pause' : 'play'} />
        {playing ? 'Pause' : 'Play'}
      </button>
      <input
        className="replay__scrub"
        type="range"
        min={start}
        max={end}
        step={100}
        value={atMs}
        aria-label="Replay position"
        aria-valuetext={`${duration(atMs - start)} of ${duration(end - start)}`}
        onChange={(event) => props.onSeek(Number(event.target.value))}
      />
      <span className="replay__clock">
        {duration(atMs - start)} / {duration(end - start)}
      </span>
      <div className="replay__speeds" role="group" aria-label="Replay speed">
        {REPLAY_SPEEDS.map((option) => (
          <button key={option} type="button" className="chip" aria-pressed={option === speed} onClick={() => props.onSpeed(option)}>
            {option}×
          </button>
        ))}
      </div>
      <button type="button" className="button button--quiet" onClick={props.onStop}>
        Back to live
      </button>
    </div>
  );
}

/**
 * A duration as minutes and seconds.
 * @param ms - milliseconds
 * @returns e.g. "3:07"
 */
function duration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}
