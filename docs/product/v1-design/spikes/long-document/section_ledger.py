#!/usr/bin/env python3
"""Deterministic state machine for resumable long-document generation."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import uuid
from pathlib import Path
from typing import Any


LEDGER_NAMESPACE = uuid.UUID("70000000-0000-4000-8000-000000000003")


def digest_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def estimate_tokens(text: str) -> int:
    return max(1, math.ceil(len(re.findall(r"[\u3400-\u9fff]", text)) + len(re.findall(r"[A-Za-z0-9_]+", text)) * 1.3))


def refresh_status(ledger: dict[str, Any]) -> None:
    statuses = {section["status"] for section in ledger["sections"]}
    if statuses == {"validated"}:
        ledger["status"] = "complete"
    elif "failed" in statuses and not ({"pending", "in_progress", "stale"} & statuses):
        ledger["status"] = "failed"
    elif "in_progress" in statuses or "drafted" in statuses or "validated" in statuses or "stale" in statuses:
        ledger["status"] = "in_progress"
    else:
        ledger["status"] = "pending"


def create_ledger(outline: dict[str, Any], project_revision_id: str) -> dict[str, Any]:
    canonical = json.dumps(outline, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    outline_hash = digest_bytes(canonical)
    document_id = str(uuid.uuid5(LEDGER_NAMESPACE, f"{project_revision_id}:{outline_hash}:{outline['deliverableType']}"))
    ledger = {
        "schemaVersion": "1.0",
        "documentId": document_id,
        "deliverableType": outline["deliverableType"],
        "projectRevisionId": project_revision_id,
        "outlineHash": outline_hash,
        "status": "pending",
        "sections": [],
    }
    ids = {item["id"] for item in outline["sections"]}
    for order, item in enumerate(outline["sections"], start=1):
        missing = set(item.get("dependencies", [])) - ids
        if missing:
            raise ValueError(f"unknown dependencies for {item['id']}: {sorted(missing)}")
        ledger["sections"].append({"id": item["id"], "title": item["title"], "order": order, "dependencies": item.get("dependencies", []), "status": "pending", "revision": 0, "modelSlot": None, "contextPackHash": None, "contentHash": None, "summary": None, "sourceBlockIds": [], "estimatedOutputTokens": 0, "failure": None})
    return ledger


def section_by_id(ledger: dict[str, Any], section_id: str) -> dict[str, Any]:
    for section in ledger["sections"]:
        if section["id"] == section_id:
            return section
    raise ValueError(f"unknown section: {section_id}")


def next_work_item(ledger: dict[str, Any]) -> dict[str, Any] | None:
    states = {section["id"]: section["status"] for section in ledger["sections"]}
    for section in sorted(ledger["sections"], key=lambda item: item["order"]):
        if section["status"] in {"pending", "stale", "failed"} and all(states.get(dep) == "validated" for dep in section["dependencies"]):
            return section
    return None


def dependency_summary(ledger: dict[str, Any], section_id: str) -> str | None:
    section = section_by_id(ledger, section_id)
    summaries = [section_by_id(ledger, dependency)["summary"] for dependency in section["dependencies"]]
    summaries = [summary for summary in summaries if summary]
    return "\n".join(summaries) if summaries else None


def start_section(ledger: dict[str, Any], section_id: str, context_pack_bytes: bytes, model_slot: str) -> None:
    section = section_by_id(ledger, section_id)
    if section["status"] not in {"pending", "stale", "failed"}:
        raise ValueError(f"cannot start {section_id} from {section['status']}")
    states = {item["id"]: item["status"] for item in ledger["sections"]}
    blocked = [dependency for dependency in section["dependencies"] if states.get(dependency) != "validated"]
    if blocked:
        raise ValueError(f"dependencies not validated: {blocked}")
    if any(item["status"] == "in_progress" for item in ledger["sections"]):
        raise ValueError("another section is already in progress")
    section.update({"status": "in_progress", "modelSlot": model_slot, "contextPackHash": digest_bytes(context_pack_bytes), "contentHash": None, "summary": None, "sourceBlockIds": [], "estimatedOutputTokens": 0, "failure": None})
    refresh_status(ledger)


def complete_section(ledger: dict[str, Any], section_id: str, content: str, summary: str, source_block_ids: list[str]) -> None:
    section = section_by_id(ledger, section_id)
    if section["status"] != "in_progress":
        raise ValueError(f"cannot complete {section_id} from {section['status']}")
    section.update({"status": "drafted", "contentHash": digest_bytes(content.encode("utf-8")), "summary": summary, "sourceBlockIds": list(dict.fromkeys(source_block_ids)), "estimatedOutputTokens": estimate_tokens(content), "failure": None})
    refresh_status(ledger)


def validate_section(ledger: dict[str, Any], section_id: str, passed: bool, failure: str | None = None) -> None:
    section = section_by_id(ledger, section_id)
    if section["status"] != "drafted":
        raise ValueError(f"cannot validate {section_id} from {section['status']}")
    section["status"] = "validated" if passed else "failed"
    section["failure"] = None if passed else (failure or "quality_check_failed")
    refresh_status(ledger)


def revise_section(ledger: dict[str, Any], section_id: str) -> None:
    target = section_by_id(ledger, section_id)
    target.update({"status": "pending", "revision": target["revision"] + 1, "modelSlot": None, "contextPackHash": None, "contentHash": None, "summary": None, "sourceBlockIds": [], "estimatedOutputTokens": 0, "failure": None})
    affected = {section_id}
    changed = True
    while changed:
        changed = False
        for section in ledger["sections"]:
            if section["id"] not in affected and set(section["dependencies"]) & affected:
                affected.add(section["id"])
                if section["status"] in {"drafted", "validated", "failed"}:
                    section["status"] = "stale"
                changed = True
    refresh_status(ledger)


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    init = subparsers.add_parser("init")
    init.add_argument("--outline", required=True, type=Path)
    init.add_argument("--project-revision-id", required=True)
    init.add_argument("--output", required=True, type=Path)
    resume = subparsers.add_parser("resume")
    resume.add_argument("--ledger", required=True, type=Path)
    args = parser.parse_args()
    if args.command == "init":
        ledger = create_ledger(json.loads(args.outline.read_text(encoding="utf-8")), args.project_revision_id)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(ledger, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"documentId": ledger["documentId"], "sections": len(ledger["sections"]), "output": str(args.output)}, ensure_ascii=False))
    else:
        ledger = json.loads(args.ledger.read_text(encoding="utf-8"))
        item = next_work_item(ledger)
        print(json.dumps({"documentId": ledger["documentId"], "status": ledger["status"], "nextSection": item["id"] if item else None, "dependencySummary": dependency_summary(ledger, item["id"]) if item else None}, ensure_ascii=False))


if __name__ == "__main__":
    main()
