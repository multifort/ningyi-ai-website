#!/usr/bin/env python3
"""In-memory reference runtime for idempotent leased tasks and automatic recovery."""

from __future__ import annotations

import hashlib
import json
import uuid
from typing import Any


NAMESPACE = uuid.UUID("70000000-0000-4000-8000-000000000006")
TRANSIENT_ERRORS = {"MODEL_TIMEOUT", "MODEL_RATE_LIMIT", "PROVIDER_UNAVAILABLE", "RENDER_TIMEOUT", "STORAGE_TEMPORARY"}
REPAIRABLE_ERRORS = {"QUALITY_GATE_FAILED", "SCHEMA_OUTPUT_INVALID"}
BUDGET_ERRORS = {"INTERNAL_BUDGET_DEFERRED"}
TERMINAL_ERRORS = {"UNSUPPORTED_FILE", "MALWARE_DETECTED", "AUTHORIZATION_DENIED", "INPUT_CONTRACT_INVALID"}


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def create_runtime() -> dict[str, Any]:
    return {"schemaVersion": "1.0", "tasks": [], "attempts": []}


def enqueue(runtime: dict[str, Any], project_id: str, version_id: str, task_type: str, scope: str, input_hash: str, dependency_ids: list[str] | None = None, max_attempts: int = 4, now: int = 0) -> dict[str, Any]:
    key = digest(f"{project_id}:{version_id}:{task_type}:{scope}:{input_hash}".encode("utf-8"))
    existing = next((task for task in runtime["tasks"] if task["idempotencyKey"] == key), None)
    if existing:
        return existing
    dependencies = list(dict.fromkeys(dependency_ids or []))
    known = {task["id"] for task in runtime["tasks"]}
    if set(dependencies) - known:
        raise ValueError("unknown task dependency")
    task = {"id": str(uuid.uuid5(NAMESPACE, key)), "idempotencyKey": key, "taskType": task_type, "scope": scope, "dependencyIds": dependencies, "inputHash": input_hash, "outputHash": None, "status": "queued", "attemptCount": 0, "maxAttempts": max_attempts, "leaseOwner": None, "leaseUntil": None, "availableAt": now, "lastErrorCode": None}
    runtime["tasks"].append(task)
    return task


def promote_retries(runtime: dict[str, Any], now: int) -> None:
    for task in runtime["tasks"]:
        if task["status"] == "retry_wait" and task["availableAt"] <= now:
            task["status"] = "queued"


def reclaim_expired(runtime: dict[str, Any], now: int) -> int:
    reclaimed = 0
    for task in runtime["tasks"]:
        if task["status"] == "leased" and task["leaseUntil"] is not None and task["leaseUntil"] <= now:
            attempt = active_attempt(runtime, task["id"])
            attempt.update({"endedAt": now, "status": "lease_expired", "errorCode": "WORKER_LEASE_EXPIRED"})
            task.update({"status": "queued" if task["attemptCount"] < task["maxAttempts"] else "failed", "leaseOwner": None, "leaseUntil": None, "availableAt": now, "lastErrorCode": "WORKER_LEASE_EXPIRED"})
            reclaimed += 1
    return reclaimed


def lease_next(runtime: dict[str, Any], worker_id: str, now: int, lease_seconds: int = 60) -> dict[str, Any] | None:
    reclaim_expired(runtime, now)
    promote_retries(runtime, now)
    states = {task["id"]: task["status"] for task in runtime["tasks"]}
    for task in runtime["tasks"]:
        if task["status"] == "queued" and task["availableAt"] <= now and all(states[dependency] == "succeeded" for dependency in task["dependencyIds"]):
            task.update({"status": "leased", "attemptCount": task["attemptCount"] + 1, "leaseOwner": worker_id, "leaseUntil": now + lease_seconds, "lastErrorCode": None})
            runtime["attempts"].append({"taskId": task["id"], "attemptNo": task["attemptCount"], "workerId": worker_id, "startedAt": now, "endedAt": None, "status": "running", "errorCode": None, "outputHash": None})
            return task
    return None


def succeed(runtime: dict[str, Any], task_id: str, worker_id: str, output: bytes, now: int) -> None:
    task = owned_lease(runtime, task_id, worker_id, now)
    output_hash = digest(output)
    task.update({"status": "succeeded", "outputHash": output_hash, "leaseOwner": None, "leaseUntil": None, "lastErrorCode": None})
    active_attempt(runtime, task_id).update({"endedAt": now, "status": "succeeded", "outputHash": output_hash})


def fail(runtime: dict[str, Any], task_id: str, worker_id: str, error_code: str, now: int) -> None:
    task = owned_lease(runtime, task_id, worker_id, now)
    attempt = active_attempt(runtime, task_id)
    if error_code in BUDGET_ERRORS:
        status = "deferred_budget"
        available_at = now
    elif error_code in TRANSIENT_ERRORS | REPAIRABLE_ERRORS and task["attemptCount"] < task["maxAttempts"]:
        status = "retry_wait"
        available_at = now + min(3600, 30 * (2 ** (task["attemptCount"] - 1)))
    else:
        status = "failed"
        available_at = now
    task.update({"status": status, "outputHash": None, "leaseOwner": None, "leaseUntil": None, "availableAt": available_at, "lastErrorCode": error_code})
    attempt.update({"endedAt": now, "status": status, "errorCode": error_code, "outputHash": None})


def resume_budget(runtime: dict[str, Any], task_id: str, now: int) -> None:
    task = task_by_id(runtime, task_id)
    if task["status"] != "deferred_budget":
        raise ValueError("task is not budget deferred")
    task.update({"status": "queued", "availableAt": now, "lastErrorCode": None})


def owned_lease(runtime: dict[str, Any], task_id: str, worker_id: str, now: int) -> dict[str, Any]:
    task = task_by_id(runtime, task_id)
    if task["status"] != "leased" or task["leaseOwner"] != worker_id or task["leaseUntil"] <= now:
        raise ValueError("worker does not own an active lease")
    return task


def task_by_id(runtime: dict[str, Any], task_id: str) -> dict[str, Any]:
    for task in runtime["tasks"]:
        if task["id"] == task_id:
            return task
    raise ValueError("unknown task")


def active_attempt(runtime: dict[str, Any], task_id: str) -> dict[str, Any]:
    for attempt in reversed(runtime["attempts"]):
        if attempt["taskId"] == task_id and attempt["status"] == "running":
            return attempt
    raise ValueError("no active attempt")
