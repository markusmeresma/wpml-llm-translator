import fs from "node:fs/promises";
import path from "node:path";

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { getEnv } from "../lib/env.js";
import { reassembleHtml } from "../lib/html-splitter.js";
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
  source_html_template: string | null;
  parent_unit_id: string | null;
  segment_index: number | null;
  canonical_unit_id: string | null;
}

function getFinalText(unit: UnitRow, canonicalMap: Map<string, UnitRow>): string {
  if (unit.canonical_unit_id) {
    const canonical = canonicalMap.get(unit.canonical_unit_id);
    if (canonical) {
      return canonical.review_text ?? canonical.machine_text ?? "";
    }
  }
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
      .select("id,file_id,unit_key,machine_text,review_text,status,source_html_template,parent_unit_id,segment_index,canonical_unit_id")
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

  // Build lookup map for canonical units (non-aliases)
  const canonicalMap = new Map<string, UnitRow>();
  for (const unit of units) {
    if (!unit.canonical_unit_id) {
      canonicalMap.set(unit.id, unit);
    }
  }

  // Compound parents don't need to be verified themselves — their sub-units do
  // Aliases don't need to be verified — they read through to their canonical
  const verifiableUnits = units.filter((unit) => !unit.source_html_template && !unit.canonical_unit_id);
  const notVerifiedUnits = verifiableUnits.filter((unit) => unit.status !== "verified");

  if (notVerifiedUnits.length > 0) {
    throw new Error(
      `Project is not ready: ${notVerifiedUnits.length} of ${verifiableUnits.length} unit(s) are not verified`
    );
  }

  const projectOutboxDir = path.join(env.outboxDir, project.name);
  await fs.mkdir(projectOutboxDir, { recursive: true });

  for (const file of files) {
    const fileUnits = units.filter((unit) => unit.file_id === file.id);
    const translationsByUnitKey = new Map<string, string>();

    // Identify compound parents and their sub-units
    const compoundParents = fileUnits.filter((u) => u.source_html_template);
    const subUnitsByParent = new Map<string, UnitRow[]>();

    for (const unit of fileUnits) {
      if (unit.parent_unit_id) {
        const siblings = subUnitsByParent.get(unit.parent_unit_id) ?? [];
        siblings.push(unit);
        subUnitsByParent.set(unit.parent_unit_id, siblings);
      }
    }

    // Reassemble compound units
    for (const parent of compoundParents) {
      const subUnits = subUnitsByParent.get(parent.id) ?? [];
      subUnits.sort((a, b) => (a.segment_index ?? 0) - (b.segment_index ?? 0));

      const segments = new Map<number, string>();
      for (const sub of subUnits) {
        if (sub.segment_index !== null) {
          segments.set(sub.segment_index, getFinalText(sub, canonicalMap));
        }
      }

      const reassembled = reassembleHtml(parent.source_html_template!, segments);
      translationsByUnitKey.set(parent.unit_key, reassembled);
    }

    // Regular units (not compound parents, not sub-units)
    for (const unit of fileUnits) {
      if (!unit.source_html_template && !unit.parent_unit_id) {
        translationsByUnitKey.set(unit.unit_key, getFinalText(unit, canonicalMap));
      }
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
