'use client';

/**
 * Every word on the Rebar & Rutabaga page, with its key spelled out.
 *
 * This file looks repetitive on purpose, and the repetition is load-bearing.
 * `i18next-parser` extracts by reading the source: it can see
 * `t('course.gravel.name', …)` and cannot see `t(`course.${id}.name`, …)`. A
 * computed key never reaches `locales/en/c-rebar-rutabaga.json`, which means it
 * is never sent for translation, which means all sixteen locales quietly serve
 * the English `defaultValue` forever — the silent failure the root `CLAUDE.md`
 * §5 warns about, and the reason `categoryLabel` in `components/kaikai-debt/`
 * is written as a switch rather than a lookup.
 *
 * So the split is: `lib/rebar-rutabaga/menu.ts` holds what is *true about a
 * course* (its running order, the diameter it is served at, its temperature,
 * which bath it was set in), and this file holds what is *said about it*. The
 * course id is the join. Nothing is duplicated between them.
 *
 * Changing a shipped string here changes English and nothing else —
 * `defaultValue` is only consulted when a key is MISSING — so a reworded course
 * needs a NEW key, not an edited default.
 */

import type { TFunction } from 'i18next';

/*
 * Every key below is written with its namespace in front of it
 * (`c-rebar-rutabaga:course.gravel.name`), and that prefix is not decoration.
 *
 * `useTranslation` is never called in this file — `t` arrives as a parameter —
 * so `i18next-parser` has nothing to infer a namespace from and files every key
 * it finds here under `defaultNamespace`, which is `common`, which is not where
 * this page loads its strings from. An `ns` passed in the options object does
 * not change that; the lexer reads the namespace off the KEY, using the
 * `namespaceSeparator: ':'` set in `i18next-parser.config.js`. i18next resolves
 * the same prefix the same way at runtime, so one literal satisfies both.
 *
 * It has to be a literal, which is why it is repeated rather than held in a
 * constant: a parser that could follow a constant could have followed the
 * template string this file exists to avoid.
 */

export interface CourseText {
  name: string;
  blurb: string;
  bath: string;
  pairing: string;
  allergens: string;
}

