import assert from "node:assert/strict";
import test from "node:test";
import { planChangeImpact } from "../lib/product/change-impact.mjs";

const graph = {
  nodes: [
    { id: "template", kind: "template" },
    { id: "price", kind: "parameter" },
    { id: "calc", kind: "calculation" },
    { id: "requirements", kind: "semantic" },
    { id: "solution", kind: "semantic" },
    { id: "quality", kind: "quality" },
    { id: "docx", kind: "render" },
    { id: "pptx", kind: "render" },
    { id: "unrelated", kind: "semantic" },
    { id: "project", kind: "project_model" },
  ],
  edges: [
    { from: "template", to: "docx", actions: ["R"] },
    { from: "template", to: "pptx", actions: ["R"] },
    { from: "price", to: "calc", actions: ["C"] },
    { from: "calc", to: "quality", actions: ["C"] },
    { from: "quality", to: "docx", actions: ["C", "S"] },
    { from: "requirements", to: "solution", actions: ["S"] },
    { from: "solution", to: "requirements", actions: ["S"] },
    { from: "solution", to: "quality", actions: ["S"] },
    { from: "quality", to: "pptx", actions: ["S"] },
    { from: "project", to: "requirements", actions: ["P"] },
  ],
};

test("R changes only schedule rendering and never count model tasks", () => {
  const plan = planChangeImpact(graph, "template_change", ["template"]);
  assert.equal(plan.actionClass, "R");
  assert.deepEqual(plan.impactedTargets.map(({ id, action }) => [id, action]), [["template", "render"], ["docx", "render"], ["pptx", "render"]]);
  assert.equal(plan.modelTaskCount, 0);
});

test("C changes calculate and check downstream semantics without generating model content", () => {
  const plan = planChangeImpact(graph, "parameter_change", ["price"]);
  assert.equal(plan.actionClass, "C");
  assert.deepEqual(plan.impactedTargets.map(({ id, action }) => [id, action]), [["price", "calculate"], ["calc", "calculate"], ["quality", "check"], ["docx", "render"]]);
  assert.equal(plan.modelTaskCount, 0);
  assert.deepEqual(plan.unaffectedTargets, ["pptx", "project", "requirements", "solution", "template", "unrelated"]);
});

test("S changes retain a reason path and stop before locked descendants", () => {
  const plan = planChangeImpact(graph, "requirement_change", ["requirements"], ["solution"]);
  assert.equal(plan.actionClass, "S");
  assert.deepEqual(plan.impactedTargets, [{ id: "requirements", action: "generate", reasonPath: ["requirements"] }]);
  assert.deepEqual(plan.conflicts, [{ lockedTarget: "solution", blockedPath: ["requirements", "solution"], code: "LOCKED_TARGET_CONFLICT" }]);
  assert.equal(plan.modelTaskCount, 1);
});

test("cyclic dependency edges do not repeat work or recurse indefinitely", () => {
  const plan = planChangeImpact(graph, "requirement_change", ["requirements"]);
  assert.deepEqual(plan.impactedTargets.map(({ id }) => id), ["requirements", "solution", "quality", "docx", "pptx"]);
  assert.deepEqual(plan.impactedTargets.find(({ id }) => id === "solution").reasonPath, ["requirements", "solution"]);
});

test("a directly targeted locked object is blocked rather than bypassed", () => {
  const plan = planChangeImpact(graph, "parameter_change", ["price"], ["price"]);
  assert.equal(plan.impactedTargets.length, 0);
  assert.deepEqual(plan.conflicts[0].blockedPath, ["price"]);
});

test("P changes rebuild the project model and count downstream model work", () => {
  const plan = planChangeImpact(graph, "project_restructure", ["project"]);
  assert.equal(plan.actionClass, "P");
  assert.deepEqual(plan.impactedTargets.map(({ id, action }) => [id, action]), [["project", "rebuild_project_model"], ["requirements", "generate"]]);
  assert.equal(plan.modelTaskCount, 2);
});

test("invalid graphs and empty or unknown target sets fail closed", () => {
  assert.throws(() => planChangeImpact(graph, "change", []), /CHANGE_REQUIRES_DIRECT_TARGETS/);
  assert.throws(() => planChangeImpact(graph, "change", ["missing"]), /UNKNOWN_CHANGE_TARGET/);
  assert.throws(() => planChangeImpact(graph, "change", ["requirements"], ["missing"]), /UNKNOWN_LOCKED_TARGET/);
  assert.throws(() => planChangeImpact({ ...graph, edges: [{ from: "requirements", to: "missing", actions: ["S"] }] }, "change", ["requirements"]), /INVALID_CHANGE_GRAPH_EDGE/);
});
