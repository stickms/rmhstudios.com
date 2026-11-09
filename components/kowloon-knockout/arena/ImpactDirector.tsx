import type { MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import type { GameSession, RenderFighter } from '@/lib/kowloon-knockout/net/session';
import type { ImpactBus } from '@/lib/kowloon-knockout/render/impact';
import { toImpactEvent } from '@/lib/kowloon-knockout/render/impactEvents';
import { stepBus } from '@/lib/kowloon-knockout/render/impactStep';
import { jellyMotionLevel } from '@/lib/jelly/tiers';

/** Runs before the fighters and the camera read the bus (see the priority). */
export const DIRECTOR_PRIORITY = -100;

/**
 * The one consumer of the session's event queue. Each frame it advances the ImpactBus, then drains
 * `session.drainFx()` — exactly once, so nothing else may — and turns every hit, block and knockout into an
 * impact on the bus; the camera, the fighters and the effects all react to the bus, not to the sim.
 *
 * With Jelly motion Still a blow only gets a few sparks (`emitCalm`): no shake, no freeze, no slow motion,
 * no ring.
 *
 * Negative priority puts it before every default-priority subscriber (fighters, camera) and, in R3F, does
 * not take over rendering the way a positive priority does.
 */
export default function ImpactDirector({ session, framesRef, bus }: {
    session: GameSession;
    framesRef: MutableRefObject<RenderFighter[]>;
    bus: ImpactBus;
}) {
    useFrame((_, delta) => {
        const now = performance.now();
        stepBus(bus, delta, now);
        const events = session.drainFx();
        if (events.length === 0) return;
        const calm = jellyMotionLevel() === 'still';
        for (const e of events) {
            const impact = toImpactEvent(e, framesRef.current);
            if (!impact) continue;
            if (calm) bus.emitCalm(impact);
            else bus.emit(impact, now);
        }
    }, DIRECTOR_PRIORITY);
    return null;
}
