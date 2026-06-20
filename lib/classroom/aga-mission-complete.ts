/**
 * Whether the full classroom run is finished (not just the current slide).
 * Uses the loaded classroom scene count — launch totalSlides may under-count.
 */
export function isAgaMissionComplete(input: {
  sceneIndex: number;
  slideCompleted: boolean;
  sceneCount: number;
}): boolean {
  if (!input.slideCompleted || input.sceneCount <= 0) return false;
  return input.sceneIndex >= input.sceneCount - 1;
}

/** Prefer live classroom slide count for progress UI and mission end. */
export function effectiveAgaTotalSlides(sceneCount: number, agaTotalSlides: number): number {
  if (sceneCount > 0) return sceneCount;
  return agaTotalSlides > 0 ? agaTotalSlides : 5;
}
