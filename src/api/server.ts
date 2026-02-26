import cors from "cors";
import express, { type Request, type Response } from "express";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

import { requireApiKey } from "./middleware/auth.js";
import projectsRouter from "./routes/projects.js";
import unitsRouter from "./routes/units.js";
import { getEnv } from "../lib/env.js";

const app = express();
const env = getEnv();
const port = env.port;
const corsOrigin = env.corsOrigin;

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "WPML XLIFF Translation API",
      version: "1.0.0"
    },
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key"
        }
      }
    },
    security: [
      {
        ApiKeyAuth: []
      }
    ],
    paths: {
      "/api/projects": {
        get: {
          summary: "List projects"
        }
      },
      "/api/projects/{id}": {
        get: {
          summary: "Get project"
        }
      },
      "/api/projects/{id}/units": {
        get: {
          summary: "List project units"
        }
      },
      "/api/projects/{id}/readiness": {
        get: {
          summary: "Get project readiness"
        }
      },
      "/api/units/{id}": {
        get: {
          summary: "Get unit"
        },
        patch: {
          summary: "Update unit"
        }
      }
    }
  },
  apis: []
});

app.use(cors({ origin: corsOrigin }));
app.use(express.json());
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use("/api", requireApiKey);
app.use("/api/projects", projectsRouter);
app.use("/api/units", unitsRouter);

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ ok: true });
});

app.listen(port, () => {
  console.log(`API server listening on :${port}`);
});
