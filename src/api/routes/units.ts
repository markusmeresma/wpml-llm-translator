import { Router } from "express";

import { getSupabaseAdminClient } from "../../lib/supabase.js";

type UnitStatus = "todo" | "in_review" | "verified";

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
  status: UnitStatus;
  updated_at: string;
}

interface UnitPatchRequest {
  review_text?: string;
  status?: UnitStatus;
}

const router = Router();
const supabase = getSupabaseAdminClient();

function hasNonEmptyFinalText(reviewText: string | null, machineText: string | null): boolean {
  const finalText = reviewText ?? machineText ?? "";
  return finalText.trim().length > 0;
}

router.get("/:id", async (req, res) => {
  const unitId = req.params.id;
  const { data, error } = await supabase
    .from("units")
    .select(
      "id,project_id,file_id,unit_key,resname,restype,source_text,machine_text,review_text,status,updated_at"
    )
    .eq("id", unitId)
    .single<UnitRow>();

  if (error || !data) {
    res.status(404).json({ error: `Unit not found: ${unitId}` });
    return;
  }

  res.json(data);
});

router.patch("/:id", async (req, res) => {
  const unitId = req.params.id;
  const body = req.body as UnitPatchRequest;
  const hasReviewText = Object.hasOwn(body, "review_text");
  const hasStatus = Object.hasOwn(body, "status");

  if (!hasReviewText && !hasStatus) {
    res.status(400).json({ error: "Request must include review_text or status" });
    return;
  }

  if (hasReviewText && typeof body.review_text !== "string") {
    res.status(400).json({ error: "review_text must be a string" });
    return;
  }

  if (hasStatus && !["todo", "in_review", "verified"].includes(String(body.status))) {
    res.status(400).json({ error: "status must be todo, in_review, or verified" });
    return;
  }

  const { data: currentUnit, error: currentUnitError } = await supabase
    .from("units")
    .select(
      "id,project_id,file_id,unit_key,resname,restype,source_text,machine_text,review_text,status,updated_at"
    )
    .eq("id", unitId)
    .single<UnitRow>();

  if (currentUnitError || !currentUnit) {
    res.status(404).json({ error: `Unit not found: ${unitId}` });
    return;
  }

  const nextReviewText = hasReviewText ? (body.review_text ?? "") : currentUnit.review_text;
  const requestedStatus = hasStatus ? (body.status as UnitStatus) : undefined;
  let nextStatus: UnitStatus = requestedStatus ?? currentUnit.status;

  const isFirstReviewWrite =
    hasReviewText && currentUnit.review_text == null && body.review_text !== undefined;

  if (isFirstReviewWrite && requestedStatus !== "verified") {
    nextStatus = "in_review";
  }

  if (nextStatus === "verified" && !hasNonEmptyFinalText(nextReviewText, currentUnit.machine_text)) {
    res.status(400).json({
      error: "Cannot set status to verified without non-empty final_text (review_text or machine_text)"
    });
    return;
  }

  const updatePayload: Record<string, string> = {
    updated_at: new Date().toISOString()
  };

  if (hasReviewText) {
    updatePayload.review_text = body.review_text ?? "";
  }

  updatePayload.status = nextStatus;

  const { data: updatedUnit, error: updateError } = await supabase
    .from("units")
    .update(updatePayload)
    .eq("id", unitId)
    .select(
      "id,project_id,file_id,unit_key,resname,restype,source_text,machine_text,review_text,status,updated_at"
    )
    .single<UnitRow>();

  if (updateError || !updatedUnit) {
    res.status(500).json({ error: updateError?.message ?? "Failed to update unit" });
    return;
  }

  res.json(updatedUnit);
});

export default router;
