import { z } from "zod";

export const betSchema = z.object({
  bin: z.number().int().min(0).max(4),
  // Cap the stake like every other economy endpoint — an unbounded bet let a
  // single request move an arbitrary balance.
  amount: z.number().int().min(1).max(100_000),
});

export const purchaseSchema = z.object({
  item: z.enum(["profile-pet"]),
});

export type BetInput = z.infer<typeof betSchema>;
export type PurchaseInput = z.infer<typeof purchaseSchema>;
