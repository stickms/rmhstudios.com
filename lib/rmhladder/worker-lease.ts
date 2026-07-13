export interface WorkerLeasePrisma {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

export interface WorkerLease {
  name: string;
  ownerId: string;
  ttlMs: number;
}

export async function acquireWorkerLease(
  prisma: WorkerLeasePrisma,
  lease: WorkerLease,
  now = new Date(),
): Promise<boolean> {
  const expiresAt = new Date(now.getTime() + lease.ttlMs);
  const rows = await prisma.$queryRawUnsafe<Array<{ ownerId: string }>>(
    `INSERT INTO "ladder_worker_lease" ("name", "ownerId", "expiresAt", "heartbeatAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $4)
     ON CONFLICT ("name") DO UPDATE
       SET "ownerId" = EXCLUDED."ownerId",
           "expiresAt" = EXCLUDED."expiresAt",
           "heartbeatAt" = EXCLUDED."heartbeatAt",
           "updatedAt" = EXCLUDED."updatedAt"
       WHERE "ladder_worker_lease"."expiresAt" <= $4
          OR "ladder_worker_lease"."ownerId" = EXCLUDED."ownerId"
     RETURNING "ownerId"`,
    lease.name,
    lease.ownerId,
    expiresAt,
    now,
  );
  return rows.some((row) => row.ownerId === lease.ownerId);
}

export async function heartbeatWorkerLease(
  prisma: WorkerLeasePrisma,
  lease: WorkerLease,
  now = new Date(),
): Promise<boolean> {
  const expiresAt = new Date(now.getTime() + lease.ttlMs);
  const updated = await prisma.$executeRawUnsafe(
    `UPDATE "ladder_worker_lease"
     SET "expiresAt" = $3, "heartbeatAt" = $4, "updatedAt" = $4
     WHERE "name" = $1 AND "ownerId" = $2`,
    lease.name,
    lease.ownerId,
    expiresAt,
    now,
  );
  return updated === 1;
}

export async function releaseWorkerLease(
  prisma: WorkerLeasePrisma,
  lease: Pick<WorkerLease, 'name' | 'ownerId'>,
): Promise<boolean> {
  const deleted = await prisma.$executeRawUnsafe(
    `DELETE FROM "ladder_worker_lease" WHERE "name" = $1 AND "ownerId" = $2`,
    lease.name,
    lease.ownerId,
  );
  return deleted === 1;
}
