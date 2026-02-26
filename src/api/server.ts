import cors from "cors";
import dotenv from "dotenv";
import express, { type Request, type Response } from "express";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? "3000");
const corsOrigin = process.env.CORS_ORIGIN ?? "*";

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ ok: true });
});

app.listen(port, () => {
  console.log(`API server listening on :${port}`);
});
