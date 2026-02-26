import fs from "node:fs/promises";
import path from "node:path";

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { getEnv } from "../lib/env.js";
import { translateWithOpenRouter } from "../lib/openrouter.js";
import { getSupabaseAdminClient } from "../lib/supabase.js";
import { parseXliffFile } from "../lib/xliff-parser.js";

interface CliArgs {
  projectName: string;
  sourceLang: string;
  targetLang: string;
}

interface ProjectRow {
  id: string;
}

interface FileRow {
  id: string;
}

async function parseCliArgs(): Promise<CliArgs> {
  const argv = await yargs(hideBin(process.argv))
    .option("project-name", {
      type: "string",
      demandOption: true,
      description: "Human-readable project name"
    })
    .option("source-lang", {
      type: "string",
      demandOption: true,
      description: "Source language code, e.g. en"
    })
    .option("target-lang", {
      type: "string",
      demandOption: true,
      description: "Target language code, e.g. pl"
    })
    .strict()
    .parse();

  return {
    projectName: argv["project-name"],
    sourceLang: argv["source-lang"],
    targetLang: argv["target-lang"]
  };
}

async function listXliffFiles(inboxDir: string): Promise<string[]> {
  const entries = await fs.readdir(inboxDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".xliff"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function main(): Promise<void> {
  const env = getEnv();
  const args = await parseCliArgs();
  const supabase = getSupabaseAdminClient();

  const xliffFiles = await listXliffFiles(env.inboxDir);

  if (xliffFiles.length === 0) {
    throw new Error(`No .xliff files found in ${env.inboxDir}`);
  }

  console.log(`[ingest] Starting project "${args.projectName}"`);
  console.log(`[ingest] Source=${args.sourceLang} Target=${args.targetLang}`);
  console.log(`[ingest] Found ${xliffFiles.length} file(s) in ${env.inboxDir}`);

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      name: args.projectName,
      source_lang: args.sourceLang,
      target_lang: args.targetLang
    })
    .select("id")
    .single<ProjectRow>();

  if (projectError || !project) {
    throw new Error(`Failed to create project: ${projectError?.message ?? "unknown error"}`);
  }

  let totalUnits = 0;
  let llmFailures = 0;

  for (const fileKey of xliffFiles) {
    const fullPath = path.join(env.inboxDir, fileKey);
    const xml = await fs.readFile(fullPath, "utf8");
    const parsed = parseXliffFile({ fileKey, xml });

    const { data: fileRecord, error: fileError } = await supabase
      .from("files")
      .insert({
        project_id: project.id,
        file_key: fileKey,
        original_attr: parsed.originalAttr,
        external_href: parsed.externalHref
      })
      .select("id")
      .single<FileRow>();

    if (fileError || !fileRecord) {
      throw new Error(`Failed to insert file ${fileKey}: ${fileError?.message ?? "unknown error"}`);
    }

    console.log(`[ingest] Processing ${fileKey} (${parsed.units.length} unit(s))`);

    const unitsToInsert: Array<Record<string, string | null>> = [];

    for (const unit of parsed.units) {
      let machineText: string | null = null;

      try {
        machineText = await translateWithOpenRouter({
          sourceLang: args.sourceLang,
          targetLang: args.targetLang,
          resname: unit.resname,
          restype: unit.restype,
          sourceText: unit.sourceText
        });
      } catch (error) {
        llmFailures += 1;
        const message = error instanceof Error ? error.message : "unknown error";
        console.error(`[ingest] LLM failed for ${fileKey}#${unit.unitKey}: ${message}`);
      }

      unitsToInsert.push({
        project_id: project.id,
        file_id: fileRecord.id,
        unit_key: unit.unitKey,
        resname: unit.resname,
        restype: unit.restype,
        source_text: unit.sourceText,
        machine_text: machineText
      });
    }

    if (unitsToInsert.length > 0) {
      const { error: unitsError } = await supabase.from("units").insert(unitsToInsert);

      if (unitsError) {
        throw new Error(`Failed to insert units for ${fileKey}: ${unitsError.message}`);
      }
    }

    totalUnits += parsed.units.length;
  }

  console.log(`[ingest] Complete`);
  console.log(`[ingest] Project ID: ${project.id}`);
  console.log(`[ingest] Files: ${xliffFiles.length}, Units: ${totalUnits}, LLM failures: ${llmFailures}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown error";
  console.error(`[ingest] Fatal error: ${message}`);
  process.exit(1);
});
