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

function isUniqueViolation(
  err: unknown,
): boolean {
  const e =
    err as {
      code?: string;
      message?: string;
    } | null;
  return (
    e?.code ===
      'P2002' ||
    /unique constraint/i.test(
      e?.message ??
        '',
    )
  );
}

export async function mapAliasMiss(
  prisma: MedPrisma,
  input: {
    missId: string;
    schoolId: string;
  },
): Promise<MapAliasMissResult> {
  const miss =
    await prisma.medSchoolAliasMiss.findFirst(
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
    await prisma.medSchool.findUnique(
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

  const schoolAliases =
    await prisma.medSchoolAlias.findMany(
      {
        where:
          {
            schoolId:
              school.id,
          },
      },
    );
  const owners =
    await prisma.medSchoolAlias.findMany(
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

  let aliasId: string;
  if (
    owner
  ) {
    aliasId =
      owner.id; // already mapped to this school: idempotent, nothing moves
  } else {
    try {
      const created =
        await prisma.medSchoolAlias.create(
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
        );
      aliasId =
        created.id;
    } catch (err) {
      if (
        !isUniqueViolation(
          err,
        )
      )
        throw err;
      return {
        ok: false,
        status: 409,
        code: 'KEY_MAPPED_ELSEWHERE',
        message: `${miss.source} key "${miss.sourceKey}" is already mapped`,
      };
    }
  }
  await prisma.medSchoolAliasMiss.update(
    {
      where:
        {
          id: miss.id,
        },
      data: {
        resolvedSchoolId:
          school.id,
      },
    },
  );
  return {
    ok: true,
    aliasId,
  };
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
