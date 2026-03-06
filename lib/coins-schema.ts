import { z } from "zod";

export const betSchema = z.object({
  bin: z.number().int().min(0).max(4),
  amount: z.number().int().min(1),
});

export const purchaseSchema = z.object({
  item: z.enum(["profile-pet"]),
});

export type BetInput = z.infer<typeof betSchema>;
export type PurchaseInput = z.infer<typeof purchaseSchema>;
