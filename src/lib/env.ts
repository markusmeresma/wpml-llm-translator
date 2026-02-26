import dotenv from "dotenv";

dotenv.config();

export interface AppEnv {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  apiKey: string;
  openRouterApiKey: string;
  openRouterModel: string;
  inboxDir: string;
  outboxDir: string;
  corsOrigin: string;
  port: number;
}

let cachedEnv: AppEnv | null = null;

function requireVar(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getEnv(): AppEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsedPort = Number(process.env.PORT ?? "3000");

  if (!Number.isFinite(parsedPort) || parsedPort <= 0) {
    throw new Error(`Invalid PORT value: ${process.env.PORT ?? ""}`);
  }

  cachedEnv = {
    supabaseUrl: requireVar("SUPABASE_URL"),
    supabaseServiceRoleKey: requireVar("SUPABASE_SERVICE_ROLE_KEY"),
    apiKey: requireVar("API_KEY"),
    openRouterApiKey: requireVar("OPENROUTER_API_KEY"),
    openRouterModel: process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4-6",
    inboxDir: process.env.INBOX_DIR ?? "./translations/inbox",
    outboxDir: process.env.OUTBOX_DIR ?? "./translations/outbox",
    corsOrigin: process.env.CORS_ORIGIN ?? "*",
    port: parsedPort
  };

  return cachedEnv;
}
