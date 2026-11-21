import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import {
  listPartiesApi,
  schedulePartyApi,
} from '@/lib/rmhtube/parties.contract';
import { scheduleBody } from '@/lib/rmhtube/parties-schema';
import {
  listUpcoming,
  refusalResponse,
  scheduleParty,
} from '@/lib/rmhtube/parties.server';

/** RMHTube watch parties: the landing's upcoming list, and scheduling a new one. */
export const route =
  apiRoute(
    '/api/rmhtube/parties',
    {
      GET: implement(
        listPartiesApi,
        {
          auth: 'optional',
          rateLimit:
            'read',
        },
        async ({
          userId,
        }) => ({
          parties:
            await listUpcoming(
              userId,
            ),
        }),
      ),
      POST: implement(
        schedulePartyApi,
        {
          rateLimit:
            'write',
          body: scheduleBody,
        },
        async ({
          userId,
          body,
        }) => {
          const result =
            await scheduleParty(
              userId,
              body,
            );
          if (
            !result.ok
          )
            return refusalResponse(
              result.reason,
            );
          return Response.json(
            {
              party:
                result.value,
            },
            {
              status: 201,
            },
          );
        },
      ),
    },
  );
