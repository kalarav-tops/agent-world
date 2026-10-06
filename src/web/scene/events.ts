/**
 * Whether a DOM event started on the WebGL canvas itself. Clicks on HTML labels floating over
 * the scene also reach the scene's listeners; those must not count as clicks in 3D space.
 * @param event - native event
 * @returns true when the canvas was the target
 */
export function isCanvasEvent(event: Event): boolean {
  return event.target instanceof HTMLCanvasElement;
}
