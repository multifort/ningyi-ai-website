#!/usr/bin/env python3
"""Classify R/C/S/P changes and compute the smallest allowed downstream impact set."""

from __future__ import annotations

import argparse
import json
from collections import deque
from pathlib import Path
from typing import Any


ACTION_BY_KIND = {"project_model": "rebuild_project_model", "semantic": "generate", "calculation": "calculate", "quality": "check", "render": "render", "template": "render", "parameter": "calculate"}


def classify(trigger_type: str, target_kinds: set[str]) -> str:
    if trigger_type == "template_change" or target_kinds <= {"template"}:
        return "R"
    if trigger_type == "parameter_change" and target_kinds <= {"parameter", "calculation"}:
        return "C"
    if trigger_type == "project_restructure" or "project_model" in target_kinds:
        return "P"
    return "S"


def plan(graph: dict[str, Any], trigger_type: str, direct_targets: list[str], locked_targets: list[str] | None = None) -> dict[str, Any]:
    locked = set(locked_targets or [])
    nodes = {item["id"]: item for item in graph["nodes"]}
    unknown = set(direct_targets) - set(nodes)
    if unknown:
        raise ValueError(f"unknown targets: {sorted(unknown)}")
    action_class = classify(trigger_type, {nodes[target]["kind"] for target in direct_targets})
    outgoing: dict[str, list[str]] = {}
    for edge in graph["edges"]:
        if action_class in edge["actions"]:
            outgoing.setdefault(edge["from"], []).append(edge["to"])
    paths = {target: [target] for target in direct_targets}
    queue = deque(direct_targets)
    conflicts = []
    while queue:
        current = queue.popleft()
        for target in outgoing.get(current, []):
            path = paths[current] + [target]
            if target in locked:
                conflicts.append({"lockedTarget": target, "blockedPath": path, "code": "LOCKED_TARGET_CONFLICT"})
                continue
            if target not in paths:
                paths[target] = path
                queue.append(target)
    impacted = []
    for target, path in paths.items():
        kind = nodes[target]["kind"]
        action = ACTION_BY_KIND[kind]
        if action_class == "C" and kind == "semantic":
            action = "check"
        impacted.append({"id": target, "action": action, "reasonPath": path})
    impacted.sort(key=lambda item: (len(item["reasonPath"]), item["id"]))
    unaffected = sorted(set(nodes) - set(paths) - locked)
    return {"schemaVersion": "1.0", "actionClass": action_class, "directTargets": list(dict.fromkeys(direct_targets)), "impactedTargets": impacted, "conflicts": conflicts, "unaffectedTargets": unaffected, "modelTaskCount": sum(item["action"] in {"rebuild_project_model", "generate"} for item in impacted)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--graph", required=True, type=Path)
    parser.add_argument("--trigger-type", required=True)
    parser.add_argument("--target", required=True, action="append")
    parser.add_argument("--locked-target", action="append", default=[])
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    result = plan(json.loads(args.graph.read_text(encoding="utf-8")), args.trigger_type, args.target, args.locked_target)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"actionClass": result["actionClass"], "impactedTargets": len(result["impactedTargets"]), "modelTaskCount": result["modelTaskCount"], "conflicts": len(result["conflicts"]), "output": str(args.output)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
