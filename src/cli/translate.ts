import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { translateWithOpenRouter } from "../lib/openrouter.js";
import { getSupabaseAdminClient } from "../lib/supabase.js";
import { extractProse, isTranslatable } from "../lib/translatable.js";

interface CliArgs {
  projectId: string;
}

interface ProjectRow {
  id: string;
  source_lang: string;
  target_lang: string;
}

interface UnitRow {
  id: string;
  unit_key: string;
  resname: string | null;
  restype: string | null;
  source_text: string;
}

function countWords(input: string): number {
  const words = input.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? [];
  return words.length;
}

function buildPreview(input: string, maxLength = 80): string {
  if (input.length <= maxLength) {
    return input;
  }

  return `${input.slice(0, maxLength)}…`;
}

async function parseCliArgs(): Promise<CliArgs> {
  const argv = await yargs(hideBin(process.argv))
    .option("project-id", {
      type: "string",
      demandOption: true,
      description: "UUID of the project to translate"
    })
    .strict()
    .parse();

  return {
    projectId: argv["project-id"]
  };
}

async function main(): Promise<void> {
  const args = await parseCliArgs();
  const supabase = getSupabaseAdminClient();

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id,source_lang,target_lang")
    .eq("id", args.projectId)
    .single<ProjectRow>();

  if (projectError || !project) {
    throw new Error(`Project not found: ${args.projectId}`);
  }

  const { data: units, error: unitsError } = await supabase
    .from("units")
    .select("id,unit_key,resname,restype,source_text")
    .eq("project_id", args.projectId)
    .is("machine_text", null)
    .order("file_id", { ascending: true })
    .order("unit_key", { ascending: true })
    .returns<UnitRow[]>();

  if (unitsError || !units) {
    throw new Error(`Failed to load units: ${unitsError?.message ?? "unknown error"}`);
  }

  console.log(`[translate] Project ${args.projectId} (${project.source_lang} -> ${project.target_lang})`);
  console.log(`[translate] Units pending translation: ${units.length}`);

  let translated = 0;
  let skipped = 0;
  let failures = 0;

  for (let i = 0; i < units.length; i++) {
    const unit = units[i]!;
    const label = unit.resname ?? unit.unit_key;

    if (!isTranslatable(unit.source_text)) {
      const prose = extractProse(unit.source_text);
      const wordCount = countWords(prose);
      skipped += 1;
      console.log(
        `[translate] ${i + 1}/${units.length} "${label}" SKIP not translatable (${wordCount} word(s))`
      );
      continue;
    }

    try {
      const result = await translateWithOpenRouter({
        sourceLang: project.source_lang,
        targetLang: project.target_lang,
        resname: unit.resname,
        restype: unit.restype,
        sourceText: unit.source_text
      });

      const { error: updateError } = await supabase
        .from("units")
        .update({ machine_text: result.text })
        .eq("id", unit.id);

      if (updateError) {
        throw new Error(`Failed to update unit: ${updateError.message}`);
      }

      translated += 1;
      const tokens = result.promptTokens !== null && result.completionTokens !== null
        ? ` ${result.promptTokens}+${result.completionTokens} tok`
        : "";
      console.log(`[translate] ${i + 1}/${units.length} "${label}" (${result.durationMs}ms${tokens})`);
    } catch (error) {
      failures += 1;
      const message = error instanceof Error ? error.message : "unknown error";
      console.error(`[translate] ${i + 1}/${units.length} "${label}" FAILED: ${message}`);
      console.error(`[translate]   source: "${buildPreview(unit.source_text)}"`);
    }
  }

  console.log(`[translate] Complete`);
  console.log(
    `[translate] Units: ${units.length}, translated: ${translated}, skipped: ${skipped}, failures: ${failures}`
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown error";
  console.error(`[translate] Fatal error: ${message}`);
  process.exit(1);
});
