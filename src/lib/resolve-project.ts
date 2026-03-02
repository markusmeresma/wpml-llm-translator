import { type SupabaseClient } from "@supabase/supabase-js";

export interface ProjectInfo {
  id: string;
  name: string;
  source_lang: string;
  target_lang: string;
}

export async function resolveProject(
  supabase: SupabaseClient,
  name: string
): Promise<ProjectInfo> {
  const { data, error } = await supabase
    .from("projects")
    .select("id,name,source_lang,target_lang")
    .eq("name", name)
    .single<ProjectInfo>();

  if (error || !data) {
    throw new Error(`Project not found: ${name}`);
  }

  return data;
}
