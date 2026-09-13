import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CUSTOMER_SESSION_COOKIE_NAME } from "../../_core/cookies";
import {
  MAGIC_LINK_CONSUME_PATH,
  registerMagicLinkRoutes,
  type ConsumeMagicLinkFn,
} from "./magicLinkRoutes";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.close(() => resolve());
  })));
});

describe("Magic Link Express route", () => {
  it.each(["GET", "PUT", "DELETE"]) (
    "returns an explicit neutral 405 for %s at the exact path",
    async method => {
      const consume = vi.fn();
      const response = await send(consume, method);
      expect(response.status).toBe(405);
      expect(response.body).toEqual({ consumed: false });
      expectPrivateHeaders(response.headers);
      expect(consume).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["missing body", undefined, undefined],
    ["malformed JSON", "{", "application/json"],
    ["missing token", JSON.stringify({}), "application/json"],
    ["extra field", JSON.stringify({ token: "x", extra: true }), "application/json"],
    ["overlong token", JSON.stringify({ token: "x".repeat(201) }), "application/json"],
    ["non JSON", JSON.stringify({ token: "x" }), "text/plain"],
  ])("returns a neutral 200 for %s", async (_label, body, contentType) => {
    const consume = vi.fn();
    const response = await send(consume, "POST", body, contentType);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ consumed: false });
    expectPrivateHeaders(response.headers);
    expect(consume).not.toHaveBeenCalled();
  });

  it("uses only the JSON body token and ignores query/header token candidates", async () => {
    const consume = vi.fn().mockResolvedValue({ consumed: false });
    const response = await send(
      consume,
      "POST",
      JSON.stringify({ token: "body-token" }),
      "application/json",
      `${MAGIC_LINK_CONSUME_PATH}?token=query-token`,
      { authorization: "Bearer header-token", "x-magic-link-token": "header-token" },
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ consumed: false });
    expect(consume).toHaveBeenCalledTimes(1);
    expect(consume.mock.calls[0]?.[0]).toBe("body-token");
    expect(String(consume.mock.calls[0]?.[1])).toMatch(/^request_/);
  });

  it("sets the exact secure host-only customer cookie only on successful consumption", async () => {
    const expiresAt = new Date("2026-01-01T08:00:00.000Z");
    const response = await send(
      vi.fn().mockResolvedValue({ consumed: true, sessionToken: "session-token", expiresAt }),
      "POST",
      JSON.stringify({ token: "magic-token" }),
      "application/json",
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ consumed: true });
    expect(response.headers.get("set-cookie")).toBe(
      `${CUSTOMER_SESSION_COOKIE_NAME}=session-token; Path=/; Expires=Thu, 01 Jan 2026 08:00:00 GMT; HttpOnly; Secure; SameSite=Lax`,
    );
    expectPrivateHeaders(response.headers);
  });

  it("neutralizes invalid tokens, replays, gate failures, and internal errors", async () => {
    for (const outcome of [
      { consumed: false },
      new Error("Pilot secret/config detail"),
      new Error("database URL detail"),
    ]) {
      const consume = outcome instanceof Error
        ? vi.fn().mockRejectedValue(outcome)
        : vi.fn().mockResolvedValue(outcome);
      const response = await send(
        consume,
        "POST",
        JSON.stringify({ token: "opaque-token" }),
        "application/json",
      );
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ consumed: false });
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(JSON.stringify(response.body)).not.toMatch(/Pilot|database|config|secret/i);
    }
  });
});

async function send(
  consume: ConsumeMagicLinkFn,
  method: string,
  body?: string,
  contentType?: string,
  path = MAGIC_LINK_CONSUME_PATH,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: unknown; headers: Headers }> {
  const app = express();
  registerMagicLinkRoutes(app, consume);
  app.use((_req, res) => res.status(418).json({ fallback: true }));
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    body,
    headers: {
      ...(contentType ? { "content-type": contentType } : {}),
      ...headers,
    },
  });
  return {
    status: response.status,
    body: await response.json(),
    headers: response.headers,
  };
}

function expectPrivateHeaders(headers: Headers): void {
  expect(headers.get("referrer-policy")).toBe("no-referrer");
  expect(headers.get("cache-control")).toBe("no-store");
}
