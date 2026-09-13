import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { requireOwnedResource } from "./accessPolicy";

const customer = { accountId: "acct-a", sessionId: "sess-a" };

function captureError(resource: { customerAccountId: string } | null): TRPCError {
  try {
    requireOwnedResource(customer, resource);
    throw new Error("Expected policy rejection");
  } catch (error) {
    expect(error).toBeInstanceOf(TRPCError);
    return error as TRPCError;
  }
}

describe("owner policy", () => {
  it("returns owned resources", () => {
    const resource = { customerAccountId: "acct-a", value: 1 };
    expect(requireOwnedResource(customer, resource)).toBe(resource);
  });

  it("uses the same neutral error for another owner and a missing resource", () => {
    const otherOwner = captureError({ customerAccountId: "acct-b" });
    const missing = captureError(null);
    expect({ code: otherOwner.code, message: otherOwner.message }).toEqual({
      code: missing.code,
      message: missing.message,
    });
    expect(otherOwner.code).toBe("NOT_FOUND");
  });
});
