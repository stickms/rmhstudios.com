/** Contracts for the Velum 2099 contract board (redesign audit C1). Client-safe. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  ContractView,
  submitContractSchema,
} from '@/lib/velum2099/contracts';

export const listVelumContractsApi =
  endpoint<{
    res: {
      contracts: ContractView[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/velum2099/contracts',
    },
  );

/** 201 `posted`, or 200 `record` / `slower` when the route was already on the board. */
export const submitVelumContractApi =
  endpoint<{
    body: z.infer<
      typeof submitContractSchema
    >;
    res: {
      result:
        | 'posted'
        | 'record'
        | 'slower';
      previousSeconds?: number;
      contract: ContractView;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/velum2099/contracts',
    },
  );
