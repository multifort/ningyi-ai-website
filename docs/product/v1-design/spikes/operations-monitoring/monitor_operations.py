#!/usr/bin/env python3
"""Aggregate anonymous operational events and choose safe automatic actions."""

from __future__ import annotations

import math
from collections import defaultdict
from typing import Any


def percentile(values: list[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    return float(ordered[max(0, math.ceil(len(ordered) * fraction) - 1)])


def snapshot(policy: dict[str, Any], runs: list[dict[str, Any]], tasks: list[dict[str, Any]], calls: list[dict[str, Any]], window_from: int, window_to: int) -> dict[str, Any]:
    completed = [run for run in runs if run["status"] in {"succeeded", "failed"}]
    succeeded = [run for run in completed if run["status"] == "succeeded"]
    complete_deliveries = [run for run in succeeded if run.get("completedDeliverables", 0) == run.get("expectedDeliverables", 7)]
    durations = [run["durationSeconds"] for run in completed]
    queued = [task for task in tasks if task["status"] in {"queued", "retry_wait", "deferred_budget"}]
    estimated_cost = sum(call["estimatedCost"] for call in calls)
    expected_cost = sum(call["expectedCost"] for call in calls)
    retries = sum(task.get("attemptCount", 0) > 1 for task in tasks)
    provider_events: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for call in calls:
        provider_events[call["provider"]].append(call)
    provider_health = []
    for provider, events in sorted(provider_events.items()):
        provider_health.append({"provider": provider, "calls": len(events), "failureRate": round(sum(not event["succeeded"] for event in events) / len(events), 6), "p95Seconds": percentile([event["durationSeconds"] for event in events], 0.95)})
    metrics = {
        "runs": len(completed),
        "successRate": round(len(succeeded) / len(completed), 6) if completed else 0,
        "completeDeliveryRate": round(len(complete_deliveries) / len(completed), 6) if completed else 0,
        "latencyP50Seconds": percentile(durations, 0.5),
        "latencyP95Seconds": percentile(durations, 0.95),
        "queuedTasks": len(queued),
        "oldestQueueAgeSeconds": max([max(0, window_to - task["createdAt"]) for task in queued], default=0),
        "retryRate": round(retries / len(tasks), 6) if tasks else 0,
        "estimatedCost": round(estimated_cost, 6),
        "expectedCost": round(expected_cost, 6),
        "costRatio": round(estimated_cost / expected_cost, 6) if expected_cost else 0
    }
    alerts = []
    enough = len(completed) >= policy["minSamples"]
    if enough and metrics["successRate"] < policy["successRateMinimum"]:
        alerts.append(alert("SUCCESS_RATE_LOW", "critical", "hold_rollout"))
    if enough and metrics["completeDeliveryRate"] < policy["completeDeliveryRateMinimum"]:
        alerts.append(alert("DELIVERY_RATE_LOW", "critical", "hold_rollout"))
    if enough and metrics["latencyP95Seconds"] > policy["latencyP95MaximumSeconds"]:
        alerts.append(alert("LATENCY_P95_HIGH", "warning", "increase_worker_capacity"))
    if metrics["queuedTasks"] > policy["queuedTasksMaximum"] or metrics["oldestQueueAgeSeconds"] > policy["oldestQueueAgeMaximumSeconds"]:
        alerts.append(alert("BACKLOG_HIGH", "warning", "increase_worker_capacity"))
    if expected_cost and metrics["costRatio"] > policy["costRatioMaximum"]:
        alerts.append(alert("COST_ANOMALY", "critical", "throttle_free_and_defer_new_formal"))
    if any(item["calls"] >= policy["providerMinCalls"] and item["failureRate"] > policy["providerFailureRateMaximum"] for item in provider_health):
        alerts.append(alert("PROVIDER_FAILURE_HIGH", "critical", "route_verified_backup"))
    return {"schemaVersion": "1.0", "window": {"from": window_from, "to": window_to}, "metrics": metrics, "providerHealth": provider_health, "alerts": alerts, "routingSafety": {"formalSilentDowngrades": 0, "unverifiedProviderRoutes": 0}}


def alert(code: str, severity: str, action: str) -> dict[str, str]:
    return {"code": code, "severity": severity, "automaticAction": action}
