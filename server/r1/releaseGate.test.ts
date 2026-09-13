import { describe, expect, it } from "vitest";
import { getReleaseGateStatus } from "./releaseGate";

const validSyntheticEnv = {
  NODE_ENV: "test",
  LEXY_R1_SYNTHETIC_TEST_MODE: "true",
  LEXY_R1_TEST_IDENTITY: "r1-harness",
  LEXY_R1_DATABASE_CLASS: "disposable_test",
  DATABASE_URL: "mysql://test:test@localhost:3306/lexy_r1_test_gate",
  LEXY_CUSTOMER_SESSION_SECRET: "customer-session-secret-32-bytes-minimum",
  JWT_SECRET: "separate-oauth-secret-32-bytes-minimum",
} satisfies NodeJS.ProcessEnv;

describe("Release 1 gate", () => {
  it("is closed by default", () => {
    expect(getReleaseGateStatus({})).toEqual({
      mode: "closed",
      clientRuntimeAllowed: false,
      syntheticTestAllowed: false,
      technicalPilotAllowed: false,
    });
  });

  it("keeps client runtime disabled even with fake approval and hash flags", () => {
    expect(
      getReleaseGateStatus({
        NODE_ENV: "production",
        LEXY_R1_CLIENT_RUNTIME_ENABLED: "true",
        LEXY_R1_LEGAL_CONFIG_STATUS: "approved",
        LEXY_R1_APPROVED_BUNDLE_HASH: "sha256:fake-approved",
        LEXY_CONFIG_MANIFEST_SHA256: "fake-manifest",
      }),
    ).toMatchObject({
      mode: "closed",
      clientRuntimeAllowed: false,
      technicalPilotAllowed: false,
    });
  });

  it("allows only the exactly identified disposable test harness", () => {
    expect(getReleaseGateStatus(validSyntheticEnv)).toMatchObject({
      mode: "synthetic",
      clientRuntimeAllowed: false,
      syntheticTestAllowed: true,
      technicalPilotAllowed: true,
    });
  });

  it.each([
    ["unset NODE_ENV", { NODE_ENV: undefined }],
    ["development", { NODE_ENV: "development" }],
    ["staging", { NODE_ENV: "staging" }],
    ["missing identity", { LEXY_R1_TEST_IDENTITY: undefined }],
    ["wrong identity", { LEXY_R1_TEST_IDENTITY: "some-test-runner" }],
    ["wrong database class", { LEXY_R1_DATABASE_CLASS: "shared_staging" }],
    ["wrong database marker", { DATABASE_URL: "mysql://test:test@localhost:3306/production" }],
    ["lookalike database marker", { DATABASE_URL: "mysql://test:test@localhost:3306/x_lexy_r1_test_gate" }],
    ["remote mysql database", { DATABASE_URL: "mysql://test:test@db.example.com:3306/lexy_r1_test_gate" }],
    ["non-database protocol", { DATABASE_URL: "https://localhost/lexy_r1_test_gate" }],
    ["database marker with path suffix", { DATABASE_URL: "mysql://test:test@localhost:3306/lexy_r1_test_gate/other" }],
    ["missing customer secret", { LEXY_CUSTOMER_SESSION_SECRET: undefined }],
    ["weak customer secret", { LEXY_CUSTOMER_SESSION_SECRET: "too-short" }],
    ["shared customer secret", {
      LEXY_CUSTOMER_SESSION_SECRET: "same-secret-material-32-bytes-long",
      JWT_SECRET: "same-secret-material-32-bytes-long",
    }],
  ])("fails closed for %s", (_label, override) => {
    expect(
      getReleaseGateStatus({ ...validSyntheticEnv, ...override }),
    ).toMatchObject({
      mode: "closed",
      clientRuntimeAllowed: false,
      syntheticTestAllowed: false,
      technicalPilotAllowed: false,
    });
  });
});
