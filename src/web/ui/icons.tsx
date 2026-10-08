import type { ReactElement } from 'react';

/** Stroked 24-pixel icon paths. Each entry is one or more SVG path strings. */
export const ICONS = {
  logo: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18', 'M3.6 9h16.8M3.6 15h16.8', 'M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3'],
  command: ['M4 5h16v14H4z', 'M8 10l3 2-3 2', 'M13 15h3'],
  close: ['M6 6l12 12M18 6L6 18'],
  back: ['M15 5l-7 7 7 7'],
  chevron: ['M9 6l6 6-6 6'],
  clock: ['M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16', 'M12 8v4l3 2'],
  alert: ['M12 4l9 16H3z', 'M12 10v4M12 17h.01'],
  file: ['M7 3h7l4 4v14H7z', 'M14 3v4h4'],
  sparkle: ['M12 4l1.8 4.6L18 10l-4.2 1.4L12 16l-1.8-4.6L6 10l4.2-1.4z', 'M18 16l.7 1.6 1.6.7-1.6.7L18 20.6l-.7-1.6-1.6-.7 1.6-.7z'],
  replay: ['M4 12a8 8 0 1 0 2.3-5.7', 'M4 4v4h4'],
  play: ['M8 5l11 7-11 7z'],
  pause: ['M8 5v14M16 5v14'],
  zoomIn: ['M12 5v14M5 12h14'],
  zoomOut: ['M5 12h14'],
  turnLeft: ['M9 7H5V3', 'M5 7a8 8 0 1 1-1 7'],
  turnRight: ['M15 7h4V3', 'M19 7a8 8 0 1 0 1 7'],
  tiltUp: ['M6 15l6-6 6 6'],
  tiltDown: ['M6 9l6 6 6-6'],
  north: ['M12 3l4 9h-8z', 'M12 21v-9'],
} as const;

/** The name of an icon in {@link ICONS}. */
export type IconName = keyof typeof ICONS;

/**
 * A decorative stroked icon that inherits the text colour. Screen readers skip it, so the control
 * holding it must carry its own name.
 * @param props - icon name and an optional extra class
 * @returns the SVG
 */
export function Icon({ name, className }: { name: IconName; className?: string }): ReactElement {
  return (
    <svg className={className ? `icon ${className}` : 'icon'} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {ICONS[name].map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}
