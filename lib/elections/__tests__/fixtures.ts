/** Hand-trimmed pages in the shape of the real static feed (verified against 2024/2026 files). */
const cand =
  (
    id: string,
    first: string,
    last: string,
    party:
      | 'DEM'
      | 'GOP'
      | 'LIB',
    order: number,
    inc = false,
  ) => ({
    nyt_id:
      id,
    first_name:
      first,
    last_name:
      last,
    suffix:
      null,
    incumbent:
      inc,
    ballot_order:
      order,
    img_url: `https://static01.nyt.com/x/${id}.png`,
    party:
      {
        nyt_id:
          party,
        name:
          party ===
          'DEM'
            ? 'Democrat'
            : party ===
                'GOP'
              ? 'Republican'
              : 'Libertarian',
      },
  });

const unit =
  (
    votes: Record<
      string,
      number
    >,
    leader: string,
    extra: object = {},
  ) => ({
    eevp: 62,
    total_votes:
      Object.values(
        votes,
      ).reduce(
        (
          a,
          b,
        ) =>
          a +
          b,
        0,
      ),
    precincts_total: 1000,
    precincts_reporting: 600,
    candidates:
      Object.entries(
        votes,
      ).map(
        ([
          id,
          v,
        ]) => ({
          nyt_id:
            id,
          votes:
            {
              total:
                v,
            },
          leader:
            id ===
            leader,
        }),
      ),
    ...extra,
  });

export const senatePage =
  {
    races:
      [
        {
          nyt_id:
            'PA-G-S-2026-11-03',
          office:
            'U.S. Senate',
          seat_number:
            '1',
          type: 'General',
          rating:
            'tossup',
          coverage:
            'state',
          candidate_metadata:
            {
              'smith-a':
                cand(
                  'smith-a',
                  'Ann',
                  'Smith',
                  'DEM',
                  1,
                  true,
                ),
              'jones-b':
                cand(
                  'jones-b',
                  'Bob',
                  'Jones',
                  'GOP',
                  2,
                ),
            },
          top_reporting_unit:
            unit(
              {
                'smith-a': 600,
                'jones-b': 400,
              },
              'smith-a',
            ),
          outcome:
            {
              won: [
                'smith-a',
              ],
              gained: false,
              electoral_votes:
                null,
            },
          updated_at:
            '2026-11-04T02:00:00Z',
        },
        {
          nyt_id:
            'OH-S_W-S-2026-11-03',
          office:
            'U.S. Senate',
          type: 'Special General',
          rating:
            'lean-rep',
          coverage:
            'state',
          candidate_metadata:
            {
              'a-x':
                cand(
                  'a-x',
                  'X',
                  'Alpha',
                  'DEM',
                  1,
                ),
              'b-y':
                cand(
                  'b-y',
                  'Y',
                  'Beta',
                  'GOP',
                  2,
                  true,
                ),
              'c-z':
                cand(
                  'c-z',
                  'Z',
                  'Gamma',
                  'LIB',
                  3,
                ),
            },
          top_reporting_unit:
            unit(
              {
                'a-x': 5000,
                'b-y': 5100,
                'c-z': 100,
              },
              'b-y',
            ),
          outcome:
            null,
        },
        {
          nyt_id:
            'TX-G-S-2026-11-03',
          office:
            'U.S. Senate',
          type: 'General',
          rating:
            'likely-rep',
          coverage:
            'state',
          candidate_metadata:
            {
              'p-q':
                cand(
                  'p-q',
                  'P',
                  'Quill',
                  'GOP',
                  1,
                  true,
                ),
              'r-s':
                cand(
                  'r-s',
                  'R',
                  'Stone',
                  'DEM',
                  2,
                ),
            },
          top_reporting_unit:
            null,
          outcome:
            null,
        },
        {
          nyt_id:
            'MI-G-S-2026-11-03',
          office:
            'U.S. Senate',
          type: 'General',
          rating:
            'tossup',
          coverage:
            'state',
          candidate_metadata:
            {
              'm-d':
                cand(
                  'm-d',
                  'M',
                  'Dee',
                  'DEM',
                  1,
                ),
              'm-r':
                cand(
                  'm-r',
                  'M',
                  'Rho',
                  'GOP',
                  2,
                ),
            },
          top_reporting_unit:
            unit(
              {
                'm-d': 300,
                'm-r': 700,
              },
              'm-r',
            ),
          outcome:
            {
              won: [
                'm-r',
              ],
              gained: true,
            },
        },
      ],
    partyControlData:
      {
        results:
          [
            {
              state_postal:
                'US',
              offices:
                {
                  S: {
                    office_id:
                      'S',
                    total: 100,
                    open_seats: 35,
                    num_races_called: 2,
                    to_win:
                      {
                        DEM: 51,
                        GOP: 50,
                        OTH: 51,
                      },
                    current_control:
                      {
                        DEM: 45,
                        GOP: 53,
                        OTH: 2,
                      },
                    party_balance:
                      {
                        DEM: {
                          seats: 36,
                          no_election: 34,
                          flip_count: 0,
                        },
                        GOP: {
                          seats: 33,
                          no_election: 31,
                          flip_count: 1,
                        },
                        OTH: {
                          seats: 0,
                          no_election: 0,
                          flip_count: 0,
                        },
                      },
                  },
                },
            },
          ],
      },
    pollClosingTimes:
      [
        {
          poll_closing_time:
            '2026-11-04T01:00:00.000Z',
          poll_closing_time_display_et:
            '8 p.m.',
          reporting_unit:
            {
              state_postal:
                'PA',
            },
        },
      ],
    resultsMeta:
      {
        resultsUpdatedAt:
          '2026-11-04T02:00:00.000Z',
      },
  };

