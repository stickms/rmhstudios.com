/**
 * The painting beside the sign-in form: one of several, picked at random on each visit, developed in three steps.
 *
 * This is its own module, loaded by `app/routes/login.tsx` after the page has hydrated, and not imported there:
 * every route module is statically part of the client entry, so anything the login route imports at the top is
 * downloaded and parsed on every page of the site, and the entry has a byte budget (`scripts/check-bundle-budget.ts`).
 * The painting is a few KB (the previews alone are inlined data URIs) that only `/login` needs.
 *
 * The picture is picked after mount, not while rendering: the server's page is cached and has to be the same for
 * everyone, and a choice made during render would not match what the client chooses. The last one shown is remembered,
 * so two visits in a row never show the same picture. It develops in three steps so a slow connection sees something at
 * once and the low quality never shows: a 48px preview (a few hundred bytes, inlined) as soon as the picture is chosen,
 * then a soft 320px version (a few KB), then the real one, each fading in over the last (Steel M9). The blur is baked
 * into those two small images, so it fades out step by step without a CSS filter (Steel B2).
 *
 * It fills its parent, which is `relative`, clips and carries the border and the placeholder colour.
 */
import { useEffect, useRef, useState } from 'react';
import { useArrival } from '@/components/ui/arrive';
import { LOGIN_ART_KEY, loginArtSrc, pickLoginArt, type LoginArt } from '@/lib/auth/login-art';
import { LOGIN_ART_PREVIEWS } from '@/lib/auth/login-art-previews';
import { readString, writeString } from '@/lib/core/persist';
import { cn } from '@/lib/utils';

/** Every layer fills the frame and shows the same part of the square picture, so the steps line up exactly. */
const LAYER = 'absolute inset-0 size-full object-cover object-[50%_46%] lg:object-[50%_50%]';

export function LoginPainting() {
  const [art, setArt] = useState<LoginArt | null>(null);
  const [softLoaded, setSoftLoaded] = useState(false);
  const [artLoaded, setArtLoaded] = useState(false);
  const previewArrive = useArrival(art !== null);
  const softArrive = useArrival(softLoaded);
  const artArrive = useArrival(artLoaded);

  // Once per mount: React's development double-run of effects would otherwise pick twice, and the second pick only
  // avoids the first, so it could land on the picture the previous visit showed.
  const picked = useRef(false);
  useEffect(() => {
    if (picked.current) return;
    picked.current = true;
    const next = pickLoginArt(readString(LOGIN_ART_KEY));
    writeString(LOGIN_ART_KEY, next);
    setArt(next);
  }, []);

  if (!art) return null;
  return (
    <>
      <img src={LOGIN_ART_PREVIEWS[art]} alt="" width={48} height={48} className={cn(LAYER, previewArrive)} />
      <img
        src={loginArtSrc(art, 320)}
        alt=""
        width={320}
        height={320}
        decoding="async"
        onLoad={() => setSoftLoaded(true)}
        className={cn(LAYER, !softLoaded && 'invisible', softArrive)}
      />
      {/* The large file from 640px up, where the picture is a band across a tablet or half of a desktop; the small one
          on a phone. */}
      <picture>
        <source media="(min-width: 640px)" srcSet={loginArtSrc(art, 1600)} type="image/webp" />
        <img
          src={loginArtSrc(art, 800)}
          alt=""
          width={800}
          height={800}
          decoding="async"
          fetchPriority="low"
          onLoad={() => setArtLoaded(true)}
          className={cn(LAYER, !artLoaded && 'invisible', artArrive)}
        />
      </picture>
    </>
  );
}
