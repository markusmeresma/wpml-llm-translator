import { Router } from "express";

const router = Router();

router.get("/:id", (_req, res) => {
  res.status(501).json({ error: "Not implemented yet" });
});

router.patch("/:id", (_req, res) => {
  res.status(501).json({ error: "Not implemented yet" });
});

export default router;
