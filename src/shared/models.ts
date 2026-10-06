/** Model families, strongest first. */
export type ModelTier = 'fable' | 'opus' | 'sonnet' | 'haiku' | 'unknown';

const FAMILIES: ReadonlyArray<Exclude<ModelTier, 'unknown'>> = ['fable', 'opus', 'sonnet', 'haiku'];

const EFFORT_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
};

/**
 * Which model family an id or alias belongs to.
 * @param model - model id such as `claude-opus-5-5[1m]`, or an alias such as `haiku`
 * @returns the family
 */
export function modelTier(model: string): ModelTier {
  const lower = model.toLowerCase();
  return FAMILIES.find((family) => lower.includes(family)) ?? 'unknown';
}

/**
 * A readable model name: `claude-haiku-4-5-20251001` becomes `Haiku 4.5`.
 * @param model - model id or alias
 * @returns display name, or the input when it is not a Claude model id
 */
export function modelLabel(model: string): string {
  const tier = modelTier(model);
  if (tier === 'unknown') return model;
  const name = tier.charAt(0).toUpperCase() + tier.slice(1);
  const version = /-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(?:\[.*\])?$/.exec(model);
  if (!version) return name;
  return version[2] ? `${name} ${version[1]}.${version[2]}` : `${name} ${version[1]}`;
}

/**
 * A readable effort level.
 * @param effort - effort value from the transcript
 * @returns display name, empty when unknown
 */
export function effortLabel(effort: string): string {
  return EFFORT_LABELS[effort] ?? effort;
}
