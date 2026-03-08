import fs from "node:fs/promises";
import path from "node:path";

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { getEnv } from "../lib/env.js";
import { getSupabaseAdminClient } from "../lib/supabase.js";
import { isAcfLayoutUnit } from "../lib/acf-layout-filter.js";
import { parseXliffFile } from "../lib/xliff-parser.js";

import { type SupabaseClient } from "@supabase/supabase-js";

interface CliArgs {
  project?: string;
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
    .option("project", {
      type: "string",
      description: "Subdirectory name to ingest (omit to ingest all subdirectories)"
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
    project: argv.project,
    sourceLang: argv["source-lang"],
    targetLang: argv["target-lang"]
  };
}

async function discoverProjectDirs(inboxDir: string): Promise<string[]> {
  const entries = await fs.readdir(inboxDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function listXliffFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".xliff"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function ingestProject(
  supabase: SupabaseClient,
  name: string,
  dir: string,
  sourceLang: string,
  targetLang: string
): Promise<void> {
  const xliffFiles = await listXliffFiles(dir);

  if (xliffFiles.length === 0) {
    console.log(`[ingest] Skipping "${name}" — no .xliff files found`);
    return;
  }

  console.log(`[ingest] Starting project "${name}"`);
  console.log(`[ingest] Source=${sourceLang} Target=${targetLang}`);
  console.log(`[ingest] Found ${xliffFiles.length} file(s) in ${dir}`);

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      name,
      source_lang: sourceLang,
      target_lang: targetLang
    })
    .select("id")
    .single<ProjectRow>();

  if (projectError || !project) {
    throw new Error(`Failed to create project "${name}": ${projectError?.message ?? "unknown error"}`);
  }

  let totalUnits = 0;
  for (const fileKey of xliffFiles) {
    const fullPath = path.join(dir, fileKey);
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

    let insertedUnitCount = 0;

    for (const unit of parsed.units) {
      if (isAcfLayoutUnit(unit.unitKey, unit.sourceText)) {
        console.log(`[ingest]   Skipping ACF layout key "${unit.unitKey}" (value: "${unit.sourceText}")`);
        continue;
      }

      if (unit.segments && unit.sourceHtmlTemplate) {
        // Compound unit: insert parent with template, then sub-units
        const { data: parentRow, error: parentError } = await supabase
          .from("units")
          .insert({
            project_id: project.id,
            file_id: fileRecord.id,
            unit_key: unit.unitKey,
            resname: unit.resname,
            restype: unit.restype,
            source_text: unit.sourceText,
            source_html_template: unit.sourceHtmlTemplate,
            machine_text: null
          })
          .select("id")
          .single<{ id: string }>();

        if (parentError || !parentRow) {
          throw new Error(
            `Failed to insert compound parent unit ${unit.unitKey}: ${parentError?.message ?? "unknown error"}`
          );
        }

        const subUnits = unit.segments.map((seg) => ({
          project_id: project.id,
          file_id: fileRecord.id,
          unit_key: `${unit.unitKey}::seg-${seg.index}`,
          resname: unit.resname ? `${unit.resname} [${seg.index}]` : null,
          restype: unit.restype,
          source_text: seg.text,
          machine_text: null,
          parent_unit_id: parentRow.id,
          segment_index: seg.index
        }));

        const { error: subError } = await supabase.from("units").insert(subUnits);

        if (subError) {
          throw new Error(
            `Failed to insert sub-units for ${unit.unitKey}: ${subError.message}`
          );
        }

        insertedUnitCount += 1 + subUnits.length;
        console.log(
          `[ingest]   Compound unit "${unit.unitKey}" → ${subUnits.length} segment(s)`
        );
      } else {
        // Regular unit
        const { error: unitError } = await supabase.from("units").insert({
          project_id: project.id,
          file_id: fileRecord.id,
          unit_key: unit.unitKey,
          resname: unit.resname,
          restype: unit.restype,
          source_text: unit.sourceText,
          machine_text: null
        });

        if (unitError) {
          throw new Error(`Failed to insert unit ${unit.unitKey}: ${unitError.message}`);
        }

        insertedUnitCount += 1;
      }
    }

    totalUnits += insertedUnitCount;
  }

  console.log(`[ingest] Complete for "${name}"`);
  console.log(`[ingest] Project ID: ${project.id}`);
  console.log(`[ingest] Files: ${xliffFiles.length}, Units: ${totalUnits}`);
}

async function main(): Promise<void> {
  const env = getEnv();
  const args = await parseCliArgs();
  const supabase = getSupabaseAdminClient();

  let projectNames: string[];

  if (args.project) {
    const projectDir = path.join(env.inboxDir, args.project);
    try {
      const stat = await fs.stat(projectDir);
      if (!stat.isDirectory()) {
        throw new Error(`"${args.project}" exists but is not a directory in ${env.inboxDir}`);
      }
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(`Subdirectory "${args.project}" not found in ${env.inboxDir}`);
      }
      throw error;
    }
    projectNames = [args.project];
  } else {
    projectNames = await discoverProjectDirs(env.inboxDir);
    if (projectNames.length === 0) {
      throw new Error(
        `No subdirectories found in ${env.inboxDir}. ` +
        `Create a subdirectory per project (e.g. ${env.inboxDir}/my-project/) and place .xliff files inside.`
      );
    }
    console.log(`[ingest] Discovered ${projectNames.length} project(s): ${projectNames.join(", ")}`);
  }

  for (const name of projectNames) {
    const dir = path.join(env.inboxDir, name);
    await ingestProject(supabase, name, dir, args.sourceLang, args.targetLang);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown error";
  console.error(`[ingest] Fatal error: ${message}`);
  process.exit(1);
});
