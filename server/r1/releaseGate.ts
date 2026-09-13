import { TRPCError } from "@trpc/server";

export type ReleaseGateMode = "client" | "synthetic" | "closed";

export type ReleaseGateStatus = {
  mode: ReleaseGateMode;
  clientRuntimeAllowed: boolean;
  syntheticTestAllowed: boolean;
  technicalPilotAllowed: boolean;
};

function explicitlyEnabled(value: string | undefined): boolean {
  return value === "true";
}

function disposableTestDatabase(env: NodeJS.ProcessEnv): boolean {
  const raw = env.DATABASE_URL;
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
    const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    return (
      (parsed.protocol === "mysql:" || parsed.protocol === "mariadb:") &&
      allowedHosts.has(parsed.hostname) &&
      /^lexy_r1_test_[A-Za-z0-9_]+$/.test(databaseName)
    );
  } catch {
    return false;
  }
}

function dedicatedCustomerSecret(env: NodeJS.ProcessEnv): boolean {
  const customerSecret = env.LEXY_CUSTOMER_SESSION_SECRET ?? "";
  return customerSecret.length >= 32 && customerSecret !== (env.JWT_SECRET ?? "");
}

export function getReleaseGateStatus(
  env: NodeJS.ProcessEnv = process.env,
): ReleaseGateStatus {
  // Client mode cannot be enabled on this branch. Reintroduction requires
  // human approval plus a cryptographic manifest verifier in a later change.
  const clientRuntimeAllowed = false;
  const syntheticTestAllowed =
    env.NODE_ENV === "test" &&
    explicitlyEnabled(env.LEXY_R1_SYNTHETIC_TEST_MODE) &&
    env.LEXY_R1_TEST_IDENTITY === "r1-harness" &&
    env.LEXY_R1_DATABASE_CLASS === "disposable_test" &&
    disposableTestDatabase(env) &&
    dedicatedCustomerSecret(env);

  return {
    mode: clientRuntimeAllowed
      ? "client"
      : syntheticTestAllowed
        ? "synthetic"
        : "closed",
    clientRuntimeAllowed,
    syntheticTestAllowed,
    technicalPilotAllowed: clientRuntimeAllowed || syntheticTestAllowed,
  };
}

export function assertTechnicalPilotAllowed(): ReleaseGateStatus {
  const status = getReleaseGateStatus();
  if (!status.technicalPilotAllowed) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Pilot is unavailable",
    });
  }
  return status;
}

export function assertSyntheticTestAllowed(): ReleaseGateStatus {
  const status = getReleaseGateStatus();
  if (!status.syntheticTestAllowed) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Synthetic pilot mode is unavailable",
    });
  }
  return status;
}
