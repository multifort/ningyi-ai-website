#!/usr/bin/env python3
"""Resumable DAG for semantic generation, quality gates, and deterministic renders."""

from __future__ import annotations

import argparse
import hashlib
import json
import uuid
from pathlib import Path
from typing import Any


RUN_NAMESPACE = uuid.UUID("70000000-0000-4000-8000-000000000004")


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def node(node_id: str, kind: str, dependencies: list[str]) -> dict[str, Any]:
    return {"id": node_id, "kind": kind, "dependencies": dependencies, "status": "pending", "attempt": 0, "artifactHash": None, "failure": None}


def refresh_status(run: dict[str, Any]) -> None:
    states = {item["status"] for item in run["nodes"]}
    if states == {"complete"}:
        run["status"] = "complete"
    elif "failed" in states and not ({"pending", "in_progress", "stale"} & states):
        run["status"] = "failed"
    elif states & {"in_progress", "complete", "failed", "stale"}:
        run["status"] = "in_progress"
    else:
        run["status"] = "pending"


def create_run(plan: dict[str, Any], project_revision_id: str) -> dict[str, Any]:
    plan_hash = digest(canonical_bytes(plan))
    run = {"schemaVersion": "1.0", "runId": str(uuid.uuid5(RUN_NAMESPACE, f"{project_revision_id}:{plan_hash}")), "projectRevisionId": project_revision_id, "planHash": plan_hash, "status": "pending", "nodes": []}
    module_gate_ids: dict[str, str] = {}
    for item in plan["contentModules"]:
        module_id = f"content:{item['id']}"
        kind = "deterministic_compute" if item["dispatchStatus"] == "deterministic" else "model_generation"
        run["nodes"].append(node(module_id, kind, []))
        gate_id = f"quality:{item['id']}"
        run["nodes"].append(node(gate_id, "quality_gate", [module_id]))
        module_gate_ids[item["id"]] = gate_id
    for job in plan["renderJobs"]:
        render_id = f"render:{job['deliverable']}:{job['format']}"
        dependencies = [module_gate_ids[module_id] for module_id in job["contentModuleIds"]]
        run["nodes"].append(node(render_id, "deterministic_render", dependencies))
    validate_graph(run)
    return run


def validate_graph(run: dict[str, Any]) -> None:
    ids = [item["id"] for item in run["nodes"]]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate node id")
    known = set(ids)
    for item in run["nodes"]:
        missing = set(item["dependencies"]) - known
        if missing:
            raise ValueError(f"unknown dependencies for {item['id']}: {sorted(missing)}")


def node_by_id(run: dict[str, Any], node_id: str) -> dict[str, Any]:
    for item in run["nodes"]:
        if item["id"] == node_id:
            return item
    raise ValueError(f"unknown node: {node_id}")


def ready_nodes(run: dict[str, Any]) -> list[dict[str, Any]]:
    states = {item["id"]: item["status"] for item in run["nodes"]}
    return [item for item in run["nodes"] if item["status"] in {"pending", "stale"} and all(states[dependency] == "complete" for dependency in item["dependencies"])]


def start_node(run: dict[str, Any], node_id: str) -> None:
    item = node_by_id(run, node_id)
    if item not in ready_nodes(run):
        raise ValueError(f"node is not ready: {node_id}")
    item.update({"status": "in_progress", "attempt": item["attempt"] + 1, "artifactHash": None, "failure": None})
    refresh_status(run)


def complete_node(run: dict[str, Any], node_id: str, artifact: bytes) -> None:
    item = node_by_id(run, node_id)
    if item["status"] != "in_progress":
        raise ValueError(f"cannot complete {node_id} from {item['status']}")
    item.update({"status": "complete", "artifactHash": digest(artifact), "failure": None})
    refresh_status(run)


def fail_node(run: dict[str, Any], node_id: str, failure: str) -> None:
    item = node_by_id(run, node_id)
    if item["status"] != "in_progress":
        raise ValueError(f"cannot fail {node_id} from {item['status']}")
    item.update({"status": "failed", "artifactHash": None, "failure": failure})
    refresh_status(run)


def retry_node(run: dict[str, Any], node_id: str) -> None:
    item = node_by_id(run, node_id)
    if item["status"] != "failed":
        raise ValueError(f"cannot retry {node_id} from {item['status']}")
    item.update({"status": "pending", "artifactHash": None, "failure": None})
    refresh_status(run)


def invalidate_node(run: dict[str, Any], node_id: str) -> None:
    affected = {node_id}
    changed = True
    while changed:
        changed = False
        for item in run["nodes"]:
            if item["id"] not in affected and set(item["dependencies"]) & affected:
                affected.add(item["id"])
                changed = True
    for item in run["nodes"]:
        if item["id"] in affected:
            item.update({"status": "pending" if item["id"] == node_id else "stale", "artifactHash": None, "failure": None})
    refresh_status(run)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", required=True, type=Path)
    parser.add_argument("--project-revision-id", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    run = create_run(json.loads(args.plan.read_text(encoding="utf-8")), args.project_revision_id)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(run, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"runId": run["runId"], "nodes": len(run["nodes"]), "readyNodes": len(ready_nodes(run)), "output": str(args.output)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
