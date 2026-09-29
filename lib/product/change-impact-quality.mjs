import { createHash } from "node:crypto";

const DEFAULT_THRESHOLDS = Object.freeze({ minimumImpactRecall: 0.95, maximumUnrelatedChangeRate: 0.02 });

/** Measures an R/C/S/P plan and its observed before/after manifests without reading benchmark answers in production paths. */
export function evaluateChangeImpactQuality(input) {
  const plan = input?.plan;
  const expectedImpactedTargets = uniqueStrings(input?.expectedImpactedTargets, "INVALID_EXPECTED_IMPACT_TARGETS");
  const lockedTargets = uniqueStrings(input?.lockedTargets || [], "INVALID_LOCKED_TARGETS");
  const before = validateManifest(input?.beforeManifest, "INVALID_BEFORE_MANIFEST");
  const after = validateManifest(input?.afterManifest, "INVALID_AFTER_MANIFEST");
  if (!plan || !Array.isArray(plan.impactedTargets) || !Array.isArray(plan.conflicts)) throw new TypeError("INVALID_CHANGE_IMPACT_PLAN");
  const plannedTargets = uniqueStrings(plan.impactedTargets.map((target) => target?.id), "INVALID_CHANGE_IMPACT_PLAN");
  const thresholds = {
    minimumImpactRecall: finiteRate(input?.thresholds?.minimumImpactRecall, DEFAULT_THRESHOLDS.minimumImpactRecall),
    maximumUnrelatedChangeRate: finiteRate(input?.thresholds?.maximumUnrelatedChangeRate, DEFAULT_THRESHOLDS.maximumUnrelatedChangeRate),
  };
  if (thresholds.minimumImpactRecall <= 0 || thresholds.maximumUnrelatedChangeRate <= 0) throw new TypeError("INVALID_CHANGE_IMPACT_THRESHOLDS");

  const allTargets = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const expected = new Set(expectedImpactedTargets);
  const planned = new Set(plannedTargets);
  const locked = new Set(lockedTargets);
  const changedTargets = allTargets.filter((target) => before[target] !== after[target]);
  const unrelatedTargets = allTargets.filter((target) => !expected.has(target));
  const plannedUnrelatedTargets = plannedTargets.filter((target) => !expected.has(target));
  const observedUnrelatedTargets = changedTargets.filter((target) => !expected.has(target));
  const lockedChangedTargets = changedTargets.filter((target) => locked.has(target));
  const unplannedChangedTargets = changedTargets.filter((target) => !planned.has(target));
  const missingExpectedTargets = expectedImpactedTargets.filter((target) => !planned.has(target));
  const impactRecall = ratio(expectedImpactedTargets.length - missingExpectedTargets.length, expectedImpactedTargets.length);
  const plannedUnrelatedChangeRate = ratio(plannedUnrelatedTargets.length, unrelatedTargets.length);
  const observedUnrelatedChangeRate = ratio(observedUnrelatedTargets.length, unrelatedTargets.length);
  const checks = [
    { code: "IMPACT_RECALL", passed: impactRecall >= thresholds.minimumImpactRecall, actual: impactRecall, expected: `>=${thresholds.minimumImpactRecall}` },
    { code: "PLANNED_UNRELATED_CHANGE_RATE", passed: plannedUnrelatedChangeRate < thresholds.maximumUnrelatedChangeRate, actual: plannedUnrelatedChangeRate, expected: `<${thresholds.maximumUnrelatedChangeRate}` },
    { code: "OBSERVED_UNRELATED_CHANGE_RATE", passed: observedUnrelatedChangeRate < thresholds.maximumUnrelatedChangeRate, actual: observedUnrelatedChangeRate, expected: `<${thresholds.maximumUnrelatedChangeRate}` },
    { code: "LOCKED_TARGETS_STABLE", passed: lockedChangedTargets.length === 0, actual: lockedChangedTargets },
    { code: "ALL_CHANGES_PLANNED", passed: unplannedChangedTargets.length === 0, actual: unplannedChangedTargets },
  ];
  return {
    schemaVersion: "1.0",
    passed: checks.every((check) => check.passed),
    actionClass: plan.actionClass,
    beforeHash: manifestHash(before),
    afterHash: manifestHash(after),
    changedTargets,
    plannedTargets,
    expectedImpactedTargets,
    missingExpectedTargets,
    plannedUnrelatedTargets,
    observedUnrelatedTargets,
    lockedChangedTargets,
    unplannedChangedTargets,
    metrics: { impactRecall, plannedUnrelatedChangeRate, observedUnrelatedChangeRate, unrelatedTargetCount: unrelatedTargets.length },
    thresholds,
    checks,
  };
}

function validateManifest(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.entries(value).some(([key, hash]) => !key || typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash))) {
    throw new TypeError(code);
  }
  return value;
}

function uniqueStrings(value, code) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim()) || new Set(value).size !== value.length) throw new TypeError(code);
  return [...value];
}

function finiteRate(value, fallback) {
  if (value == null) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value > 1) throw new TypeError("INVALID_CHANGE_IMPACT_THRESHOLDS");
  return value;
}

function ratio(numerator, denominator) { return denominator === 0 ? 0 : numerator / denominator; }
function manifestHash(manifest) { return createHash("sha256").update(JSON.stringify(Object.entries(manifest).sort(([left], [right]) => left.localeCompare(right)))).digest("hex"); }
