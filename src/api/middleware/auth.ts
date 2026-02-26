import type { NextFunction, Request, Response } from "express";

import { getEnv } from "../../lib/env.js";

export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const expectedApiKey = getEnv().apiKey;

  const providedApiKey = req.header("X-API-Key");

  if (!providedApiKey || providedApiKey !== expectedApiKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