/** The nine courses, in running order. Keys match `Course.id`. */
export function courseText(id: string, t: TFunction): CourseText {
  switch (id) {
    case 'birch-caviar':
      return {
        name: t('c-rebar-rutabaga:course.birch-caviar.name', {
          defaultValue: 'Birch Sap Caviar',
        }),
        blurb: t('c-rebar-rutabaga:course.birch-caviar.blurb', {
          defaultValue:
            'Eleven days of tapping a stand of birch north of Alingsås, reduced to a syrup, bound at half a per cent alginate and dropped pearl by pearl into a chilled calcium bath. Three hundred pearls. One spoon. There is no second spoon.',
        }),
        bath: t('c-rebar-rutabaga:course.birch-caviar.bath', {
          defaultValue: '0.5 % alginate → 0.5 % CaCl₂, 45 s',
        }),
        pairing: t('c-rebar-rutabaga:course.birch-caviar.pairing', {
          defaultValue: 'None. It would be in the way.',
        }),
        allergens: t('c-rebar-rutabaga:course.birch-caviar.allergens', {
          defaultValue: 'None',
        }),
      };
    case 'rye-espuma':
      return {
        name: t('c-rebar-rutabaga:course.rye-espuma.name', {
          defaultValue: 'Rye Air, Cultured Butter Gel',
        }),
        blurb: t('c-rebar-rutabaga:course.rye-espuma.blurb', {
          defaultValue:
            'The bread course, taken apart. Thirty-six hours of sourdough becomes an air held up on soy lecithin; Tuesday’s churned butter becomes a gel set with agar at two grams a litre. It weighs almost nothing and people still fill up on it.',
        }),
        bath: t('c-rebar-rutabaga:course.rye-espuma.bath', {
          defaultValue: '0.6 % lecithin, sheared 90 s',
        }),
        pairing: t('c-rebar-rutabaga:course.rye-espuma.pairing', {
          defaultValue: 'Pilsner, Bruket Bryggeri',
        }),
        allergens: t('c-rebar-rutabaga:course.rye-espuma.allergens', {
          defaultValue: 'Gluten, milk, soy',
        }),
      };
    case 'oyster-reverse':
      return {
        name: t('c-rebar-rutabaga:course.oyster-reverse.name', {
          defaultValue: 'Oyster, Reverse-Spherified',
        }),
        blurb: t('c-rebar-rutabaga:course.oyster-reverse.blurb', {
          defaultValue:
            'A Bohuslän oyster goes back inside a sphere of its own liquor. Reverse spherification, because the oyster brings calcium of its own and a direct bath would set it through to the middle — which is a firm oyster, which is not an oyster.',
        }),
        bath: t('c-rebar-rutabaga:course.oyster-reverse.bath', {
          defaultValue: '2 % calcium lactate → 0.5 % alginate, 90 s',
        }),
        pairing: t('c-rebar-rutabaga:course.oyster-reverse.pairing', {
          defaultValue: 'Riesling, Mosel 2021',
        }),
        allergens: t('c-rebar-rutabaga:course.oyster-reverse.allergens', {
          defaultValue: 'Molluscs',
        }),
      };
    case 'rutabaga-400':
      return {
        name: t('c-rebar-rutabaga:course.rutabaga-400.name', {
          defaultValue: 'Rutabaga Sphere, 400 Days',
        }),
        blurb: t('c-rebar-rutabaga:course.rutabaga-400.blurb', {
          defaultValue:
            'A swede buried in salt for longer than most restaurants stay open, pressed to a consommé and set into a single ravioli sphere that holds until it reaches 62 °C and then does not. It tastes like a memory of beef. Guests cry. We have stopped asking why.',
        }),
        bath: t('c-rebar-rutabaga:course.rutabaga-400.bath', {
          defaultValue: '2 % calcium lactate → 0.5 % alginate, 3 min',
        }),
        pairing: t('c-rebar-rutabaga:course.rutabaga-400.pairing', {
          defaultValue: 'Savagnin, Jura 2018',
        }),
        allergens: t('c-rebar-rutabaga:course.rutabaga-400.allergens', {
          defaultValue: 'None',
        }),
      };
    case 'cod-nitro':
      return {
        name: t('c-rebar-rutabaga:course.cod-nitro.name', {
          defaultValue: 'Cod Collar, Koji, Nitro',
        }),
        blurb: t('c-rebar-rutabaga:course.cod-nitro.blurb', {
          defaultValue:
            'The collar — the part the fishmonger keeps for himself — cured four days in barley koji, then the butter sauce is frozen round it at −196 °C and shatters on the spoon. Eaten with your hands. There is a cloth. You will need the cloth.',
        }),
        bath: t('c-rebar-rutabaga:course.cod-nitro.bath', {
          defaultValue: 'LN₂, −196 °C, 20 s',
        }),
        pairing: t('c-rebar-rutabaga:course.cod-nitro.pairing', {
          defaultValue: 'Chablis 1er Cru, 2020',
        }),
        allergens: t('c-rebar-rutabaga:course.cod-nitro.allergens', {
          defaultValue: 'Fish, milk',
        }),
      };
    case 'marrow-pearls':
      return {
        name: t('c-rebar-rutabaga:course.marrow-pearls.name', {
          defaultValue: 'Bone Marrow Pearls, Lingonberry',
        }),
        blurb: t('c-rebar-rutabaga:course.marrow-pearls.blurb', {
          defaultValue:
            'Marrow roasted at 240 °C until it surrenders, then dropped as pearls into a lingonberry fluid gel sheared out of low-acyl gellan. The berries are left sour on purpose, because something on this plate has to have standards.',
        }),
        bath: t('c-rebar-rutabaga:course.marrow-pearls.bath', {
          defaultValue: '0.8 % gellan, sheared at 4 °C',
        }),
        pairing: t('c-rebar-rutabaga:course.marrow-pearls.pairing', {
          defaultValue: 'Blaufränkisch, Burgenland 2019',
        }),
        allergens: t('c-rebar-rutabaga:course.marrow-pearls.allergens', {
          defaultValue: 'None',
        }),
      };
    case 'reindeer-smoke':
      return {
        name: t('c-rebar-rutabaga:course.reindeer-smoke.name', {
          defaultValue: 'Reindeer, Juniper Smoke Sphere',
        }),
        blurb: t('c-rebar-rutabaga:course.reindeer-smoke.blurb', {
          defaultValue:
            'Sarek reindeer, aged twenty-one days, under a sphere inflated with juniper smoke that is broken at the table. A neighbour once called the fire brigade about the embers. It was worth it. He agreed later, at this table, over this course.',
        }),
        bath: t('c-rebar-rutabaga:course.reindeer-smoke.bath', {
          defaultValue: '2 % calcium lactate → 0.5 % alginate, 2 min',
        }),
        pairing: t('c-rebar-rutabaga:course.reindeer-smoke.pairing', {
          defaultValue: 'Syrah, Northern Rhône 2018',
        }),
        allergens: t('c-rebar-rutabaga:course.reindeer-smoke.allergens', {
          defaultValue: 'None',
        }),
      };
    case 'cloudberry-frozen':
      return {
        name: t('c-rebar-rutabaga:course.cloudberry-frozen.name', {
          defaultValue: 'Cloudberry, Frozen Reverse',
        }),
        blurb: t('c-rebar-rutabaga:course.cloudberry-frozen.blurb', {
          defaultValue:
            'Cloudberries picked by one family in Norrbotten who will not tell us where. Frozen into a sphere first so the skin sets round a solid and the middle thaws back to fruit at the table — the first cold thing since the birch, and your palate will make a point of noticing.',
        }),
        bath: t('c-rebar-rutabaga:course.cloudberry-frozen.bath', {
          defaultValue: 'Frozen −18 °C → 0.5 % alginate, 3 min',
        }),
        pairing: t('c-rebar-rutabaga:course.cloudberry-frozen.pairing', {
          defaultValue: 'Sea buckthorn kombucha',
        }),
        allergens: t('c-rebar-rutabaga:course.cloudberry-frozen.allergens', {
          defaultValue: 'Milk',
        }),
      };
    default:
      return {
        name: t('c-rebar-rutabaga:course.gravel.name', {
          defaultValue: 'Gravel',
        }),
        blurb: t('c-rebar-rutabaga:course.gravel.blurb', {
          defaultValue:
            'Not gravel. Chocolate, buckwheat and black malt spheres, tempered and rolled in cocoa aerogel to match the aggregate in the floor you are standing on. Six guests have eaten the floor. We have stopped correcting them.',
        }),
        bath: t('c-rebar-rutabaga:course.gravel.bath', {
          defaultValue: '40 % maltodextrin, folded cold',
        }),
        pairing: t('c-rebar-rutabaga:course.gravel.pairing', {
          defaultValue: 'Coffee, Kaffeverket',
        }),
        allergens: t('c-rebar-rutabaga:course.gravel.allergens', {
          defaultValue: 'Gluten, soy',
        }),
      };
  }
}

