#!/usr/bin/env python3
"""Deterministic pre-model quality gate for a generated section draft."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


def normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9\u3400-\u9fff]", "", text.lower())


def similarity(left: str, right: str) -> float:
    left_norm, right_norm = normalize(left), normalize(right)
    if not left_norm or not right_norm:
        return 0.0
    if left_norm in right_norm or right_norm in left_norm:
        return min(len(left_norm), len(right_norm)) / max(len(left_norm), len(right_norm))
    left_pairs = {left_norm[index:index + 2] for index in range(max(1, len(left_norm) - 1))}
    right_pairs = {right_norm[index:index + 2] for index in range(max(1, len(right_norm) - 1))}
    return len(left_pairs & right_pairs) / max(1, len(left_pairs | right_pairs))


def check(code: str, severity: str, passed: bool, message: str, block_ids: list[str]) -> dict[str, Any]:
    return {"code": code, "severity": severity, "passed": passed, "message": message, "blockIds": sorted(set(block_ids))}


def evaluate(draft: dict[str, Any], context: dict[str, Any], project: dict[str, Any], prior_drafts: list[dict[str, Any]]) -> dict[str, Any]:
    context_ids = {item["sourceBlockId"] for item in context["evidence"]}
    fact_blocks = [block for block in draft["blocks"] if block["claimType"] == "sourced_fact"]
    uncited = [block["id"] for block in fact_blocks if not block["sourceBlockIds"]]
    out_of_context = [block["id"] for block in draft["blocks"] if set(block["sourceBlockIds"]) - context_ids]
    checks = [
        check("QG-CITATION", "error", not uncited, "所有事实块均有引用。" if not uncited else "存在没有来源引用的事实块。", uncited),
        check("QG-CONTEXT", "error", not out_of_context, "所有引用均来自当前上下文包。" if not out_of_context else "存在上下文包之外的引用。", out_of_context),
    ]

    excluded = project.get("scope", {}).get("excluded", [])
    violations = []
    commitment = re.compile(r"(纳入|建设|实现|提供|交付|支持)")
    negation = re.compile(r"(不纳入|不建设|不实现|不提供|不交付|不支持|排除)")
    for block in draft["blocks"]:
        for item in excluded:
            title = item.get("title", "")
            if title and title in block["text"] and commitment.search(block["text"]) and not negation.search(block["text"]):
                violations.append(block["id"])
    checks.append(check("QG-SCOPE", "error", not violations, "未发现排除范围承诺。" if not violations else "章节将排除项描述为本期承诺。", violations))

    context_has_conflict = any("冲突" in item["text"] or "不一致" in item["text"] for item in context["evidence"])
    draft_text = "\n".join(block["text"] for block in draft["blocks"])
    conflict_passed = not context_has_conflict or (("冲突" in draft_text or "不一致" in draft_text) and ("方案一" in draft_text or "可选" in draft_text))
    checks.append(check("QG-CONFLICT", "error", conflict_passed, "显式冲突和可选处理方向均已呈现。" if conflict_passed else "上下文含显式冲突，但章节未同时呈现冲突与可选处理方向。", [] if conflict_passed else [block["id"] for block in draft["blocks"]]))

    prior_texts = [block["text"] for prior in prior_drafts for block in prior.get("blocks", []) if block.get("type") != "heading"]
    duplicates = [block["id"] for block in draft["blocks"] if block["type"] != "heading" and any(similarity(block["text"], prior) >= 0.82 for prior in prior_texts)]
    checks.append(check("QG-DUPLICATION", "warning", not duplicates, "未发现与前文章节高度重复的内容。" if not duplicates else "存在与前文章节高度重复的内容。", duplicates))

    terminology_issues = []
    canonical_terms = {"响应式 Web": ["H5 应用", "原生 Web"], "销售代表": ["销售员", "业务员"], "销售经理": ["销售主管"]}
    for block in draft["blocks"]:
        if any(alias in block["text"] for aliases in canonical_terms.values() for alias in aliases):
            terminology_issues.append(block["id"])
    checks.append(check("QG-TERMINOLOGY", "warning", not terminology_issues, "关键术语与项目主干一致。" if not terminology_issues else "发现未使用项目规范词的术语。", terminology_issues))

    error_failed = any(not item["passed"] and item["severity"] == "error" for item in checks)
    cited = len(fact_blocks) - len(uncited)
    return {
        "schemaVersion": "1.0",
        "sectionId": draft["sectionId"],
        "status": "fail" if error_failed else "pass",
        "checks": checks,
        "metrics": {"blocks": len(draft["blocks"]), "sourcedFactBlocks": len(fact_blocks), "citedFactBlocks": cited, "citationCoverage": round(cited / len(fact_blocks), 6) if fact_blocks else 1.0, "duplicateBlocks": len(duplicates)},
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--draft", required=True, type=Path)
    parser.add_argument("--context-pack", required=True, type=Path)
    parser.add_argument("--project-model", required=True, type=Path)
    parser.add_argument("--prior-draft", type=Path, action="append", default=[])
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    report = evaluate(json.loads(args.draft.read_text(encoding="utf-8")), json.loads(args.context_pack.read_text(encoding="utf-8")), json.loads(args.project_model.read_text(encoding="utf-8")), [json.loads(path.read_text(encoding="utf-8")) for path in args.prior_draft])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"sectionId": report["sectionId"], "status": report["status"], "failedChecks": [item["code"] for item in report["checks"] if not item["passed"]], "output": str(args.output)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
