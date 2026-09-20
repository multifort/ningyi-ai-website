#!/usr/bin/env python3
"""Resolve abstract capability slots without binding a provider model."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


FORMAL_TASKS = {"formal_analysis", "section_generation", "revision", "quality_review"}


def dispatch(policy: dict[str, Any], task_type: str, input_tokens: int, output_tokens: int, remaining_budget: float) -> dict[str, Any]:
    slots = {slot["id"]: slot for slot in policy["slots"]}
    if task_type not in policy["taskRules"]:
        raise ValueError(f"no routing rule for task: {task_type}")
    slot = slots[policy["taskRules"][task_type]]
    reasons = []
    if slot["qualityTier"] == "deterministic":
        return {"schemaVersion": "1.0", "taskType": task_type, "status": "deterministic", "slotId": slot["id"], "qualityTier": "deterministic", "inputTokens": input_tokens, "requestedOutputTokens": output_tokens, "weightedCost": 0, "remainingBudgetBefore": remaining_budget, "remainingBudgetAfter": remaining_budget, "reasonCodes": ["no_model_call_required"]}
    if task_type == "free_analysis":
        reasons.append("free_analysis_uses_economy_tier")
    if task_type in FORMAL_TASKS:
        if slot["qualityTier"] != "quality":
            raise ValueError(f"formal task cannot use non-quality slot: {slot['id']}")
        reasons.append("formal_task_requires_quality_tier")
    if task_type == "vision_low_cost":
        reasons.append("visual_verification_uses_economy_tier")
    if task_type == "vision_premium":
        reasons.append("complex_or_low_confidence_visual_requires_quality_tier")
    if input_tokens > slot["maxInputTokens"] or output_tokens > slot["maxOutputTokens"]:
        return {"schemaVersion": "1.0", "taskType": task_type, "status": "split_required", "slotId": slot["id"], "qualityTier": slot["qualityTier"], "inputTokens": input_tokens, "requestedOutputTokens": output_tokens, "weightedCost": 0, "remainingBudgetBefore": remaining_budget, "remainingBudgetAfter": remaining_budget, "reasonCodes": reasons + ["slot_context_or_output_limit_exceeded"]}
    weighted_cost = round(input_tokens * slot["inputWeight"] + output_tokens * slot["outputWeight"], 4)
    if weighted_cost > remaining_budget:
        return {"schemaVersion": "1.0", "taskType": task_type, "status": "deferred_budget", "slotId": slot["id"], "qualityTier": slot["qualityTier"], "inputTokens": input_tokens, "requestedOutputTokens": output_tokens, "weightedCost": weighted_cost, "remainingBudgetBefore": remaining_budget, "remainingBudgetAfter": remaining_budget, "reasonCodes": reasons + ["insufficient_internal_budget_no_silent_downgrade"]}
    return {"schemaVersion": "1.0", "taskType": task_type, "status": "ready", "slotId": slot["id"], "qualityTier": slot["qualityTier"], "inputTokens": input_tokens, "requestedOutputTokens": output_tokens, "weightedCost": weighted_cost, "remainingBudgetBefore": remaining_budget, "remainingBudgetAfter": round(remaining_budget - weighted_cost, 4), "reasonCodes": reasons + ["within_slot_and_budget_limits"]}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--policy", required=True, type=Path)
    parser.add_argument("--task-type", required=True)
    parser.add_argument("--input-tokens", required=True, type=int)
    parser.add_argument("--output-tokens", required=True, type=int)
    parser.add_argument("--remaining-budget", required=True, type=float)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    decision = dispatch(json.loads(args.policy.read_text(encoding="utf-8")), args.task_type, args.input_tokens, args.output_tokens, args.remaining_budget)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(decision, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(decision, ensure_ascii=False))


if __name__ == "__main__":
    main()
