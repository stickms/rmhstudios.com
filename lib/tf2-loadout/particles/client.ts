'use client';
import { useQuery } from '@tanstack/react-query';
import {
  LinearFilter,
  LinearMipmapLinearFilter,
  NearestFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from 'three';
import {
  isSafeParticlePath,
  PARTICLE_API,
  type ParticleBundle,
  type ParticleManifest,
  type ParticleTexture,
} from './types';

async function fetchJson<T>(path: string, signal?: AbortSignal): Promise<T | null> {
  if (!isSafeParticlePath(path)) throw new Error('Invalid particle asset path');
  const res = await fetch(PARTICLE_API + path, { signal });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Particle asset: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export function useParticleBundle(id: number | undefined, suffix?: string) {
  const manifest = useQuery({
    queryKey: ['tf2-particles', 'manifest'],
    enabled: id !== undefined,
    queryFn: ({ signal }) => fetchJson<ParticleManifest>('manifest.json', signal),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const path =
    id !== undefined ? manifest.data?.effects[suffix ? `${id}:${suffix}` : String(id)] : undefined;
  const bundle = useQuery({
    queryKey: ['tf2-particles', path],
    enabled: !!path,
    queryFn: ({ signal }) => fetchJson<ParticleBundle>(path!, signal),
    staleTime: Infinity,
    retry: 1,
  });
  return {
    bundle: bundle.data?.v === 1 ? bundle.data : undefined,
    status:
      manifest.isError || bundle.isError
        ? ('error' as const)
        : manifest.isPending || (path && bundle.isPending)
          ? ('loading' as const)
          : !path || !bundle.data
            ? ('missing' as const)
            : ('ready' as const),
  };
}

interface CachedTexture {
  users: number;
  promise: Promise<Texture>;
}
const cache = new Map<string, CachedTexture>();
export interface LoadedTextures {
  get(texture: ParticleTexture | undefined, frame?: number, data?: boolean): Texture | undefined;
  dispose(): void;
}

/** Share GPU textures across item/player viewers; the last unmount releases them. */
export async function acquireTextures(bundle: ParticleBundle): Promise<LoadedTextures> {
  const acquired = new Map<string, CachedTexture>();
  const ready = new Map<string, Texture>();
  const keyOf = (path: string, data: boolean) => path + (data ? ':data' : ':color');
  const dispose = () => {
    for (const [key, entry] of acquired) {
      entry.users--;
      if (!entry.users) {
        if (cache.get(key) === entry) cache.delete(key);
        void entry.promise.then(
          (tex) => tex.dispose(),
          () => {},
        );
      }
    }
    acquired.clear();
  };
  try {
    const tasks: Promise<void>[] = [];
    for (const mat of Object.values(bundle.materials))
      for (const [param, tex] of Object.entries(mat.textures)) {
        const data = /normalmap|bumpmap/.test(param) || mat.params.$extractgreenalpha === '1';
        for (const path of tex.frames) {
          if (!isSafeParticlePath(path)) throw new Error('Invalid particle texture path');
          const key = keyOf(path, data);
          if (acquired.has(key)) continue;
          let entry = cache.get(key);
          if (!entry) {
            entry = {
              users: 0,
              promise: new TextureLoader().loadAsync(PARTICLE_API + path).then((texture) => {
                texture.flipY = false; // Source SHT coordinates start at the top-left.
                texture.colorSpace = data ? NoColorSpace : SRGBColorSpace;
                texture.magFilter = tex.flags & 1 ? NearestFilter : LinearFilter;
                texture.minFilter =
                  tex.flags & 1
                    ? NearestFilter
                    : tex.flags & 0x100
                      ? LinearFilter
                      : LinearMipmapLinearFilter;
                if (!(tex.flags & 4)) texture.wrapS = RepeatWrapping;
                if (!(tex.flags & 8)) texture.wrapT = RepeatWrapping;
                texture.generateMipmaps = !(tex.flags & 0x100);
                texture.needsUpdate = true;
                return texture;
              }),
            };
            cache.set(key, entry);
          }
          entry.users++;
          acquired.set(key, entry);
          tasks.push(
            entry.promise.then((texture) => {
              ready.set(key, texture);
            }),
          );
        }
      }
    await Promise.all(tasks);
    return {
      get(tex, frame = 0, data = false) {
        if (!tex?.frames.length) return undefined;
        return ready.get(
          keyOf(
            tex.frames[
              ((Math.floor(frame) % tex.frames.length) + tex.frames.length) % tex.frames.length
            ],
            data,
          ),
        );
      },
      dispose,
    };
  } catch (e) {
    dispose();
    throw e;
  }
}
