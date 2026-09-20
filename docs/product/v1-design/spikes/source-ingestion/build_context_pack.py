#!/usr/bin/env python3
"""Build a deterministic, budgeted evidence pack for one analysis section."""

from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path
from typing import Any


def estimate_tokens(text: str) -> int:
    cjk = len(re.findall(r"[\u3400-\u9fff]", text))
    latin = len(re.findall(r"[A-Za-z0-9_]+", text))
    punctuation = len(re.findall(r"[^\w\s\u3400-\u9fff]", text))
    return max(1, math.ceil(cjk + latin * 1.3 + punctuation * 0.3))


def terms(text: str) -> set[str]:
    normalized = re.sub(r"\s+", "", text.lower())
    result = set(re.findall(r"[a-z0-9_-]{2,}", normalized))
    cjk_runs = re.findall(r"[\u3400-\u9fff]+", normalized)
    for run in cjk_runs:
        result.update(run[index:index + 2] for index in range(max(1, len(run) - 1)))
        if len(run) <= 6:
            result.add(run)
    return result


def continuity_from_project(project: dict[str, Any], prior_summary: str | None) -> dict[str, Any]:
    def statement(item: dict[str, Any]) -> str:
        return f"{item.get('title', item.get('key', ''))}：{item.get('description', '')}".strip("：")

    spine = []
    spine.extend(statement(item) for item in project.get("goals", [])[:3])
    spine.extend("纳入范围：" + statement(item) for item in project.get("scope", {}).get("included", [])[:5])
    locked = []
    locked.extend(statement(item) for item in project.get("constraints", []) if item.get("locked"))
    locked.extend("排除范围：" + statement(item) for item in project.get("scope", {}).get("excluded", [])[:5])
    return {"projectSpine": list(dict.fromkeys(spine)), "lockedDecisions": list(dict.fromkeys(locked)), "priorSectionSummary": prior_summary}


def build_pack(blocks: list[dict[str, Any]], project: dict[str, Any], query: str, task_type: str, section_id: str, max_tokens: int, reserved_output: int, prior_summary: str | None) -> dict[str, Any]:
    query_terms = terms(query)
    continuity = continuity_from_project(project, prior_summary)
    fixed_text = "\n".join(continuity["projectSpine"] + continuity["lockedDecisions"] + ([prior_summary] if prior_summary else []))
    fixed_tokens = estimate_tokens(fixed_text) if fixed_text else 0
    safety_margin = max(64, math.ceil(max_tokens * 0.1))
    evidence_budget = max(0, max_tokens - fixed_tokens - safety_margin)
    available_source_paths = {block["sourcePath"] for block in blocks}
    seen_hashes: set[str] = set()
    duplicate_count = 0
    candidates = []
    for block in blocks:
        if "ocr_required" in block.get("warnings", []):
            continue
        derived_from = (block.get("structuredData") or {}).get("derivedFromSourcePath")
        if derived_from and derived_from in available_source_paths:
            duplicate_count += 1
            continue
        content_hash = block["contentHash"]
        if content_hash in seen_hashes:
            duplicate_count += 1
            continue
        seen_hashes.add(content_hash)
        overlap = query_terms & terms(block["canonicalText"])
        reasons = []
        score = float(len(overlap) * 10)
        if overlap:
            reasons.append("query_term_overlap")
        if any(keyword in block["canonicalText"] for keyword in ("冲突", "不一致", "不能", "排除", "不纳入")):
            score += 8
            reasons.append("decision_or_conflict_evidence")
        if block["sourceFormat"] in {"docx", "pdf", "xlsx"}:
            score += 1
        if not reasons:
            continue
        token_count = estimate_tokens(block["canonicalText"])
        candidates.append((score, token_count, block, reasons))
    candidates.sort(key=lambda item: (-item[0], item[1], item[2]["id"]))
    evidence = []
    used = 0
    excluded = 0
    source_paths: set[str] = set()
    for score, token_count, block, reasons in candidates:
        diversity_bonus = 2 if block["sourcePath"] not in source_paths else 0
        score += diversity_bonus
        if diversity_bonus:
            reasons = reasons + ["source_diversity"]
        if used + token_count > evidence_budget:
            excluded += 1
            continue
        evidence.append({"sourceBlockId": block["id"], "sourcePath": block["sourcePath"], "locator": block["locator"], "text": block["canonicalText"], "estimatedTokens": token_count, "score": round(score, 2), "selectionReasons": reasons})
        used += token_count
        source_paths.add(block["sourcePath"])
    total = fixed_tokens + used
    return {
        "schemaVersion": "1.0",
        "taskType": task_type,
        "sectionId": section_id,
        "query": query,
        "budget": {"maxInputTokens": max_tokens, "reservedOutputTokens": reserved_output, "safetyMarginTokens": safety_margin, "estimatedInputTokens": total, "utilization": round(total / max_tokens, 6)},
        "continuity": continuity,
        "evidence": evidence,
        "omitted": {"candidateBlocks": len(candidates), "duplicateBlocks": duplicate_count, "budgetExcludedBlocks": excluded},
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--blocks", required=True, type=Path, nargs="+")
    parser.add_argument("--project-model", required=True, type=Path)
    parser.add_argument("--query", required=True)
    parser.add_argument("--task-type", choices=["free_analysis", "formal_analysis", "section_generation", "revision", "quality_review"], required=True)
    parser.add_argument("--section-id", required=True)
    parser.add_argument("--max-input-tokens", type=int, required=True)
    parser.add_argument("--reserved-output-tokens", type=int, default=0)
    parser.add_argument("--prior-section-summary")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    blocks = []
    for path in args.blocks:
        blocks.extend(json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line)
    project = json.loads(args.project_model.read_text(encoding="utf-8"))
    pack = build_pack(blocks, project, args.query, args.task_type, args.section_id, args.max_input_tokens, args.reserved_output_tokens, args.prior_section_summary)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(pack, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"sectionId": args.section_id, "evidenceBlocks": len(pack["evidence"]), "estimatedInputTokens": pack["budget"]["estimatedInputTokens"], "maxInputTokens": args.max_input_tokens, "output": str(args.output)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
