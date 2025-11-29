import { z } from 'zod';

export const AddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address format');

export const HashSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid transaction hash format');

export const HexSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]*$/, 'Invalid hex string format');

export const ChainIdSchema = z
  .number()
  .int('Chain ID must be an integer')
  .positive('Chain ID must be positive');

export const WeiAmountSchema = z
  .string()
  .regex(/^\d+$/, 'Amount must be a numeric string in wei');

export const GetBalanceInputSchema = z.object({
  chainId: ChainIdSchema,
  address: AddressSchema.optional(),
});

export type GetBalanceInput = z.infer<typeof GetBalanceInputSchema>;

export const SendNativeTokenInputSchema = z.object({
  chainId: ChainIdSchema,
  to: AddressSchema,
  amount: WeiAmountSchema,
});

export type SendNativeTokenInput = z.infer<typeof SendNativeTokenInputSchema>;

export const ReadContractInputSchema = z.object({
  chainId: ChainIdSchema,
  contractAddress: AddressSchema,
  abi: z.array(z.unknown()).min(1, 'ABI must contain at least one element'),
  functionName: z.string().min(1, 'Function name is required'),
  args: z.array(z.unknown()).optional(),
});

export type ReadContractInput = z.infer<typeof ReadContractInputSchema>;

export const WriteContractInputSchema = ReadContractInputSchema.extend({
  value: WeiAmountSchema.optional(),
});

export type WriteContractInput = z.infer<typeof WriteContractInputSchema>;

export const GetTransactionInputSchema = z.object({
  chainId: ChainIdSchema,
  hash: HashSchema,
});

export type GetTransactionInput = z.infer<typeof GetTransactionInputSchema>;

export const EstimateGasInputSchema = z.object({
  chainId: ChainIdSchema,
  to: AddressSchema,
  value: WeiAmountSchema.optional(),
  data: HexSchema.optional(),
});

export type EstimateGasInput = z.infer<typeof EstimateGasInputSchema>;

export const GetWalletBalanceInputSchema = z.object({
  chainId: ChainIdSchema,
});

export type GetWalletBalanceInput = z.infer<typeof GetWalletBalanceInputSchema>;

export function validateInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown,
): T {
  return schema.parse(input);
}

export function safeValidateInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown,
) {
  return schema.safeParse(input);
}

export function formatValidationErrors(
  error: z.ZodError,
): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_root';
    if (!fieldErrors[path]) {
      fieldErrors[path] = [];
    }
    fieldErrors[path].push(issue.message);
  }
  
  return fieldErrors;
}