export interface MaterialText {
  element: string;
  spec: string;
}

/** The materials schedule, by drawing reference. */
export function materialText(ref: string, t: TFunction): MaterialText {
  switch (ref) {
    case 'M-01':
      return {
        element: t('c-rebar-rutabaga:room.M-01.element', {
          defaultValue: 'Floor',
        }),
        spec: t('c-rebar-rutabaga:room.M-01.spec', {
          defaultValue:
            'Board-formed concrete, original, 1963. Patched where the rebar cages sat. Not polished, and never will be.',
        }),
      };
    case 'M-02':
      return {
        element: t('c-rebar-rutabaga:room.M-02.element', {
          defaultValue: 'Walls',
        }),
        spec: t('c-rebar-rutabaga:room.M-02.spec', {
          defaultValue:
            'Lime plaster over brick, unpainted. Two sections left raw at the client’s insistence. The client is the chef.',
        }),
      };
    case 'M-03':
      return {
        element: t('c-rebar-rutabaga:room.M-03.element', {
          defaultValue: 'Tables',
        }),
        spec: t('c-rebar-rutabaga:room.M-03.spec', {
          defaultValue:
            'Blackened mild steel, 12 mm, waxed. Cold to the touch. We know. It is deliberate.',
        }),
      };
    case 'M-04':
      return {
        element: t('c-rebar-rutabaga:room.M-04.element', {
          defaultValue: 'Chairs',
        }),
        spec: t('c-rebar-rutabaga:room.M-04.spec', {
          defaultValue:
            'Steam-bent ash, oiled, no upholstery. Sourced within 40 km. Comfortable for exactly two hours and fifty minutes.',
        }),
      };
    case 'M-05':
      return {
        element: t('c-rebar-rutabaga:room.M-05.element', {
          defaultValue: 'Light',
        }),
        spec: t('c-rebar-rutabaga:room.M-05.spec', {
          defaultValue: '24 × 40 W tungsten, dimmed to 9 %. This is the part with the star.',
        }),
      };
    case 'M-06':
      return {
        element: t('c-rebar-rutabaga:room.M-06.element', {
          defaultValue: 'Acoustics',
        }),
        spec: t('c-rebar-rutabaga:room.M-06.spec', {
          defaultValue:
            'Wool felt baffles in the roof trusses. You can hear your own table and none of the others.',
        }),
      };
    case 'M-07':
      return {
        element: t('c-rebar-rutabaga:room.M-07.element', {
          defaultValue: 'Pass',
        }),
        spec: t('c-rebar-rutabaga:room.M-07.spec', {
          defaultValue:
            'Stainless, 4.8 m, heated. Visible from every one of the 24 seats, on purpose, at all times.',
        }),
      };
    case 'M-08':
      return {
        element: t('c-rebar-rutabaga:room.M-08.element', {
          defaultValue: 'Bath',
        }),
        spec: t('c-rebar-rutabaga:room.M-08.spec', {
          defaultValue:
            'Calcium chloride, 0.5 %, held at 4 °C behind glass. Nine courses start in it. Guests watch. This was not the original plan.',
        }),
      };
    default:
      return {
        element: t('c-rebar-rutabaga:room.M-09.element', {
          defaultValue: 'Crane rail',
        }),
        spec: t('c-rebar-rutabaga:room.M-09.spec', {
          defaultValue:
            'Retained, 6.2 m above floor. Load-tested. Decorative. Do not ask us to hang anything from it.',
        }),
      };
  }
}

