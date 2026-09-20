#!/usr/bin/env python3
"""Plan reusable semantic generation once and deterministic multi-format renders."""

from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
from typing import Any


def load_dispatcher():
    path = Path(__file__).resolve().parents[1] / "model-routing/dispatch_model.py"
    spec = importlib.util.spec_from_file_location("model_dispatch", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.dispatch


def plan(catalog: dict[str, Any], policy: dict[str, Any], deliverables: list[str], remaining_budget: float) -> dict[str, Any]:
    dispatch = load_dispatcher()
    selected = list(dict.fromkeys(deliverables))
    unknown = set(selected) - set(catalog["formats"])
    if unknown:
        raise ValueError(f"unknown deliverables: {sorted(unknown)}")
    modules = []
    optimized_cost = 0.0
    budget = remaining_budget
    overall_status = "ready"
    for item in catalog["modules"]:
        used_by = [deliverable for deliverable in selected if deliverable in item["deliverables"]]
        if not used_by:
            continue
        decision = dispatch(policy, item["taskType"], item["inputTokens"], item["outputTokens"], budget)
        modules.append({"id": item["id"], "taskType": item["taskType"], "deliverables": used_by, "inputTokens": item["inputTokens"], "outputTokens": item["outputTokens"], "dispatchStatus": decision["status"], "slotId": decision["slotId"], "weightedCost": decision["weightedCost"]})
        if decision["status"] in {"ready", "deterministic"}:
            optimized_cost += decision["weightedCost"]
            budget = decision["remainingBudgetAfter"]
        elif decision["status"] == "split_required":
            overall_status = "split_required"
        elif overall_status != "split_required":
            overall_status = "deferred_budget"
    render_jobs = []
    for deliverable in selected:
        module_ids = [item["id"] for item in modules if deliverable in item["deliverables"]]
        for output_format in catalog["formats"][deliverable]:
            render_jobs.append({"deliverable": deliverable, "format": output_format, "contentModuleIds": module_ids, "modelCall": False})
    module_costs = {item["id"]: item["weightedCost"] for item in modules}
    naive_cost = sum(sum(module_costs[module_id] for module_id in job["contentModuleIds"]) for job in render_jobs)
    avoided = max(0.0, naive_cost - optimized_cost)
    return {
        "schemaVersion": "1.0",
        "status": overall_status,
        "deliverables": selected,
        "contentModules": modules,
        "renderJobs": render_jobs,
        "costSummary": {"optimizedWeightedCost": round(optimized_cost, 4), "naivePerFormatWeightedCost": round(naive_cost, 4), "avoidedWeightedCost": round(avoided, 4), "savingsRate": round(avoided / naive_cost, 6) if naive_cost else 0, "modelCalls": sum(item["dispatchStatus"] == "ready" for item in modules), "renderJobs": len(render_jobs)},
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", required=True, type=Path)
    parser.add_argument("--policy", required=True, type=Path)
    parser.add_argument("--deliverable", required=True, action="append")
    parser.add_argument("--remaining-budget", required=True, type=float)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    result = plan(json.loads(args.catalog.read_text(encoding="utf-8")), json.loads(args.policy.read_text(encoding="utf-8")), args.deliverable, args.remaining_budget)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": result["status"], **result["costSummary"], "output": str(args.output)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
