/**
 * Admin logic for the alias-miss queue: list what the scrapers could not match,
 * map a miss to a school, or ignore it. Mapping goes through `planAliasMapping`
 * so the one-key-per-source rule holds; an existing alias is never moved.
 */
import { planAliasMapping } from '../engine/alias-rules';
import type {
  AliasMissDto,
  SchoolOptionDto,
} from '@features/medschools/medschools.contract';
import type { MedPrisma } from '../scrape/types';

export type MapAliasMissResult =
  | {
      ok: true;
      aliasId: string;
    }
  | {
      ok: false;
      status:
        | 404
        | 409;
      code: string;
      message: string;
    };

export async function listAliasMisses(
  prisma: MedPrisma,
): Promise<{
  misses: AliasMissDto[];
  schools: SchoolOptionDto[];
}> {
  const rows =
    await prisma.medSchoolAliasMiss.findMany(
      {
        where:
          {
            resolvedSchoolId:
              null,
            ignored: false,
          },
        orderBy:
          {
            seenCount:
              'desc',
          },
      },
    );
  const misses =
    rows
      .filter(
        (
          r,
        ) =>
          r.resolvedSchoolId ===
            null &&
          !r.ignored,
      )
      .sort(
        (
          a,
          b,
        ) =>
          b.seenCount -
          a.seenCount,
      )
      .map(
        (
          r,
        ) => ({
          id: r.id,
          source:
            r.source,
          sourceKey:
            r.sourceKey,
          seenCount:
            r.seenCount,
          firstSeenAt:
            r.firstSeenAt.toISOString(),
          lastSeenAt:
            r.lastSeenAt.toISOString(),
        }),
      );
  const schoolRows =
    await prisma.medSchool.findMany(
      {
        where:
          {
            active: true,
          },
        orderBy:
          {
            name: 'asc',
          },
      },
    );
  const schools =
    schoolRows
      .map(
        (
          s,
        ) => ({
          id: s.id,
          name: s.name,
          shortName:
            s.shortName,
          state:
            s.state,
          degree:
            s.degree,
        }),
      )
      .sort(
        (
          a,
          b,
        ) =>
          a.name.localeCompare(
            b.name,
          ),
      );
  return {
    misses,
    schools,
  };
}

function errCode(
  err: unknown,
): {
  code?: string;
  message?: string;
} {
  return (
    (err as {
      code?: string;
      message?: string;
    } | null) ??
    {}
  );
}

function isUniqueViolation(
  err: unknown,
): boolean {
  const e =
    errCode(
      err,
    );
  return (
    e.code ===
      'P2002' ||
    /unique constraint/i.test(
      e.message ??
        '',
    )
  );
}

function isSerializationFailure(
  err: unknown,
): boolean {
  const e =
    errCode(
      err,
    );
  return (
    e.code ===
      'P2034' ||
    e.code ===
      '40001'
  );
}

async function mapInTransaction(
  tx: MedPrisma,
  input: {
    missId: string;
    schoolId: string;
  },
): Promise<MapAliasMissResult> {
  const miss =
    await tx.medSchoolAliasMiss.findFirst(
      {
        where:
          {
            id: input.missId,
          },
      },
    );
  if (
    !miss
  )
    return {
      ok: false,
      status: 404,
      code: 'MISS_NOT_FOUND',
      message:
        'alias miss not found',
    };
  const school =
    await tx.medSchool.findUnique(
      {
        where:
          {
            id: input.schoolId,
          },
      },
    );
  if (
    !school
  )
    return {
      ok: false,
      status: 404,
      code: 'SCHOOL_NOT_FOUND',
      message:
        'school not found',
    };
  if (
    !school.active
  )
    return {
      ok: false,
      status: 409,
      code: 'SCHOOL_INACTIVE',
      message:
        'school is inactive',
    };

  const schoolAliases =
    await tx.medSchoolAlias.findMany(
      {
        where:
          {
            schoolId:
              school.id,
          },
      },
    );
  const owners =
    await tx.medSchoolAlias.findMany(
      {
        where:
          {
            source:
              miss.source,
            sourceKey:
              miss.sourceKey,
          },
      },
    );
  const owner =
    owners[0] ??
    null;
  const plan =
    planAliasMapping(
      {
        source:
          miss.source,
        sourceKey:
          miss.sourceKey,
        schoolId:
          school.id,
        schoolAliases,
        keyOwner:
          owner
            ? {
                schoolId:
                  owner.schoolId,
              }
            : null,
      },
    );
  if (
    !plan.ok
  )
    return {
      ok: false,
      status: 409,
      code: plan.code,
      message:
        plan.message,
    };

  // Already mapped to this school: idempotent, nothing moves.
  const aliasId =
    owner
      ? owner.id
      : (
          await tx.medSchoolAlias.create(
            {
              data: {
                schoolId:
                  school.id,
                source:
                  miss.source,
                sourceKey:
                  miss.sourceKey,
              },
            },
          )
        )
          .id;
  await tx.medSchoolAliasMiss.update(
    {
      where:
        {
          id: miss.id,
        },
      data: {
        resolvedSchoolId:
          school.id,
        ignored: false,
      },
    },
  );
  return {
    ok: true,
    aliasId,
  };
}

/**
 * Alias create and miss resolve are one transaction. Serializable (the repo's
 * precedent, battlepass claim) rather than an advisory lock: there is no unique
 * constraint on (schoolId, source), so two admins mapping different CYCLETRACK
 * keys to one school would both pass the check; Postgres aborts one of them with
 * a serialization failure, reported as 409 CONFLICT_RETRY. A lost unique race on
 * the key itself is retried once, so it then resolves as idempotent or as
 * KEY_MAPPED_ELSEWHERE from the fresh read.
 */
export async function mapAliasMiss(
  prisma: MedPrisma,
  input: {
    missId: string;
    schoolId: string;
  },
): Promise<MapAliasMissResult> {
  for (
    let attempt = 0;
    ;
    attempt++
  ) {
    try {
      return await prisma.$transaction(
        (
          tx,
        ) =>
          mapInTransaction(
            tx,
            input,
          ),
        {
          isolationLevel:
            'Serializable',
        },
      );
    } catch (err) {
      if (
        isSerializationFailure(
          err,
        )
      ) {
        return {
          ok: false,
          status: 409,
          code: 'CONFLICT_RETRY',
          message:
            'another change touched this school at the same time; retry',
        };
      }
      if (
        !isUniqueViolation(
          err,
        )
      )
        throw err;
      if (
        attempt >
        0
      ) {
        return {
          ok: false,
          status: 409,
          code: 'ALREADY_MAPPED',
          message:
            'this key was mapped by another request',
        };
      }
    }
  }
}

export async function ignoreAliasMiss(
  prisma: MedPrisma,
  missId: string,
): Promise<
  | {
      ok: true;
    }
  | {
      ok: false;
      status: 404;
      code: string;
      message: string;
    }
> {
  const miss =
    await prisma.medSchoolAliasMiss.findFirst(
      {
        where:
          {
            id: missId,
          },
      },
    );
  if (
    !miss
  )
    return {
      ok: false,
      status: 404,
      code: 'MISS_NOT_FOUND',
      message:
        'alias miss not found',
    };
  await prisma.medSchoolAliasMiss.update(
    {
      where:
        {
          id: miss.id,
        },
      data: {
        ignored: true,
      },
    },
  );
  return {
    ok: true,
  };
}
