import express, {
  type ErrorRequestHandler,
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import {
  CUSTOMER_SESSION_COOKIE_NAME,
  getCustomerSessionCookieOptions,
} from "../../_core/cookies";
import { newR1Id } from "../ids";
import { consumeMagicLink } from "./magicLinkService";

export const MAGIC_LINK_CONSUME_PATH = "/api/r1/auth/magic-link/consume";
const NEUTRAL_RESPONSE = Object.freeze({ consumed: false as const });

export type ConsumeMagicLinkFn = typeof consumeMagicLink;

export function registerMagicLinkRoutes(
  app: Pick<Express, "all">,
  consume: ConsumeMagicLinkFn = consumeMagicLink,
): void {
  const rejectMalformedJson: ErrorRequestHandler = (_error, _req, res, _next) => {
    res.status(200).json(NEUTRAL_RESPONSE);
  };

  app.all(
    MAGIC_LINK_CONSUME_PATH,
    (req: Request, res: Response, next: NextFunction) => {
      setPrivateResponseHeaders(res);
      if (req.method !== "POST") {
        res.status(405).json(NEUTRAL_RESPONSE);
        return;
      }
      next();
    },
    express.json({ limit: "1kb", strict: true, type: "application/json" }),
    rejectMalformedJson,
    (req: Request, res: Response) => handleMagicLinkConsume(req, res, consume),
  );
}

export async function handleMagicLinkConsume(
  req: Request,
  res: Response,
  consume: ConsumeMagicLinkFn = consumeMagicLink,
): Promise<void> {
  setPrivateResponseHeaders(res);
  if (req.method !== "POST") {
    res.status(405).json(NEUTRAL_RESPONSE);
    return;
  }
  if (!isBodyToken(req.body)) {
    res.status(200).json(NEUTRAL_RESPONSE);
    return;
  }

  try {
    const result = await consume(req.body.token, newR1Id("request"));
    if (!result.consumed) {
      res.status(200).json(NEUTRAL_RESPONSE);
      return;
    }

    res.cookie(
      CUSTOMER_SESSION_COOKIE_NAME,
      result.sessionToken,
      getCustomerSessionCookieOptions(result.expiresAt),
    );
    res.status(200).json({ consumed: true });
  } catch {
    res.status(200).json(NEUTRAL_RESPONSE);
  }
}

function setPrivateResponseHeaders(res: Response): void {
  res.set("Referrer-Policy", "no-referrer");
  res.set("Cache-Control", "no-store");
}

function isBodyToken(body: unknown): body is { token: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const record = body as Record<string, unknown>;
  return (
    Object.keys(record).length === 1 &&
    typeof record.token === "string" &&
    record.token.length <= 200
  );
}
