import type { NextFunction, Request, Response } from "express";

export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const expectedApiKey = process.env.API_KEY;

  if (!expectedApiKey) {
    res.status(500).json({ error: "Server misconfiguration: API_KEY is missing" });
    return;
  }

  const providedApiKey = req.header("X-API-Key");

  if (!providedApiKey || providedApiKey !== expectedApiKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
