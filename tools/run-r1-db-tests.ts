import { spawnSync } from "node:child_process";

const SAFE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function fail(message: string): never {
  // Keep diagnostics intentionally free of URLs, usernames, and passwords.
  console.error(`[r1-db] Refusing to run: ${message}`);
  process.exit(1);
}

function requireExact(name: string, expected: string): void {
  if (process.env[name] !== expected) {
    fail(`${name} must be exactly ${expected}`);
  }
}

function requireLongSecret(name: string): string {
  const secret = process.env[name] ?? "";
  if (secret.length < 32) {
    fail(`${name} must contain at least 32 characters`);
  }
  return secret;
}

function validateEnvironment(): void {
  requireExact("NODE_ENV", "test");
  requireExact("LEXY_R1_SYNTHETIC_TEST_MODE", "true");
  requireExact("LEXY_R1_TEST_IDENTITY", "r1-harness");
  requireExact("LEXY_R1_DATABASE_CLASS", "disposable_test");
  requireExact("LEXY_R1_EMAIL_TRANSPORT", "test");

  const rawDatabaseUrl = process.env.DATABASE_URL;
  if (!rawDatabaseUrl) fail("DATABASE_URL is required");

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(rawDatabaseUrl);
  } catch {
    fail("DATABASE_URL is invalid");
  }

  if (!["mysql:", "mariadb:"].includes(databaseUrl.protocol)) {
    fail("DATABASE_URL must use the mysql or mariadb protocol");
  }
  if (!SAFE_HOSTS.has(databaseUrl.hostname)) {
    fail("DATABASE_URL host must be loopback");
  }
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ""));
  if (!/^lexy_r1_test_[A-Za-z0-9_]+$/.test(databaseName)) {
    fail("database name must exactly match the disposable lexy_r1_test_<slug> form");
  }

  const customerSecret = requireLongSecret("LEXY_CUSTOMER_SESSION_SECRET");
  const jwtSecret = requireLongSecret("JWT_SECRET");
  if (customerSecret === jwtSecret) {
    fail("LEXY_CUSTOMER_SESSION_SECRET must be dedicated and differ from JWT_SECRET");
  }

  const magicLinkSecrets = [
    ["LEXY_R1_MAGIC_LINK_SECRET", requireLongSecret("LEXY_R1_MAGIC_LINK_SECRET")],
    ["LEXY_R1_EMAIL_IDENTITY_PEPPER", requireLongSecret("LEXY_R1_EMAIL_IDENTITY_PEPPER")],
    ["LEXY_R1_RATE_LIMIT_PEPPER", requireLongSecret("LEXY_R1_RATE_LIMIT_PEPPER")],
  ] as const;
  if (new Set([
    customerSecret,
    jwtSecret,
    ...magicLinkSecrets.map(([, secret]) => secret),
  ]).size !== 5) {
    fail("R1 DB secrets and peppers must be pairwise distinct and dedicated");
  }
}

function run(args: string[], label: string): void {
  console.log(`[r1-db] ${label}`);
  const result = spawnSync("pnpm", args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) fail(`${label} could not be started`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

validateEnvironment();
run(["exec", "drizzle-kit", "migrate"], "Applying checked migrations");
run(
  ["exec", "vitest", "run", "--config", "vitest.r1-db.config.ts"],
  "Running isolated integration suite",
);
