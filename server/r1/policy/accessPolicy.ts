import type { CustomerPrincipal } from "../../_core/context";
import { throwNeutralNotFound } from "./errors";

export type OwnedResource = {
  customerAccountId: string;
};

export function requireOwnedResource<T extends OwnedResource>(
  customer: CustomerPrincipal,
  resource: T | null | undefined,
): T {
  if (!resource || resource.customerAccountId !== customer.accountId) {
    throwNeutralNotFound();
  }
  return resource;
}
