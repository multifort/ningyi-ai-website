const ACTION_BY_KIND = Object.freeze({
  project_model: "rebuild_project_model",
  semantic: "generate",
  calculation: "calculate",
  quality: "check",
  render: "render",
  template: "render",
  parameter: "calculate",
});
const CHANGE_CLASSES = new Set(["R", "C", "S", "P"]);

function validateGraph(graph) {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    throw new TypeError("INVALID_CHANGE_GRAPH");
  }
  const nodes = new Map();
  for (const node of graph.nodes) {
    if (!node || typeof node.id !== "string" || !node.id.trim() || !ACTION_BY_KIND[node.kind] || nodes.has(node.id)) {
      throw new TypeError("INVALID_CHANGE_GRAPH_NODE");
    }
    nodes.set(node.id, node);
  }
  const outgoing = new Map();
  for (const edge of graph.edges) {
    if (!edge || !nodes.has(edge.from) || !nodes.has(edge.to) || !Array.isArray(edge.actions)
      || edge.actions.some((action) => !CHANGE_CLASSES.has(action))) {
      throw new TypeError("INVALID_CHANGE_GRAPH_EDGE");
    }
    for (const action of edge.actions) {
      const targets = outgoing.get(`${action}:${edge.from}`) || new Set();
      targets.add(edge.to);
      outgoing.set(`${action}:${edge.from}`, targets);
    }
  }
  return { nodes, outgoing };
}

function classify(triggerType, targetKinds) {
  if (triggerType === "template_change" || targetKinds.every((kind) => kind === "template")) return "R";
  if (triggerType === "parameter_change" && targetKinds.every((kind) => kind === "parameter" || kind === "calculation")) return "C";
  if (triggerType === "project_restructure" || targetKinds.includes("project_model")) return "P";
  return "S";
}

/** Classifies an R/C/S/P change and returns its deterministic downstream plan. */
export function planChangeImpact(graph, triggerType, directTargetIds, lockedTargetIds = []) {
  if (!Array.isArray(directTargetIds) || directTargetIds.length === 0
    || directTargetIds.some((id) => typeof id !== "string" || !id.trim())) {
    throw new TypeError("CHANGE_REQUIRES_DIRECT_TARGETS");
  }
  if (!Array.isArray(lockedTargetIds) || lockedTargetIds.some((id) => typeof id !== "string" || !id.trim())) {
    throw new TypeError("INVALID_LOCKED_TARGETS");
  }

  const { nodes, outgoing } = validateGraph(graph);
  const directTargets = [...new Set(directTargetIds)];
  const unknown = directTargets.filter((id) => !nodes.has(id));
  if (unknown.length) throw new TypeError(`UNKNOWN_CHANGE_TARGET:${unknown.sort().join(",")}`);

  const locked = new Set(lockedTargetIds);
  const unknownLocks = [...locked].filter((id) => !nodes.has(id));
  if (unknownLocks.length) throw new TypeError(`UNKNOWN_LOCKED_TARGET:${unknownLocks.sort().join(",")}`);
  const actionClass = classify(triggerType, directTargets.map((id) => nodes.get(id).kind));
  const paths = new Map();
  const conflicts = [];
  const queue = [];

  for (const target of directTargets) {
    if (locked.has(target)) conflicts.push({ lockedTarget: target, blockedPath: [target], code: "LOCKED_TARGET_CONFLICT" });
    else {
      paths.set(target, [target]);
      queue.push(target);
    }
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    const targets = [...(outgoing.get(`${actionClass}:${current}`) || [])].sort();
    for (const target of targets) {
      const path = [...paths.get(current), target];
      if (locked.has(target)) {
        conflicts.push({ lockedTarget: target, blockedPath: path, code: "LOCKED_TARGET_CONFLICT" });
        continue;
      }
      if (!paths.has(target)) {
        paths.set(target, path);
        queue.push(target);
      }
    }
  }

  const impactedTargets = [...paths].map(([id, reasonPath]) => {
    const kind = nodes.get(id).kind;
    const action = actionClass === "C" && kind === "semantic" ? "check" : ACTION_BY_KIND[kind];
    return { id, action, reasonPath };
  }).sort((left, right) => left.reasonPath.length - right.reasonPath.length || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  const conflictKeys = new Set();
  const uniqueConflicts = conflicts.filter((conflict) => {
    const key = `${conflict.lockedTarget}:${conflict.blockedPath.join("/")}`;
    if (conflictKeys.has(key)) return false;
    conflictKeys.add(key);
    return true;
  }).sort((left, right) => left.blockedPath.length - right.blockedPath.length
    || (left.blockedPath.join("/") < right.blockedPath.join("/") ? -1 : left.blockedPath.join("/") > right.blockedPath.join("/") ? 1 : 0));

  return {
    schemaVersion: "1.0",
    actionClass,
    directTargets,
    impactedTargets,
    conflicts: uniqueConflicts,
    unaffectedTargets: [...nodes.keys()].filter((id) => !paths.has(id) && !locked.has(id)).sort(),
    modelTaskCount: impactedTargets.filter(({ action }) => action === "rebuild_project_model" || action === "generate").length,
  };
}
