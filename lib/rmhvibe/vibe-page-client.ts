/** Client calls for per-page vibe endpoints (kept out of route files: see useeffect-fetch-ratchet). */
import { api } from '@/lib/contract/client';
import { vibeTweaksApi } from '@/lib/rmhvibe/vibe-page.contract';
import {
  validateTweakValues,
  type TweakSpec,
  type TweakValue,
} from '@/lib/rmhvibe/tweaks';

/** Save the owner's tweak values; only values valid for `spec` are sent. Returns what was sent. */
export async function saveVibeTweaks(
  slug: string,
  spec: TweakSpec[],
  values: Record<
    string,
    TweakValue
  >,
): Promise<
  Record<
    string,
    TweakValue
  >
> {
  const valid =
    validateTweakValues(
      spec,
      values,
    );
  await api(
    vibeTweaksApi,
    {
      params:
        {
          slug,
        },
      body: {
        values:
          valid,
      },
    },
  );
  return valid;
}
