import { createHmac } from "node:crypto";

export function hashCustomerSessionToken(rawToken: string, secret: string): string {
  return createHmac("sha256", secret).update(rawToken).digest("hex");
}
