#!/usr/bin/env python3
"""Translate internal execution/runtime state into concise user-facing progress."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


KIND_WEIGHT = {"model_generation": 5, "deterministic_compute": 5, "quality_gate": 2, "deterministic_render": 1}
STAGE_COPY = {
    "understanding": ("正在理解你提供的信息", "系统正在整理资料、图片和表格中的有效内容。"),
    "forming_content": ("正在形成交付内容", "需求、功能、估算和方案内容正在逐项形成，完成的成果会立即开放。"),
    "checking": ("正在检查成果一致性", "系统正在核对范围、数字、引用和跨成果一致性。"),
    "creating_files": ("正在生成交付文件", "内容已经确认，正在生成 Word、Excel、PowerPoint 和 PDF 文件。"),
    "complete": ("全部成果已可用", "所有成果均已完成检查，可以在线查看或下载。"),
    "recovering": ("系统正在自动恢复", "处理遇到短暂延迟，系统会自动继续，无需重新提交资料。")
}


def aggregate(plan: dict[str, Any], run: dict[str, Any], runtime: dict[str, Any] | None = None) -> dict[str, Any]:
    nodes = {item["id"]: item for item in run["nodes"]}
    total_weight = sum(KIND_WEIGHT[item["kind"]] for item in run["nodes"])
    complete_weight = sum(KIND_WEIGHT[item["kind"]] for item in run["nodes"] if item["status"] == "complete")
    progress = round(100 * complete_weight / total_weight) if total_weight else 0
    deliverables = []
    for deliverable in plan["deliverables"]:
        jobs = [job for job in plan["renderJobs"] if job["deliverable"] == deliverable]
        module_ids = list(dict.fromkeys(module_id for job in jobs for module_id in job["contentModuleIds"]))
        content = [nodes[f"content:{module_id}"] for module_id in module_ids]
        quality = [nodes[f"quality:{module_id}"] for module_id in module_ids]
        renders = [(job, nodes[f"render:{deliverable}:{job['format']}"]) for job in jobs]
        available_formats = [job["format"] for job, item in renders if item["status"] == "complete"]
        relevant = content + quality + [item for _, item in renders]
        deliverable_progress = round(100 * sum(KIND_WEIGHT[item["kind"]] for item in relevant if item["status"] == "complete") / sum(KIND_WEIGHT[item["kind"]] for item in relevant))
        states = {item["status"] for item in relevant}
        if states == {"complete"}:
            status = "available"
        elif "failed" in states:
            status = "failed"
        elif "stale" in states:
            status = "affected"
        elif any(item["status"] == "in_progress" for _, item in renders) or (all(item["status"] == "complete" for item in quality) and not all(item["status"] == "complete" for _, item in renders)):
            status = "creating_files"
        elif any(item["status"] in {"in_progress", "complete"} for item in quality):
            status = "checking"
        elif any(item["status"] in {"in_progress", "complete"} for item in content):
            status = "generating"
        else:
            status = "waiting"
        deliverables.append({"id": deliverable, "status": status, "availableFormats": available_formats, "progressPercent": deliverable_progress})

    runtime_states = {task["status"] for task in (runtime or {}).get("tasks", [])}
    recoverable_delay = bool(runtime_states & {"retry_wait", "deferred_budget"})
    terminal_failure = bool(runtime_states & {"failed"}) or any(item["status"] == "failed" for item in run["nodes"])
    available_count = sum(item["status"] == "available" for item in deliverables)
    if all(item["status"] == "available" for item in deliverables):
        status, stage = "available", "complete"
    elif recoverable_delay:
        status, stage = "recovering", "recovering"
    elif terminal_failure and available_count == 0:
        status, stage = "blocked", infer_stage(run)
    elif available_count:
        status, stage = "partially_available", infer_stage(run)
    else:
        status, stage = "processing", infer_stage(run)
    headline, detail = STAGE_COPY[stage]
    if status == "partially_available":
        headline = f"已有 {available_count} 项成果可查看"
        detail = "其余成果仍在自动处理中，你可以先查看或下载已完成部分。"
    elif status == "blocked":
        headline = "部分内容暂时无法继续"
        detail = "系统已保留现有进度和可用成果，并记录了具体失败范围。"
    return {"schemaVersion": "1.0", "status": status, "stage": stage, "progressPercent": 100 if status == "available" else progress, "headline": headline, "detail": detail, "requiresUserAction": False, "deliverables": deliverables}


def infer_stage(run: dict[str, Any]) -> str:
    nodes = run["nodes"]
    content = [item for item in nodes if item["kind"] in {"model_generation", "deterministic_compute"}]
    quality = [item for item in nodes if item["kind"] == "quality_gate"]
    render = [item for item in nodes if item["kind"] == "deterministic_render"]
    if any(item["status"] != "complete" for item in content):
        return "forming_content" if any(item["status"] in {"in_progress", "complete"} for item in content) else "understanding"
    if any(item["status"] != "complete" for item in quality):
        return "checking"
    if any(item["status"] != "complete" for item in render):
        return "creating_files"
    return "complete"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", required=True, type=Path)
    parser.add_argument("--run", required=True, type=Path)
    parser.add_argument("--runtime", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    result = aggregate(json.loads(args.plan.read_text(encoding="utf-8")), json.loads(args.run.read_text(encoding="utf-8")), json.loads(args.runtime.read_text(encoding="utf-8")) if args.runtime else None)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": result["status"], "stage": result["stage"], "progressPercent": result["progressPercent"], "output": str(args.output)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
