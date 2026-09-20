#!/usr/bin/env python3
"""Pre-parse upload validation based on bytes, not browser MIME claims."""

from __future__ import annotations

import argparse
import io
import json
import uuid
import zipfile
from pathlib import Path
from typing import Any


NAMESPACE = uuid.UUID("70000000-0000-4000-8000-000000000008")
EXTENSIONS = {"docx": {".docx"}, "xlsx": {".xlsx"}, "pptx": {".pptx"}, "pdf": {".pdf"}, "png": {".png"}, "jpeg": {".jpg", ".jpeg"}}
ALLOWED = {"content": {"docx", "xlsx", "pptx", "pdf", "png", "jpeg"}, "template": {"docx", "xlsx", "pptx"}, "brand": {"pdf", "png", "jpeg"}}


def validate_bytes(display_name: str, category: str, data: bytes, max_size_bytes: int = 50 * 1024 * 1024, max_uncompressed_bytes: int = 500 * 1024 * 1024, max_ratio: float = 100.0, max_entries: int = 10000) -> dict[str, Any]:
    file_id = str(uuid.uuid5(NAMESPACE, f"{category}:{display_name}:{len(data)}"))
    detected, archive, inspection_errors = inspect(data, max_uncompressed_bytes, max_ratio, max_entries)
    errors = list(inspection_errors)
    if not data:
        errors.append("EMPTY_FILE")
    if len(data) > max_size_bytes:
        errors.append("FILE_TOO_LARGE")
    suffix = Path(display_name).suffix.lower()
    expected = EXTENSIONS.get(detected, set())
    if expected and suffix not in expected:
        errors.append("TYPE_MISMATCH")
    if detected == "encrypted_office" or (detected in {"docx", "xlsx", "pptx", "zip"} and archive["encrypted"]):
        errors.append("PASSWORD_PROTECTED")
    if archive["macro"] or suffix in {".docm", ".xlsm", ".pptm"}:
        errors.append("MACRO_ENABLED")
    if detected not in ALLOWED.get(category, set()) and detected not in {"encrypted_office"}:
        errors.append("CATEGORY_NOT_ALLOWED" if detected != "unknown" else "UNSUPPORTED_TYPE")
    errors = list(dict.fromkeys(errors))
    warnings = []
    if category == "template" and errors:
        warnings.append("DEFAULT_TEMPLATE_FALLBACK")
    action = choose_action(category, errors)
    profile = {"sizeBytes": len(data), "archiveEntries": archive["entries"], "uncompressedBytes": archive["uncompressed"], "compressionRatio": round(archive["ratio"], 3)}
    return {"schemaVersion": "1.0", "fileId": file_id, "category": category, "displayName": display_name, "status": "rejected" if errors else "accepted", "detectedFormat": detected, "safeToParse": not errors, "errors": errors, "warnings": warnings, "resourceProfile": profile, "recommendedAction": action}


def inspect(data: bytes, max_uncompressed: int, max_ratio: float, max_entries: int) -> tuple[str, dict[str, Any], list[str]]:
    archive = {"entries": 0, "uncompressed": 0, "ratio": 0.0, "encrypted": False, "macro": False}
    if data.startswith(b"%PDF-"):
        return ("encrypted_office" if b"/Encrypt" in data else "pdf"), archive, []
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png", archive, []
    if data.startswith(b"\xff\xd8\xff"):
        return "jpeg", archive, []
    if data.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        return "encrypted_office", archive, []
    if not data.startswith(b"PK"):
        return "unknown", archive, []
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as package:
            infos = package.infolist()
            names = {info.filename for info in infos}
            archive["entries"] = len(infos)
            archive["uncompressed"] = sum(info.file_size for info in infos)
            compressed = max(1, sum(info.compress_size for info in infos))
            archive["ratio"] = archive["uncompressed"] / compressed
            archive["encrypted"] = any(info.flag_bits & 0x1 for info in infos)
            archive["macro"] = any(info.filename.lower().endswith("vbaproject.bin") for info in infos)
            errors = []
            if archive["entries"] > max_entries or archive["uncompressed"] > max_uncompressed or archive["ratio"] > max_ratio:
                errors.append("ZIP_BOMB_RISK")
            if "word/document.xml" in names:
                detected = "docx"
            elif "xl/workbook.xml" in names:
                detected = "xlsx"
            elif "ppt/presentation.xml" in names:
                detected = "pptx"
            else:
                detected = "zip"
            return detected, archive, errors
    except (zipfile.BadZipFile, OSError):
        return "zip", archive, ["CORRUPT_ARCHIVE"]


def choose_action(category: str, errors: list[str]) -> str:
    if not errors:
        return "parse"
    if category == "template":
        return "use_default_template"
    if "PASSWORD_PROTECTED" in errors:
        return "upload_unencrypted"
    if set(errors) & {"TYPE_MISMATCH", "CORRUPT_ARCHIVE", "EMPTY_FILE"}:
        return "replace_file"
    return "remove_or_convert"


def aggregate_batch(results: list[dict[str, Any]], has_description: bool) -> dict[str, Any]:
    valid_content = sum(item["category"] == "content" and item["status"] == "accepted" for item in results)
    rejected = sum(item["status"] == "rejected" for item in results)
    can_continue = has_description or valid_content > 0
    return {"status": "ready" if can_continue and not rejected else "partial" if can_continue else "blocked", "canContinue": can_continue, "acceptedFiles": len(results) - rejected, "rejectedFiles": rejected, "useDefaultTemplate": any(item["category"] == "template" and item["status"] == "rejected" for item in results)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--category", required=True, choices=sorted(ALLOWED))
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    result = validate_bytes(args.input.name, args.category, args.input.read_bytes())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": result["status"], "detectedFormat": result["detectedFormat"], "errors": result["errors"], "output": str(args.output)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
