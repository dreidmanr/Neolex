import { TRPCError } from "@trpc/server";

export type ReleaseGateMode = "client" | "synthetic" | "closed";

export type ReleaseGateStatus = {
  mode: ReleaseGateMode;
  clientRuntimeAllowed: boolean;
  syntheticTestAllowed: boolean;
  technicalPilotAllowed: boolean;
};

export type MagicLinkTestGateStatus = ReleaseGateStatus & {
  magicLinkTestAllowed: boolean;
};

export type PromoAccessTestGateStatus = MagicLinkTestGateStatus & {
  promoAccessTestAllowed: boolean;
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

export function isMagicLinkTestAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const status = getReleaseGateStatus(env);
  if (!status.syntheticTestAllowed || env.LEXY_R1_EMAIL_TRANSPORT !== "test") {
    return false;
  }

  const dedicatedSecrets = [
    env.LEXY_R1_MAGIC_LINK_SECRET ?? "",
    env.LEXY_R1_EMAIL_IDENTITY_PEPPER ?? "",
    env.LEXY_R1_RATE_LIMIT_PEPPER ?? "",
  ];
  if (dedicatedSecrets.some(secret => secret.length < 32)) return false;
  if (new Set(dedicatedSecrets).size !== dedicatedSecrets.length) return false;

  const authoritySecrets = new Set([
    env.LEXY_CUSTOMER_SESSION_SECRET ?? "",
    env.JWT_SECRET ?? "",
  ]);
  return dedicatedSecrets.every(secret => !authoritySecrets.has(secret));
}

export function assertMagicLinkTestAllowed(): MagicLinkTestGateStatus {
  const status = getReleaseGateStatus();
  const magicLinkTestAllowed = isMagicLinkTestAllowed();
  if (!magicLinkTestAllowed) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Pilot is unavailable",
    });
  }
  return { ...status, magicLinkTestAllowed };
}

export function isPromoAccessTestAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isMagicLinkTestAllowed(env) || env.LEXY_R1_PAYMENT_PROVIDER !== "disabled") {
    return false;
  }

  const campaignId = env.LEXY_R1_PROMO_CAMPAIGN_ID ?? "";
  if (!/^[A-Za-z][A-Za-z0-9_-]{2,63}$/.test(campaignId)) return false;

  const allSecrets = [
    env.LEXY_CUSTOMER_SESSION_SECRET ?? "",
    env.JWT_SECRET ?? "",
    env.LEXY_R1_MAGIC_LINK_SECRET ?? "",
    env.LEXY_R1_EMAIL_IDENTITY_PEPPER ?? "",
    env.LEXY_R1_RATE_LIMIT_PEPPER ?? "",
    env.LEXY_R1_PROMO_VERIFIER ?? "",
    env.LEXY_R1_PROMO_VERIFIER_PEPPER ?? "",
  ];
  if (allSecrets.some(secret => secret.length < 32)) return false;
  return new Set(allSecrets).size === allSecrets.length;
}

export function assertPromoAccessTestAllowed(): PromoAccessTestGateStatus {
  const status = getReleaseGateStatus();
  const magicLinkTestAllowed = isMagicLinkTestAllowed();
  const promoAccessTestAllowed = isPromoAccessTestAllowed();
  if (!promoAccessTestAllowed) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Pilot is unavailable",
    });
  }
  return { ...status, magicLinkTestAllowed, promoAccessTestAllowed };
}
