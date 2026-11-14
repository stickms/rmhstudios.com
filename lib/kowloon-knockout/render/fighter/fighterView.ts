// Which renderer draws a fighter. Pure so the "stick figure only when nothing
// better could load" rule is tested rather than re-derived in a component.
import { DEFAULT_FIGHTER_MODEL } from './models';

export type FighterView =
  | 'source'
  | 'skeletal'
  | 'stick';

/** A renderer that threw while loading. Cleared when the model id changes. */
export type FighterFailures =
  {
    source: boolean;
    skeletal: boolean;
  };

/**
 * The chosen Source model first; if it cannot load, the animated Y-Bot; the
 * procedural StickFighter only when both fail. The render tier never forces the
 * stick figure (it used to on `low`, which overrode the animated fighter on
 * phones), and neither does a load in flight (the caller shows a placeholder).
 */
export function chooseFighterView(
  modelId: string,
  failed: FighterFailures,
): FighterView {
  if (
    modelId !==
      DEFAULT_FIGHTER_MODEL &&
    !failed.source
  )
    return 'source';
  if (
    !failed.skeletal
  )
    return 'skeletal';
  return 'stick';
}
