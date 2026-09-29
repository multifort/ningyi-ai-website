import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import test from "node:test";
import { evaluateChangeImpactQuality } from "../lib/product/change-impact-quality.mjs";
import { planChangeImpact } from "../lib/product/change-impact.mjs";

const fixture = JSON.parse(await fs.readFile(new URL("../docs/product/v1-design/change-sets/BM-15-change-set.json", import.meta.url), "utf8"));
const stableTargets = Array.from({ length: fixture.stableTargetCount }, (_value, index) => `STABLE-${String(index + 1).padStart(3, "0")}`);
const allTargets = [...fixture.graph.nodes.map(({ id }) => id), ...stableTargets];

test("BM-15 真实修改集覆盖 R/C/S/P、锁冲突并保持无关变化率低于 2%", () => {
  for (const change of fixture.cases) {
    const plan = planChangeImpact(fixture.graph, change.triggerType, change.directTargets, change.lockedTargets);
    assert.equal(plan.actionClass, change.expectedActionClass, change.id);
    assert.equal(plan.modelTaskCount, change.expectedModelTaskCount, change.id);
    assert.deepEqual(plan.impactedTargets.map(({ id }) => id).sort(), [...change.expectedImpactedTargets].sort(), change.id);
    assert.deepEqual(plan.conflicts.map(({ lockedTarget }) => lockedTarget).sort(), [...change.expectedConflicts].sort(), change.id);
    const beforeManifest = manifestFor(allTargets, "baseline");
    const afterManifest = { ...beforeManifest };
    for (const target of change.expectedImpactedTargets) afterManifest[target] = digest(`${change.id}:${target}`);
    const report = evaluateChangeImpactQuality({
      plan,
      expectedImpactedTargets: change.expectedImpactedTargets,
      lockedTargets: change.lockedTargets,
      beforeManifest,
      afterManifest,
      thresholds: fixture.thresholds,
    });
    assert.equal(report.passed, true, `${change.id}: ${JSON.stringify(report.checks)}`);
    assert.equal(report.metrics.impactRecall, 1, change.id);
    assert.equal(report.metrics.plannedUnrelatedChangeRate, 0, change.id);
    assert.equal(report.metrics.observedUnrelatedChangeRate, 0, change.id);
    assert.deepEqual(report.lockedChangedTargets, [], change.id);
    assert.notEqual(report.beforeHash, report.afterHash, change.id);
  }
});

test("无关对象变化达到 2% 时质量门阻断发布", () => {
  const change = fixture.cases.find(({ id }) => id === "S-MINIO");
  const plan = planChangeImpact(fixture.graph, change.triggerType, change.directTargets, change.lockedTargets);
  const beforeManifest = manifestFor(allTargets, "baseline");
  const afterManifest = { ...beforeManifest };
  for (const target of change.expectedImpactedTargets) afterManifest[target] = digest(`${change.id}:${target}`);
  afterManifest[stableTargets[0]] = digest("unexpected:1");
  afterManifest[stableTargets[1]] = digest("unexpected:2");
  const report = evaluateChangeImpactQuality({
    plan,
    expectedImpactedTargets: change.expectedImpactedTargets,
    lockedTargets: change.lockedTargets,
    beforeManifest,
    afterManifest,
    thresholds: fixture.thresholds,
  });
  assert.equal(report.passed, false);
  assert.ok(report.metrics.observedUnrelatedChangeRate >= fixture.thresholds.maximumUnrelatedChangeRate);
  assert.deepEqual(report.observedUnrelatedTargets, stableTargets.slice(0, 2));
  assert.equal(report.checks.find(({ code }) => code === "OBSERVED_UNRELATED_CHANGE_RATE").passed, false);
  assert.equal(report.checks.find(({ code }) => code === "ALL_CHANGES_PLANNED").passed, false);
});

test("锁定对象出现任何变化时质量门阻断发布", () => {
  const change = fixture.cases.find(({ id }) => id === "S-MINIO-LOCKED");
  const plan = planChangeImpact(fixture.graph, change.triggerType, change.directTargets, change.lockedTargets);
  const beforeManifest = manifestFor(allTargets, "baseline");
  const afterManifest = { ...beforeManifest, "REQ-STORAGE": digest("expected:storage"), "FEATURE-MINIO": digest("unexpected:locked") };
  const report = evaluateChangeImpactQuality({
    plan,
    expectedImpactedTargets: change.expectedImpactedTargets,
    lockedTargets: change.lockedTargets,
    beforeManifest,
    afterManifest,
    thresholds: fixture.thresholds,
  });
  assert.equal(report.passed, false);
  assert.deepEqual(report.lockedChangedTargets, ["FEATURE-MINIO"]);
  assert.equal(report.checks.find(({ code }) => code === "LOCKED_TARGETS_STABLE").passed, false);
});

function manifestFor(targets, version) { return Object.fromEntries(targets.map((target) => [target, digest(`${version}:${target}`)])); }
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
