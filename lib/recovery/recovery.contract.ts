/**
 * Contracts for /api/account/recovery/** (redesign audit C1, batch 3).
 * Client-safe: response types come from the server modules by `import type`.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { RecoveryCodeStatus } from '@/lib/recovery/codes.server';
import type { RecoveryRequestDTO } from '@/lib/recovery/requests.server';
import type { TrustedContactDTO } from '@/lib/recovery/trusted-contacts.server';

/** How many recovery codes are left. Never the codes. */
export const getRecoveryCodeStatusApi =
  endpoint<{
    res: RecoveryCodeStatus;
  }>()(
    {
      method:
        'GET',
      path: '/api/account/recovery/codes',
    },
  );

/** Replaces the set; the plaintexts are returned ONCE. */
export const generateRecoveryCodesApi =
  endpoint<{
    res: {
      codes: string[];
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/account/recovery/codes',
    },
  );

/** The 72-hour post-recovery hold on coin movement. */
export const getRecoveryHoldApi =
  endpoint<{
    res: {
      active: boolean;
      until:
        | string
        | null;
      recoveredAt:
        | string
        | null;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/account/recovery/hold',
    },
  );

/** Anonymous: redeem the emailed token. 400 / 409 carry `{ error, reason }`. */
export const completeRecoveryApi =
  endpoint<{
    body: {
      requestId: string;
      token: string;
      email: string;
    };
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/account/recovery/complete',
    },
  );

/** Both sides of the trusted-contact relationship. */
export const listTrustedContactsApi =
  endpoint<{
    res: {
      contacts: TrustedContactDTO[];
      trustedFor: TrustedContactDTO[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/account/recovery/contacts',
    },
  );

export const nominateTrustedContactApi =
  endpoint<{
    body: {
      handle: string;
    };
    res: {
      contact: TrustedContactDTO;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/account/recovery/contacts',
    },
  );

/** The nominee accepts. */
export const confirmTrustedContactApi =
  endpoint<{
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/account/recovery/contacts/$id',
    },
  );

export const removeTrustedContactApi =
  endpoint<{
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/account/recovery/contacts/$id',
    },
  );

/** Requests against my account (`mine`) and the ones I can vouch for. */
export const listRecoveryRequestsApi =
  endpoint<{
    res: {
      mine: RecoveryRequestDTO[];
      approvable: RecoveryRequestDTO[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/account/recovery/requests',
    },
  );

/** Anonymous; always `{ ok: true }` so it cannot probe for accounts. */
export const startRecoveryRequestApi =
  endpoint<{
    body: {
      handle: string;
      email: string;
    };
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/account/recovery/requests',
    },
  );

export const approveRecoveryRequestApi =
  endpoint<{
    res: {
      ok: true;
      approvals: number;
      phase: RecoveryRequestDTO['phase'];
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/account/recovery/requests/$id',
    },
  );

export const cancelRecoveryRequestApi =
  endpoint<{
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/account/recovery/requests/$id',
    },
  );
