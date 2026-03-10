import fs from "node:fs/promises";
import path from "node:path";

import { buildFamilyMap } from "../src/lib/family-mapping.js";
import { loadScrapeConfig } from "../src/lib/scrape-config.js";
import { fetchAllProducts } from "../src/lib/wp-client.js";

const OUTPUT_PATH = path.resolve(process.cwd(), "scripts/family-map.json");

async function main(): Promise<void> {
  const config = await loadScrapeConfig();
  const products = await fetchAllProducts(config.wpBaseUrl, "en");
  const result = buildFamilyMap(products, config.families);

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(result.map, null, 2)}\n`, "utf8");

  console.log(`[family-map] Fetched ${products.length} product(s) from ${config.wpBaseUrl}`);
  console.log(`[family-map] Wrote ${Object.keys(result.map).length} slug mapping(s) to ${OUTPUT_PATH}`);

  if (result.unmatched.length === 0) {
    console.log("[family-map] All products matched a configured family");
    return;
  }

  console.log(`[family-map] ${result.unmatched.length} unmatched product(s):`);
  for (const product of result.unmatched) {
    console.log(`  - ${product.slug}: ${product.title.rendered}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`[family-map] ${message}`);
  process.exitCode = 1;
});
