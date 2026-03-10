import fs from "node:fs/promises";
import path from "node:path";

import dotenv from "dotenv";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { loadScrapeConfig } from "../lib/scrape-config.js";
import { fetchAllProducts } from "../lib/wp-client.js";
import { generateProductXliff } from "../lib/xliff-generator.js";

dotenv.config();

interface CliArgs {
  sourceLang: string;
  targetLang: string;
  dryRun: boolean;
}

const DEFAULT_FAMILY_MAP_PATH = path.resolve(process.cwd(), "scripts/family-map.json");

async function parseCliArgs(): Promise<CliArgs> {
  const argv = await yargs(hideBin(process.argv))
    .option("source-lang", {
      type: "string",
      demandOption: true,
      description: "Source language code to fetch from the WordPress REST API"
    })
    .option("target-lang", {
      type: "string",
      demandOption: true,
      description: "Target language code written into the generated XLIFF files"
    })
    .option("dry-run", {
      type: "boolean",
      default: false,
      description: "Log output paths without creating files"
    })
    .strict()
    .parse();

  return {
    sourceLang: argv["source-lang"],
    targetLang: argv["target-lang"],
    dryRun: argv["dry-run"]
  };
}

async function loadFamilyMap(filePath = DEFAULT_FAMILY_MAP_PATH): Promise<Record<string, string>> {
  let rawFile: string;

  try {
    rawFile = await fs.readFile(filePath, "utf8");
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Missing family map at ${filePath}. Run "npx tsx scripts/build-family-map.ts" first.`);
    }

    throw error;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawFile) as unknown;
  } catch (error: unknown) {
    throw new Error(`Invalid JSON in ${filePath}: ${error instanceof Error ? error.message : "unknown parse error"}`);
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error(`Expected ${filePath} to contain a JSON object of slug-to-family mappings`);
  }

  const entries = Object.entries(parsed);
  const familyMap: Record<string, string> = {};

  for (const [slug, family] of entries) {
    if (typeof family !== "string" || !family.trim()) {
      throw new Error(`Expected family-map entry "${slug}" to have a non-empty string value`);
    }

    familyMap[slug] = family;
  }

  return familyMap;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function toDisplayPath(filePath: string): string {
  return path.relative(process.cwd(), filePath) || filePath;
}

async function main(): Promise<void> {
  const args = await parseCliArgs();
  const config = await loadScrapeConfig();
  const familyMap = await loadFamilyMap();
  const inboxDir = path.resolve(process.env.INBOX_DIR ?? "./translations/inbox");
  const products = await fetchAllProducts(config.wpBaseUrl, args.sourceLang);

  console.log(`[scrape] Fetched ${products.length} product(s) for source language "${args.sourceLang}"`);
  console.log(`[scrape] Inbox directory: ${toDisplayPath(inboxDir)}`);

  let writeCount = 0;
  let skipCount = 0;
  const familiesWritten = new Map<string, number>();

  for (const product of products) {
    const family = familyMap[product.slug] ?? "uncategorized";
    const outputDir = path.join(inboxDir, family);
    const outputPath = path.join(outputDir, `product-${product.slug}.xliff`);

    if (await fileExists(outputPath)) {
      skipCount += 1;
      console.log(`[scrape] Skipping existing ${toDisplayPath(outputPath)}`);
      continue;
    }

    const xml = generateProductXliff({
      product,
      sourceLang: args.sourceLang,
      targetLang: args.targetLang
    });

    if (!args.dryRun) {
      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(outputPath, xml, "utf8");
    }

    writeCount += 1;
    familiesWritten.set(family, (familiesWritten.get(family) ?? 0) + 1);
    console.log(`[scrape] ${args.dryRun ? "Would write" : "Wrote"} ${toDisplayPath(outputPath)}`);
  }

  console.log(
    `[scrape] ${args.dryRun ? "Dry run complete" : "Complete"}: ` +
      `${writeCount} file(s) ${args.dryRun ? "would be written" : "written"} across ${familiesWritten.size} families; ` +
      `${skipCount} existing file(s) skipped`
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`[scrape] ${message}`);
  process.exitCode = 1;
});
