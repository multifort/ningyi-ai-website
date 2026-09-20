#!/usr/bin/env python3
"""Idempotent deletion chain with immediate revocation and backup anti-resurrection."""

from __future__ import annotations

import hashlib
import uuid
from typing import Any


NAMESPACE = uuid.UUID("70000000-0000-4000-8000-000000000010")
STEPS = ["revoke_access", "tombstone_primary", "purge_objects", "purge_derived", "anonymize_logs", "register_backup_tombstone", "verify_absence"]


def create_store() -> dict[str, Any]:
    return {"users": {}, "solutions": {}, "objects": {}, "derived": {}, "logs": [], "tombstones": set(), "backupTombstones": set()}


def add_user(store: dict[str, Any], user_id: str) -> None:
    store["users"][user_id] = {"status": "active"}


def add_solution(store: dict[str, Any], user_id: str, solution_id: str, object_keys: list[str]) -> None:
    if store["users"].get(user_id, {}).get("status") != "active":
        raise ValueError("active user required")
    store["solutions"][solution_id] = {"ownerUserId": user_id, "status": "active", "accessRevoked": False}
    for key in object_keys:
        store["objects"][key] = {"solutionId": solution_id, "ownerUserId": user_id, "status": "active"}
    store["derived"][solution_id] = {"status": "active"}
    store["logs"].append({"userId": user_id, "solutionId": solution_id, "summary": "processing metadata", "anonymized": False})


def request_deletion(store: dict[str, Any], scope: str, owner_user_id: str, now: int, solution_id: str | None = None) -> dict[str, Any]:
    if scope not in {"solution", "account"}:
        raise ValueError("unknown deletion scope")
    if owner_user_id not in store["users"]:
        raise ValueError("unknown owner")
    if scope == "solution":
        solution = store["solutions"].get(solution_id or "")
        if not solution or solution["ownerUserId"] != owner_user_id:
            raise ValueError("solution ownership required")
        targets = [solution_id]
    else:
        targets = sorted(item_id for item_id, item in store["solutions"].items() if item["ownerUserId"] == owner_user_id)
        store["users"][owner_user_id]["status"] = "deletion_pending"
    canonical = f"{scope}:{owner_user_id}:{','.join(targets)}:{now}"
    run = {"schemaVersion": "1.0", "id": str(uuid.uuid5(NAMESPACE, canonical)), "scope": scope, "ownerUserId": owner_user_id, "targetSolutionIds": targets, "status": "pending", "steps": [{"id": step, "status": "pending", "attemptCount": 0} for step in STEPS], "failure": None, "requestedAt": now, "completedAt": None}
    # Access revocation is synchronous with accepting the deletion request.
    execute_step(store, run, "revoke_access", now)
    return run


def next_step(run: dict[str, Any]) -> dict[str, Any] | None:
    return next((step for step in run["steps"] if step["status"] in {"pending", "retry_wait"}), None)


def execute_next(store: dict[str, Any], run: dict[str, Any], now: int, simulate_error: str | None = None) -> None:
    step = next_step(run)
    if not step:
        return
    execute_step(store, run, step["id"], now, simulate_error)


def execute_step(store: dict[str, Any], run: dict[str, Any], step_id: str, now: int, simulate_error: str | None = None) -> None:
    step = next(item for item in run["steps"] if item["id"] == step_id)
    if step["status"] == "complete":
        return
    if any(item["status"] != "complete" for item in run["steps"][:run["steps"].index(step)]):
        raise ValueError("deletion steps must execute in order")
    step.update({"status": "running", "attemptCount": step["attemptCount"] + 1})
    run.update({"status": "running", "failure": None})
    if simulate_error:
        step["status"] = "retry_wait" if step["attemptCount"] < 4 else "failed"
        run.update({"status": step["status"], "failure": simulate_error})
        return
    targets = set(run["targetSolutionIds"])
    if step_id == "revoke_access":
        for solution_id in targets:
            store["solutions"][solution_id].update({"status": "deletion_pending", "accessRevoked": True})
    elif step_id == "tombstone_primary":
        for solution_id in targets:
            store["tombstones"].add(solution_id)
            store["solutions"][solution_id]["status"] = "deleted"
    elif step_id == "purge_objects":
        for key in [key for key, value in store["objects"].items() if value["solutionId"] in targets]:
            del store["objects"][key]
    elif step_id == "purge_derived":
        for solution_id in targets:
            store["derived"].pop(solution_id, None)
    elif step_id == "anonymize_logs":
        for log in store["logs"]:
            if log["solutionId"] in targets:
                log.update({"userId": None, "solutionId": None, "summary": hashlib.sha256(log["summary"].encode("utf-8")).hexdigest(), "anonymized": True})
    elif step_id == "register_backup_tombstone":
        store["backupTombstones"].update(targets)
    elif step_id == "verify_absence":
        assert not any(value["solutionId"] in targets for value in store["objects"].values())
        assert not (targets & set(store["derived"]))
        assert targets <= store["tombstones"] and targets <= store["backupTombstones"]
        if run["scope"] == "account":
            store["users"][run["ownerUserId"]]["status"] = "deleted"
    step["status"] = "complete"
    if all(item["status"] == "complete" for item in run["steps"]):
        run.update({"status": "complete", "failure": None, "completedAt": now})


def restore_backup(store: dict[str, Any], backup: dict[str, Any]) -> list[str]:
    restored = []
    deleted = store["tombstones"] | store["backupTombstones"]
    for solution_id, item in backup.get("solutions", {}).items():
        if solution_id in deleted:
            continue
        store["solutions"][solution_id] = item.copy()
        restored.append(solution_id)
    for key, item in backup.get("objects", {}).items():
        if item["solutionId"] not in deleted:
            store["objects"][key] = item.copy()
    return restored


def orphan_candidates(store: dict[str, Any], inventory: list[dict[str, Any]], now: int, grace_seconds: int = 86400) -> list[str]:
    referenced = set(store["objects"])
    return sorted(item["objectKey"] for item in inventory if item["objectKey"].startswith("private/") and item["objectKey"] not in referenced and item["createdAt"] <= now - grace_seconds)
