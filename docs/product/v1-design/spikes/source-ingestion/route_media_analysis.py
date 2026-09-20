#!/usr/bin/env python3
"""Cost-aware deterministic routing for OCR and visual analysis."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def post_ocr_route(confidence: float, layout_complexity: str) -> tuple[str, list[str]]:
    if confidence < 0.72 or layout_complexity == "high":
        return "vision_premium", ["ocr_low_confidence_or_complex_layout"]
    if confidence < 0.9 or layout_complexity == "medium":
        return "vision_low_cost", ["ocr_requires_visual_verification"]
    return "deterministic_text", ["ocr_high_confidence"]


def route_block(block: dict[str, Any]) -> dict[str, Any] | None:
    source_format = block["sourceFormat"]
    if source_format not in {"pdf", "image", "pptx"}:
        return None
    if source_format == "pptx" and block.get("blockType") != "image":
        return None
    warnings = set(block.get("warnings", []))
    text = block.get("canonicalText", "")
    is_media = block.get("blockType") == "image" or "ocr_required" in warnings
    if "ocr_low_confidence" in warnings:
        confidence = float(block.get("confidence", 0))
        route, reasons = post_ocr_route(confidence, "unknown")
        fallback = "vision_premium" if route == "vision_low_cost" else "none"
        requires_model = route.startswith("vision_")
        native_chars, has_text = 0, False
    elif source_format == "pdf" and not is_media:
        route, reasons, fallback, requires_model = "deterministic_text", ["native_text_layer_available"], "none", False
        native_chars, has_text = len(text), True
    elif "ocr_required" in warnings or source_format == "image":
        route, reasons, fallback, requires_model = "ocr_standard", ["no_usable_text_layer"], "vision_low_cost", False
        native_chars, has_text = 0, False
    else:
        route, reasons, fallback, requires_model = "vision_low_cost", ["embedded_visual_requires_semantic_analysis"], "vision_premium", True
        native_chars, has_text = 0, False
    return {
        "schemaVersion": "1.0",
        "sourcePath": block["sourcePath"],
        "sourceFormat": source_format,
        "page": block.get("locator", {}).get("page") or block.get("locator", {}).get("slide"),
        "route": route,
        "reasonCodes": reasons,
        "signals": {"nativeTextChars": native_chars, "hasTextLayer": has_text, "ocrConfidence": float(block["confidence"]) if block.get("parser", {}).get("name", "").startswith("ocr:") else None, "layoutComplexity": "unknown"},
        "fallbackRoute": fallback,
        "requiresModel": requires_model,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--blocks", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    blocks = [json.loads(line) for line in args.blocks.read_text(encoding="utf-8").splitlines() if line]
    routes = [route for block in blocks if (route := route_block(block)) is not None]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("\n".join(json.dumps(route, ensure_ascii=False, sort_keys=True) for route in routes) + "\n", encoding="utf-8")
    counts: dict[str, int] = {}
    for route in routes:
        counts[route["route"]] = counts.get(route["route"], 0) + 1
    print(json.dumps({"routes": len(routes), "byRoute": counts, "output": str(args.output)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