/** The governor page really does carry the HOUSE roll-up in partyControlData. */
export const governorPage =
  {
    races:
      [
        {
          nyt_id:
            'WI-G-G-2026-11-03',
          office:
            'Governor',
          type: 'General',
          rating:
            'tossup',
          coverage:
            'state',
          candidate_metadata:
            {
              'w-d':
                cand(
                  'w-d',
                  'W',
                  'Dem',
                  'DEM',
                  1,
                ),
              'w-r':
                cand(
                  'w-r',
                  'W',
                  'Rep',
                  'GOP',
                  2,
                ),
            },
          top_reporting_unit:
            unit(
              {
                'w-d': 510,
                'w-r': 490,
              },
              'w-d',
            ),
          outcome:
            {
              won: [
                'w-d',
              ],
              gained: true,
            },
        },
      ],
    partyControlData:
      {
        results:
          [
            {
              state_postal:
                'US',
              offices:
                {
                  H: {
                    office_id:
                      'H',
                    total: 435,
                    party_balance:
                      {},
                  },
                },
            },
          ],
      },
  };

export const housePage =
  {
    races:
      [
        {
          nyt_id:
            'US-G-H-2026-11-03',
          coverage:
            'national',
          candidate_metadata:
            {},
        },
        {
          nyt_id:
            'WY-G-H-1-2026-11-03',
          office:
            'U.S. House',
          seat_number:
            '1',
          type: 'General',
          coverage:
            'multi-county',
          candidate_metadata:
            {
              'h-r':
                cand(
                  'h-r',
                  'H',
                  'Rep',
                  'GOP',
                  1,
                  true,
                ),
            },
          top_reporting_unit:
            null,
          outcome:
            null,
          uncontested: false,
        },
        {
          nyt_id:
            'AL-G-H-2-2026-11-03',
          office:
            'U.S. House',
          seat_number:
            '2',
          type: 'General',
          coverage:
            'multi-county',
          candidate_metadata:
            {
              'a-d':
                cand(
                  'a-d',
                  'A',
                  'Dem',
                  'DEM',
                  1,
                ),
              'a-r':
                cand(
                  'a-r',
                  'A',
                  'Rep',
                  'GOP',
                  2,
                ),
            },
          top_reporting_unit:
            null,
          outcome:
            null,
        },
      ],
  };
