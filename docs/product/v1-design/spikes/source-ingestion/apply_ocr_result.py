#!/usr/bin/env python3
"""Convert a vendor-neutral OCR result into the unified source-block contract."""

from __future__ import annotations

import argparse
import json
import uuid
from pathlib import Path

from extract_source_blocks import BLOCK_NAMESPACE, make_block, sha256_bytes


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--result", required=True, type=Path)
    parser.add_argument("--base", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    result = json.loads(args.result.read_text(encoding="utf-8"))
    source_path = result["sourcePath"]
    source_file = args.base / source_path
    file_sha = sha256_bytes(source_file.read_bytes())
    engine = result["engine"]
    blocks = []
    for page in result["pages"]:
        for block_index, region in enumerate(page["regions"], start=1):
            confidence = float(region["confidence"])
            warnings = [] if confidence >= 0.9 else ["ocr_low_confidence"]
            block = make_block(
                source_path=source_path,
                source_format="pdf",
                file_sha=file_sha,
                block_type="heading" if region["kind"] == "heading" else "page_region",
                locator={"page": page["page"], "slide": None, "sheet": None, "cellRange": None, "paragraph": None, "table": None, "row": None, "block": block_index, "shape": None, "bbox": region["bbox"]},
                text=region["text"],
                structured_data={"ocrRegionId": region["id"], "ocrKind": region["kind"], "pageWidthPixels": page["width"], "pageHeightPixels": page["height"], "derivedFromSourcePath": result.get("derivedFromSourcePath")},
                parser_name=f"ocr:{engine['name']}",
                confidence=confidence,
                warnings=warnings,
            )
            block["mediaArtifactId"] = str(uuid.uuid5(BLOCK_NAMESPACE, f"media:{source_path}:{file_sha}:page:{page['page']}"))
            blocks.append(block)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("\n".join(json.dumps(block, ensure_ascii=False, sort_keys=True) for block in blocks) + "\n", encoding="utf-8")
    print(json.dumps({"sourcePath": source_path, "blocks": len(blocks), "engine": engine, "output": str(args.output)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
