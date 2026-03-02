import fs from "node:fs/promises";
import path from "node:path";

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { getEnv } from "../lib/env.js";
import { resolveProject } from "../lib/resolve-project.js";
import { getSupabaseAdminClient } from "../lib/supabase.js";
import { rebuildXliffTargets } from "../lib/xliff-writer.js";

interface CliArgs {
  project: string;
}

interface FileRow {
  id: string;
  file_key: string;
}

type UnitStatus = "todo" | "in_review" | "verified";

interface UnitRow {
  id: string;
  file_id: string;
  unit_key: string;
  machine_text: string | null;
  review_text: string | null;
  status: UnitStatus;
}

function getFinalText(unit: UnitRow): string {
  return unit.review_text ?? unit.machine_text ?? "";
}

async function parseCliArgs(): Promise<CliArgs> {
  const argv = await yargs(hideBin(process.argv))
    .option("project", {
      type: "string",
      demandOption: true,
      description: "Project name (subdirectory name)"
    })
    .strict()
    .parse();

  return { project: argv.project };
}

async function main(): Promise<void> {
  const env = getEnv();
  const args = await parseCliArgs();
  const supabase = getSupabaseAdminClient();

  const project = await resolveProject(supabase, args.project);

  const [filesResult, unitsResult] = await Promise.all([
    supabase
      .from("files")
      .select("id,file_key")
      .eq("project_id", project.id)
      .order("file_key", { ascending: true })
      .returns<FileRow[]>(),
    supabase
      .from("units")
      .select("id,file_id,unit_key,machine_text,review_text,status")
      .eq("project_id", project.id)
      .returns<UnitRow[]>()
  ]);

  if (filesResult.error || !filesResult.data) {
    throw new Error(`Failed to load files: ${filesResult.error?.message ?? "unknown error"}`);
  }

  if (unitsResult.error || !unitsResult.data) {
    throw new Error(`Failed to load units: ${unitsResult.error?.message ?? "unknown error"}`);
  }

  const files = filesResult.data;
  const units = unitsResult.data;

  if (files.length === 0) {
    throw new Error(`No files found for project "${project.name}"`);
  }

  const notVerifiedUnits = units.filter((unit) => unit.status !== "verified");

  if (notVerifiedUnits.length > 0) {
    throw new Error(
      `Project is not ready: ${notVerifiedUnits.length} of ${units.length} unit(s) are not verified`
    );
  }

  const projectOutboxDir = path.join(env.outboxDir, project.name);
  await fs.mkdir(projectOutboxDir, { recursive: true });

  for (const file of files) {
    const fileUnits = units.filter((unit) => unit.file_id === file.id);
    const translationsByUnitKey = new Map<string, string>();

    for (const unit of fileUnits) {
      translationsByUnitKey.set(unit.unit_key, getFinalText(unit));
    }

    const sourcePath = path.join(env.inboxDir, project.name, file.file_key);
    const outputPath = path.join(projectOutboxDir, file.file_key);
    const sourceXml = await fs.readFile(sourcePath, "utf8");
    const rebuilt = rebuildXliffTargets({
      fileKey: file.file_key,
      xml: sourceXml,
      translationsByUnitKey
    });

    if (rebuilt.missingUnitKeys.length > 0) {
      throw new Error(
        `XLIFF mismatch for ${file.file_key}. Missing unit ids: ${rebuilt.missingUnitKeys.join(", ")}`
      );
    }

    await fs.writeFile(outputPath, rebuilt.xml, "utf8");
    console.log(`[rebuild] ${outputPath} (${rebuilt.updatedCount} unit(s) updated)`);
  }

  console.log(`[rebuild] Complete for project "${project.name}"`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown error";
  console.error(`[rebuild] Fatal error: ${message}`);
  process.exit(1);
});
