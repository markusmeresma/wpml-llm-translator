import fs from "node:fs/promises";
import path from "node:path";

export interface ScrapeConfig {
  wpBaseUrl: string;
  families: string[];
}

interface RawScrapeConfig {
  wpBaseUrl?: unknown;
  families?: unknown;
}

export const DEFAULT_SCRAPE_CONFIG_PATH = path.resolve(process.cwd(), ".scrape-config.json");

export async function loadScrapeConfig(configPath = DEFAULT_SCRAPE_CONFIG_PATH): Promise<ScrapeConfig> {
  let rawFile: string;

  try {
    rawFile = await fs.readFile(configPath, "utf8");
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Missing scrape config at ${configPath}`);
    }

    throw error;
  }

  let parsed: RawScrapeConfig;

  try {
    parsed = JSON.parse(rawFile) as RawScrapeConfig;
  } catch (error: unknown) {
    throw new Error(
      `Invalid JSON in ${configPath}: ${error instanceof Error ? error.message : "unknown parse error"}`
    );
  }

  if (typeof parsed.wpBaseUrl !== "string" || !parsed.wpBaseUrl.trim()) {
    throw new Error(`Expected "wpBaseUrl" to be a non-empty string in ${configPath}`);
  }

  if (!Array.isArray(parsed.families) || parsed.families.length === 0) {
    throw new Error(`Expected "families" to be a non-empty array in ${configPath}`);
  }

  const families = parsed.families
    .filter((family): family is string => typeof family === "string")
    .map((family) => family.trim())
    .filter(Boolean);

  if (families.length === 0) {
    throw new Error(`Expected "families" to contain at least one non-empty string in ${configPath}`);
  }

  return {
    wpBaseUrl: parsed.wpBaseUrl.trim(),
    families
  };
}
