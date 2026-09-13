import { TRPCError } from "@trpc/server";

export const NEUTRAL_NOT_FOUND_MESSAGE = "Resource not found";

export function throwNeutralNotFound(): never {
  throw new TRPCError({
    code: "NOT_FOUND",
    message: NEUTRAL_NOT_FOUND_MESSAGE,
  });
}

export function throwConflict(message = "Request conflicts with existing state"): never {
  throw new TRPCError({ code: "CONFLICT", message });
}