export interface PolicyText {
  title: string;
  body: string;
}

/** The house rules. */
export function policyText(id: string, t: TFunction): PolicyText {
  switch (id) {
    case 'allergies':
      return {
        title: t('c-rebar-rutabaga:policy.allergies.title', {
          defaultValue: 'Allergies',
        }),
        body: t('c-rebar-rutabaga:policy.allergies.body', {
          defaultValue:
            'Tell us when you book, not when you sit down. We will cook around very nearly anything, with one exception: a dislike of rutabaga is a personality matter and we cannot plate around it.',
        }),
      };
    case 'lateness':
      return {
        title: t('c-rebar-rutabaga:policy.lateness.title', {
          defaultValue: 'Lateness',
        }),
        body: t('c-rebar-rutabaga:policy.lateness.body', {
          defaultValue:
            'We hold the table for fifteen minutes. The kitchen is a queue, not a suggestion — course three has been in the bath since you parked.',
        }),
      };
    case 'children':
      return {
        title: t('c-rebar-rutabaga:policy.children.title', {
          defaultValue: 'Children',
        }),
        body: t('c-rebar-rutabaga:policy.children.body', {
          defaultValue:
            'Over twelve, welcome. Under twelve will be bored, and then so will you, and the room carries sound beautifully.',
        }),
      };
    case 'photographs':
      return {
        title: t('c-rebar-rutabaga:policy.photographs.title', {
          defaultValue: 'Photographs',
        }),
        body: t('c-rebar-rutabaga:policy.photographs.body', {
          defaultValue:
            'Take as many as you like. At nine per cent they will all come out brown, and we have made our peace with that.',
        }),
      };
    default:
      return {
        title: t('c-rebar-rutabaga:policy.floor.title', {
          defaultValue: 'The floor',
        }),
        body: t('c-rebar-rutabaga:policy.floor.body', {
          defaultValue:
            'Six guests have attempted to eat the floor after course nine. It is not edible. The dessert is. We have stopped correcting people mid-bite.',
        }),
      };
  }
}
