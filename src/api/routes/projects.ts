import { Router } from "express";

import { getSupabaseAdminClient } from "../../lib/supabase.js";

interface ProjectRow {
  id: string;
  name: string;
  source_lang: string;
  target_lang: string;
  created_at: string;
}

interface UnitCountRow {
  project_id: string;
  status: "todo" | "in_review" | "verified";
}

interface UnitRow {
  id: string;
  project_id: string;
  file_id: string;
  unit_key: string;
  resname: string | null;
  restype: string | null;
  source_text: string;
  machine_text: string | null;
  review_text: string | null;
  status: "todo" | "in_review" | "verified";
  updated_at: string;
}

const router = Router();
const supabase = getSupabaseAdminClient();

function parsePaginationValue(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

router.get("/", async (_req, res) => {
  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("id,name,source_lang,target_lang,created_at")
    .order("created_at", { ascending: false })
    .returns<ProjectRow[]>();

  if (projectsError || !projects) {
    res.status(500).json({ error: projectsError?.message ?? "Failed to load projects" });
    return;
  }

  const { data: unitRows, error: unitError } = await supabase
    .from("units")
    .select("project_id,status")
    .is("source_html_template", null)
    .is("canonical_unit_id", null)
    .returns<UnitCountRow[]>();

  if (unitError || !unitRows) {
    res.status(500).json({ error: unitError?.message ?? "Failed to load unit counts" });
    return;
  }

  const countsByProject = new Map<string, { total: number; verified: number }>();

  for (const row of unitRows) {
    const counts = countsByProject.get(row.project_id) ?? { total: 0, verified: 0 };
    counts.total += 1;

    if (row.status === "verified") {
      counts.verified += 1;
    }

    countsByProject.set(row.project_id, counts);
  }

  const enriched = projects.map((project) => {
    const counts = countsByProject.get(project.id) ?? { total: 0, verified: 0 };

    return {
      ...project,
      total_units: counts.total,
      verified_units: counts.verified
    };
  });

  res.json({ projects: enriched, total: enriched.length });
});

router.get("/:id", async (req, res) => {
  const projectId = req.params.id;

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id,name,source_lang,target_lang,created_at")
    .eq("id", projectId)
    .single<ProjectRow>();

  if (projectError) {
    res.status(404).json({ error: `Project not found: ${projectId}` });
    return;
  }

  const [totalResult, verifiedResult] = await Promise.all([
    supabase
      .from("units")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId)
      .is("source_html_template", null)
      .is("canonical_unit_id", null),
    supabase
      .from("units")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId)
      .is("source_html_template", null)
      .is("canonical_unit_id", null)
      .eq("status", "verified")
  ]);

  if (totalResult.error || verifiedResult.error) {
    res.status(500).json({
      error: totalResult.error?.message ?? verifiedResult.error?.message ?? "Failed to compute unit counts"
    });
    return;
  }

  res.json({
    ...project,
    total_units: totalResult.count ?? 0,
    verified_units: verifiedResult.count ?? 0
  });
});

router.get("/:id/units", async (req, res) => {
  const projectId = req.params.id;
  const status = req.query.status;
  const search = req.query.search;
  const limit = parsePaginationValue(
    typeof req.query.limit === "string" ? req.query.limit : undefined,
    50
  );
  const offset = parsePaginationValue(
    typeof req.query.offset === "string" ? req.query.offset : undefined,
    0
  );

  if (status && !["todo", "in_review", "verified"].includes(String(status))) {
    res.status(400).json({ error: "Invalid status filter" });
    return;
  }

  let dataQuery = supabase
    .from("units")
    .select(
      "id,project_id,file_id,unit_key,resname,restype,source_text,machine_text,review_text,status,updated_at,parent_unit_id,segment_index"
    )
    .eq("project_id", projectId)
    .is("source_html_template", null)
    .is("canonical_unit_id", null)
    .range(offset, offset + limit - 1)
    .order("updated_at", { ascending: true });

  let countQuery = supabase
    .from("units")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId)
    .is("source_html_template", null)
    .is("canonical_unit_id", null);

  if (status) {
    dataQuery = dataQuery.eq("status", String(status));
    countQuery = countQuery.eq("status", String(status));
  }

  if (search && typeof search === "string" && search.trim()) {
    const term = search.trim().replaceAll(",", " ");
    const orFilter = `source_text.ilike.%${term}%,machine_text.ilike.%${term}%,review_text.ilike.%${term}%`;
    dataQuery = dataQuery.or(orFilter);
    countQuery = countQuery.or(orFilter);
  }

  const [{ data, error }, { count, error: countError }] = await Promise.all([
    dataQuery.returns<UnitRow[]>(),
    countQuery
  ]);

  if (error || !data) {
    res.status(500).json({ error: error?.message ?? "Failed to load units" });
    return;
  }

  if (countError) {
    res.status(500).json({ error: countError.message ?? "Failed to count units" });
    return;
  }

  res.json({ units: data, total: count ?? 0, limit, offset });
});

router.get("/:id/readiness", async (req, res) => {
  const projectId = req.params.id;

  const [totalResult, verifiedResult] = await Promise.all([
    supabase
      .from("units")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId)
      .is("source_html_template", null)
      .is("canonical_unit_id", null),
    supabase
      .from("units")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId)
      .is("source_html_template", null)
      .is("canonical_unit_id", null)
      .eq("status", "verified")
  ]);

  if (totalResult.error || verifiedResult.error) {
    res.status(500).json({
      error: totalResult.error?.message ?? verifiedResult.error?.message ?? "Failed to compute readiness"
    });
    return;
  }

  const totalUnits = totalResult.count ?? 0;
  const verifiedUnits = verifiedResult.count ?? 0;
  const remainingUnits = Math.max(totalUnits - verifiedUnits, 0);

  res.json({
    ready: totalUnits > 0 && verifiedUnits === totalUnits,
    total_units: totalUnits,
    verified_units: verifiedUnits,
    remaining_units: remainingUnits
  });
});

export default router;
