#!/usr/bin/env python3
"""Deterministic BM source extractor for DOCX, PDF and XLSX.

This is a technical-spike implementation, not the production parser. It uses
standard OOXML parsing plus Poppler text extraction to prove the source-block
contract and locator replay before model integration.
"""

from __future__ import annotations

import argparse
import csv
from datetime import datetime, timedelta
import hashlib
import json
import os
import posixpath
import re
import shutil
import struct
import subprocess
import tempfile
import time
import uuid
import zipfile
from pathlib import Path
from typing import Any, Iterable
from xml.etree import ElementTree as ET


PARSER_VERSION = "0.5.0"
BLOCK_NAMESPACE = uuid.UUID("70000000-0000-4000-8000-000000000001")
W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
S_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main"
A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
XDR_NS = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
C_NS = "http://schemas.openxmlformats.org/drawingml/2006/chart"


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def canonicalize(text: str) -> str:
    lines = [re.sub(r"[\t ]+", " ", line).strip() for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    return "\n".join(line for line in lines if line).strip()


def make_block(
    *,
    source_path: str,
    source_format: str,
    file_sha: str,
    block_type: str,
    locator: dict[str, Any],
    text: str,
    structured_data: Any = None,
    parser_name: str,
    confidence: float = 1.0,
    warnings: list[str] | None = None,
    classification: str = "project_content",
) -> dict[str, Any]:
    canonical_text = canonicalize(text)
    if not canonical_text:
        raise ValueError("source block text must not be empty")
    content_hash = sha256_bytes(canonical_text.encode("utf-8"))
    revision_id = str(uuid.uuid5(BLOCK_NAMESPACE, f"revision:{source_path}:{file_sha}"))
    identity = json.dumps(locator, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    block_id = str(uuid.uuid5(BLOCK_NAMESPACE, f"block:{revision_id}:{block_type}:{identity}:{content_hash}"))
    return {
        "schemaVersion": "1.0",
        "id": block_id,
        "fileRevisionId": revision_id,
        "sourcePath": source_path,
        "sourceFormat": source_format,
        "blockType": block_type,
        "locator": locator,
        "canonicalText": canonical_text,
        "structuredData": structured_data,
        "mediaArtifactId": None,
        "contentHash": content_hash,
        "parser": {"name": parser_name, "version": PARSER_VERSION},
        "confidence": confidence,
        "warnings": warnings or [],
        "classification": classification,
    }


def qn(namespace: str, tag: str) -> str:
    return f"{{{namespace}}}{tag}"


def xml_text(node: ET.Element) -> str:
    return "".join(item.text or "" for item in node.iter(qn(W_NS, "t")))


def extract_docx(path: Path, source_path: str, soffice: str | None = None, pdftotext: str | None = None) -> list[dict[str, Any]]:
    raw = path.read_bytes()
    file_sha = sha256_bytes(raw)
    blocks: list[dict[str, Any]] = []
    with zipfile.ZipFile(path) as archive:
        root = ET.fromstring(archive.read("word/document.xml"))
    body = root.find(qn(W_NS, "body"))
    if body is None:
        return blocks
    paragraph_index = 0
    table_index = 0
    for child in body:
        if child.tag == qn(W_NS, "p"):
            text = xml_text(child)
            if not canonicalize(text):
                continue
            paragraph_index += 1
            style_node = child.find(f"./{qn(W_NS, 'pPr')}/{qn(W_NS, 'pStyle')}")
            style_id = style_node.get(qn(W_NS, "val"), "") if style_node is not None else ""
            is_heading = style_id.lower().startswith("heading")
            blocks.append(make_block(
                source_path=source_path,
                source_format="docx",
                file_sha=file_sha,
                block_type="heading" if is_heading else "paragraph",
                locator={"page": None, "slide": None, "sheet": None, "cellRange": None, "paragraph": paragraph_index, "table": None, "row": None, "block": None, "shape": None, "bbox": None},
                text=text,
                structured_data={"styleId": style_id or None},
                parser_name="ooxml-docx-structure",
                warnings=["page_not_available_from_ooxml"]
            ))
        elif child.tag == qn(W_NS, "tbl"):
            table_index += 1
            rows = child.findall(f"./{qn(W_NS, 'tr')}")
            headers: list[str] = []
            for row_index, row in enumerate(rows, start=1):
                values = [canonicalize(xml_text(cell)) for cell in row.findall(f"./{qn(W_NS, 'tc')}")]
                if not any(values):
                    continue
                if row_index == 1:
                    headers = values
                structured = {"headers": headers, "cells": values}
                blocks.append(make_block(
                    source_path=source_path,
                    source_format="docx",
                    file_sha=file_sha,
                    block_type="table",
                    locator={"page": None, "slide": None, "sheet": None, "cellRange": None, "paragraph": None, "table": table_index, "row": row_index, "block": None, "shape": None, "bbox": None},
                    text="\t".join(values),
                    structured_data=structured,
                    parser_name="ooxml-docx-table",
                    warnings=["page_not_available_from_ooxml"]
                ))
    if soffice and pdftotext:
        map_docx_pages(blocks, path, soffice, pdftotext)
    return blocks


def find_soffice(explicit: str | None = None) -> str | None:
    candidates = [
        explicit,
        os.environ.get("PRODUCT_LIBREOFFICE_PATH"),
        shutil.which("soffice"),
        shutil.which("libreoffice"),
        "/Users/lining/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/soffice",
    ]
    return next((candidate for candidate in candidates if candidate and Path(candidate).is_file()), None)


def normalize_page_match(text: str) -> str:
    return re.sub(r"\s+", "", canonicalize(text)).casefold()


def map_docx_pages(blocks: list[dict[str, Any]], path: Path, soffice: str, pdftotext: str) -> None:
    """Map OOXML paragraph/table blocks to rendered PDF pages when text matches uniquely."""
    with tempfile.TemporaryDirectory(prefix="docx-page-map-") as temporary:
        temp_path = Path(temporary)
        profile = (temp_path / "lo-profile").as_uri()
        try:
            subprocess.run(
                [soffice, "--headless", f"-env:UserInstallation={profile}", "--convert-to", "pdf", "--outdir", str(temp_path), str(path)],
                check=True, capture_output=True, timeout=90,
            )
            pdf_path = temp_path / f"{path.stem}.pdf"
            if not pdf_path.is_file():
                raise FileNotFoundError("rendered PDF not found")
            rendered = subprocess.run([pdftotext, "-enc", "UTF-8", str(pdf_path), "-"], check=True, capture_output=True, timeout=30).stdout.decode("utf-8", errors="replace")
        except (OSError, subprocess.SubprocessError, FileNotFoundError):
            for block in blocks:
                block["warnings"] = [warning for warning in block["warnings"] if warning != "page_not_available_from_ooxml"] + ["page_mapping_unavailable"]
                block["structuredData"] = {**(block["structuredData"] or {}), "pageMapping": "unavailable"}
            return

    pages = [normalize_page_match(page) for page in rendered.split("\f")]
    for block in blocks:
        source_text = normalize_page_match(block["canonicalText"])
        candidates = [index for index, page_text in enumerate(pages, start=1) if source_text and source_text in page_text]
        method = "full_text"
        if not candidates and len(source_text) >= 40:
            prefix = source_text[:80]
            candidates = [index for index, page_text in enumerate(pages, start=1) if prefix in page_text]
            method = "text_prefix"
        if len(candidates) == 1:
            block["locator"]["page"] = candidates[0]
            block["warnings"] = [warning for warning in block["warnings"] if warning != "page_not_available_from_ooxml"]
            block["structuredData"] = {**(block["structuredData"] or {}), "pageMapping": method}
        elif len(candidates) > 1:
            block["warnings"].append("page_mapping_ambiguous")
            block["structuredData"] = {**(block["structuredData"] or {}), "pageMapping": "ambiguous"}
        else:
            block["warnings"].append("page_mapping_unmatched")
            block["structuredData"] = {**(block["structuredData"] or {}), "pageMapping": "unmatched"}


def find_pdftotext(explicit: str | None) -> str:
    candidates = [
        explicit,
        shutil.which("pdftotext"),
        "/Users/lining/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/poppler/bin/pdftotext",
        "/Users/lining/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/bin/pdftotext",
        "/Users/lining/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override/pdftotext",
        "pdftotext",
    ]
    for candidate in candidates:
        if not candidate:
            continue
        if Path(candidate).is_file():
            return candidate
    raise FileNotFoundError("pdftotext not found")


def extract_pdf(path: Path, source_path: str, pdftotext: str) -> list[dict[str, Any]]:
    raw = path.read_bytes()
    file_sha = sha256_bytes(raw)
    process = subprocess.run([pdftotext, "-bbox-layout", "-enc", "UTF-8", str(path), "-"], check=True, capture_output=True)
    root = ET.fromstring(process.stdout.decode("utf-8", errors="replace"))
    blocks: list[dict[str, Any]] = []
    xhtml_ns = "http://www.w3.org/1999/xhtml"
    pages = root.findall(f".//{qn(xhtml_ns, 'page')}")
    for page_index, page in enumerate(pages, start=1):
        page_width = float(page.get("width", "1"))
        page_height = float(page.get("height", "1"))
        page_block_count = 0
        for block_index, block in enumerate(page.findall(f".//{qn(xhtml_ns, 'block')}"), start=1):
            lines = []
            for line in block.findall(qn(xhtml_ns, "line")):
                words = [word.text or "" for word in line.findall(qn(xhtml_ns, "word"))]
                joined = ""
                for word in words:
                    if joined and joined[-1:].isascii() and joined[-1:].isalnum() and word[:1].isascii() and word[:1].isalnum():
                        joined += " "
                    joined += word
                if canonicalize(joined):
                    lines.append(joined)
            fragment = canonicalize("\n".join(lines))
            if not fragment:
                continue
            bbox = [
                round(float(block.get("xMin", "0")) / page_width, 6),
                round(float(block.get("yMin", "0")) / page_height, 6),
                round(float(block.get("xMax", "0")) / page_width, 6),
                round(float(block.get("yMax", "0")) / page_height, 6),
            ]
            blocks.append(make_block(
                source_path=source_path,
                source_format="pdf",
                file_sha=file_sha,
                block_type="page_region",
                locator={"page": page_index, "slide": None, "sheet": None, "cellRange": None, "paragraph": None, "table": None, "row": None, "block": block_index, "shape": None, "bbox": bbox},
                text=fragment,
                structured_data={"pageWidthPoints": page_width, "pageHeightPoints": page_height},
                parser_name="poppler-pdftotext-bbox-layout",
                warnings=[]
            ))
            page_block_count += 1
        if page_block_count == 0:
            block = make_block(
                source_path=source_path,
                source_format="pdf",
                file_sha=file_sha,
                block_type="page_region",
                locator={"page": page_index, "slide": None, "sheet": None, "cellRange": None, "paragraph": None, "table": None, "row": None, "block": 1, "shape": None, "bbox": [0, 0, 1, 1]},
                text=f"[scanned page] page {page_index}",
                structured_data={"pageWidthPoints": page_width, "pageHeightPoints": page_height, "nativeTextChars": 0},
                parser_name="poppler-pdftotext-bbox-layout",
                confidence=1.0,
                warnings=["ocr_required"],
            )
            block["mediaArtifactId"] = str(uuid.uuid5(BLOCK_NAMESPACE, f"media:{source_path}:{file_sha}:page:{page_index}"))
            blocks.append(block)
    return blocks


def column_number(address: str) -> int:
    match = re.match(r"([A-Z]+)", address.upper())
    if not match:
        return 0
    value = 0
    for char in match.group(1):
        value = value * 26 + ord(char) - 64
    return value


def shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    return ["".join(node.text or "" for node in item.iter(qn(S_NS, "t"))) for item in root.findall(qn(S_NS, "si"))]


def workbook_sheets(archive: zipfile.ZipFile) -> list[tuple[str, str]]:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    targets = {rel.get("Id"): rel.get("Target") for rel in rels.findall(qn(PKG_REL_NS, "Relationship"))}
    result: list[tuple[str, str]] = []
    sheets = workbook.find(qn(S_NS, "sheets"))
    if sheets is None:
        return result
    for sheet in sheets.findall(qn(S_NS, "sheet")):
        rel_id = sheet.get(qn(R_NS, "id"))
        target = targets.get(rel_id or "", "")
        if target.startswith("/"):
            target = target.lstrip("/")
        elif not target.startswith("xl/"):
            target = f"xl/{target}"
        result.append((sheet.get("name", "Sheet"), target))
    return result


def xlsx_number_formats(archive: zipfile.ZipFile) -> dict[int, str]:
    builtins = {14: "mm-dd-yy", 15: "d-mmm-yy", 16: "d-mmm", 17: "mmm-yy", 18: "h:mm AM/PM", 19: "h:mm:ss AM/PM", 20: "h:mm", 21: "h:mm:ss", 22: "m/d/yy h:mm"}
    root = ET.fromstring(archive.read("xl/styles.xml"))
    for item in root.findall(f"./{qn(S_NS, 'numFmts')}/{qn(S_NS, 'numFmt')}"):
        builtins[int(item.get("numFmtId", "0"))] = item.get("formatCode", "")
    result: dict[int, str] = {}
    cell_xfs = root.find(qn(S_NS, "cellXfs"))
    if cell_xfs is not None:
        for style_index, xf in enumerate(cell_xfs.findall(qn(S_NS, "xf"))):
            result[style_index] = builtins.get(int(xf.get("numFmtId", "0")), "General")
    return result


def is_date_format(number_format: str) -> bool:
    cleaned = re.sub(r'"[^"]*"|\\.|\[[^]]*\]', "", number_format.lower())
    return any(token in cleaned for token in ("yy", "dd", "mm", "m/", "/d"))


def cell_value(cell: ET.Element, strings: list[str], formats: dict[int, str]) -> tuple[str, str | None, dict[str, Any]]:
    cell_type = cell.get("t", "")
    style_index = int(cell.get("s", "0") or 0)
    number_format = formats.get(style_index, "General")
    formula_node = cell.find(qn(S_NS, "f"))
    formula = formula_node.text if formula_node is not None else None
    if cell_type == "inlineStr":
        inline = cell.find(qn(S_NS, "is"))
        value = "" if inline is None else "".join(node.text or "" for node in inline.iter(qn(S_NS, "t")))
        return value, formula, {"rawValue": value, "valueType": "string", "numberFormat": number_format, "displayValue": value}
    value_node = cell.find(qn(S_NS, "v"))
    raw = value_node.text if value_node is not None and value_node.text is not None else ""
    if cell_type == "s" and raw.isdigit():
        index = int(raw)
        value = strings[index] if index < len(strings) else raw
        return value, formula, {"rawValue": raw, "valueType": "string", "numberFormat": number_format, "displayValue": value}
    if cell_type == "b":
        value = "TRUE" if raw == "1" else "FALSE"
        return value, formula, {"rawValue": raw, "valueType": "boolean", "numberFormat": number_format, "displayValue": value}
    if raw and cell_type in {"", "n"} and is_date_format(number_format):
        value = (datetime(1899, 12, 30) + timedelta(days=float(raw))).date().isoformat()
        return value, formula, {"rawValue": raw, "valueType": "date", "numberFormat": number_format, "displayValue": value}
    value_type = "number" if raw and cell_type in {"", "n"} else "string"
    return raw, formula, {"rawValue": raw, "valueType": value_type, "numberFormat": number_format, "displayValue": raw}


def cell_parts(address: str) -> tuple[int, int]:
    match = re.match(r"([A-Z]+)(\d+)", address.upper())
    return (column_number(match.group(1)), int(match.group(2))) if match else (0, 0)


def column_letters(number: int) -> str:
    result = ""
    while number > 0:
        number, remainder = divmod(number - 1, 26)
        result = chr(65 + remainder) + result
    return result


def merged_ranges(root: ET.Element) -> list[dict[str, Any]]:
    result = []
    merge_cells = root.find(qn(S_NS, "mergeCells"))
    if merge_cells is None:
        return result
    for item in merge_cells.findall(qn(S_NS, "mergeCell")):
        ref = item.get("ref", "")
        start, end = ref.split(":") if ":" in ref else (ref, ref)
        start_col, start_row = cell_parts(start)
        end_col, end_row = cell_parts(end)
        result.append({"range": ref, "anchor": start, "startColumn": start_col, "endColumn": end_col, "startRow": start_row, "endRow": end_row})
    return result


def relationship_target(archive: zipfile.ZipFile, rel_path: str, rel_id: str, base_dir: str) -> str | None:
    if rel_path not in archive.namelist():
        return None
    rels = ET.fromstring(archive.read(rel_path))
    for rel in rels.findall(qn(PKG_REL_NS, "Relationship")):
        if rel.get("Id") == rel_id:
            target = rel.get("Target", "")
            return target.lstrip("/") if target.startswith("/") else posixpath.normpath(posixpath.join(base_dir, target))
    return None


def extract_xlsx_charts(archive: zipfile.ZipFile, sheet_root: ET.Element, sheet_target: str, sheet_name: str, source_path: str, file_sha: str) -> list[dict[str, Any]]:
    drawing = sheet_root.find(qn(S_NS, "drawing"))
    if drawing is None:
        return []
    sheet_rel_path = posixpath.join(posixpath.dirname(sheet_target), "_rels", posixpath.basename(sheet_target) + ".rels")
    drawing_path = relationship_target(archive, sheet_rel_path, drawing.get(qn(R_NS, "id"), ""), posixpath.dirname(sheet_target))
    if not drawing_path:
        return []
    drawing_root = ET.fromstring(archive.read(drawing_path))
    drawing_rel_path = posixpath.join(posixpath.dirname(drawing_path), "_rels", posixpath.basename(drawing_path) + ".rels")
    blocks = []
    for chart_index, anchor in enumerate(list(drawing_root), start=1):
        chart_ref = anchor.find(f".//{qn(C_NS, 'chart')}")
        if chart_ref is None:
            continue
        chart_path = relationship_target(archive, drawing_rel_path, chart_ref.get(qn(R_NS, "id"), ""), posixpath.dirname(drawing_path))
        if not chart_path:
            continue
        chart_root = ET.fromstring(archive.read(chart_path))
        title = canonicalize("".join(node.text or "" for node in chart_root.findall(f".//{qn(A_NS, 't')}")))
        plot_area = chart_root.find(f".//{qn(C_NS, 'plotArea')}")
        chart_type = "unknown"
        if plot_area is not None:
            for child in plot_area:
                if child.tag.startswith("{" + C_NS + "}") and child.tag.endswith("Chart"):
                    chart_type = child.tag.split("}", 1)[1]
                    break
        formulas = [node.text or "" for node in chart_root.findall(f".//{qn(C_NS, 'f')}") if node.text]
        from_node, to_node = anchor.find(qn(XDR_NS, "from")), anchor.find(qn(XDR_NS, "to"))
        cell_range = None
        if from_node is not None and to_node is not None:
            fc = int(from_node.findtext(qn(XDR_NS, "col"), "0")) + 1
            fr = int(from_node.findtext(qn(XDR_NS, "row"), "0")) + 1
            tc = int(to_node.findtext(qn(XDR_NS, "col"), "0")) + 1
            tr = int(to_node.findtext(qn(XDR_NS, "row"), "0")) + 1
            cell_range = f"{column_letters(fc)}{fr}:{column_letters(tc)}{tr}"
        text = title or f"{chart_type} chart"
        if formulas:
            text += "\n" + "\n".join(formulas)
        blocks.append(make_block(source_path=source_path, source_format="xlsx", file_sha=file_sha, block_type="chart", locator={"page": None, "slide": None, "sheet": sheet_name, "cellRange": cell_range, "paragraph": None, "table": None, "row": None, "block": None, "shape": chart_index, "bbox": None}, text=text, structured_data={"title": title or None, "chartType": chart_type, "seriesFormulas": formulas, "drawingPath": drawing_path, "chartPath": chart_path}, parser_name="ooxml-xlsx-chart", warnings=[]))
    return blocks


def extract_xlsx_rules(root: ET.Element, sheet_name: str, source_path: str, file_sha: str) -> list[dict[str, Any]]:
    """Preserve worksheet input constraints and formatting rules as traceable blocks."""
    blocks: list[dict[str, Any]] = []
    validations = root.find(qn(S_NS, "dataValidations"))
    if validations is not None:
        for index, rule in enumerate(validations.findall(qn(S_NS, "dataValidation")), start=1):
            rule_data = {
                "type": rule.get("type"),
                "operator": rule.get("operator"),
                "allowBlank": rule.get("allowBlank") == "1",
                "showInputMessage": rule.get("showInputMessage") == "1",
                "showErrorMessage": rule.get("showErrorMessage") == "1",
                "promptTitle": rule.get("promptTitle"),
                "prompt": rule.get("prompt"),
                "errorTitle": rule.get("errorTitle"),
                "error": rule.get("error"),
                "formula1": rule.findtext(qn(S_NS, "formula1")),
                "formula2": rule.findtext(qn(S_NS, "formula2")),
            }
            cell_range = rule.get("sqref", "")
            description = f"Data validation for {cell_range}: " + json.dumps(rule_data, ensure_ascii=False, sort_keys=True)
            blocks.append(make_block(
                source_path=source_path, source_format="xlsx", file_sha=file_sha,
                block_type="template_element",
                locator={"page": None, "slide": None, "sheet": sheet_name, "cellRange": cell_range or None, "paragraph": None, "table": None, "row": None, "block": None, "shape": index, "bbox": None},
                text=description, structured_data={"elementType": "data_validation", **rule_data},
                parser_name="ooxml-xlsx-validation", warnings=[],
            ))

    for index, formatting in enumerate(root.findall(qn(S_NS, "conditionalFormatting")), start=1):
        rules = []
        for rule in formatting.findall(qn(S_NS, "cfRule")):
            rules.append({
                "type": rule.get("type"),
                "priority": int(rule.get("priority", "0") or 0),
                "stopIfTrue": rule.get("stopIfTrue") == "1",
                "operator": rule.get("operator"),
                "formulas": [formula.text or "" for formula in rule.findall(qn(S_NS, "formula"))],
                "styleId": rule.get("dxfId"),
            })
        cell_range = formatting.get("sqref", "")
        description = f"Conditional formatting for {cell_range}: " + json.dumps(rules, ensure_ascii=False, sort_keys=True)
        blocks.append(make_block(
            source_path=source_path, source_format="xlsx", file_sha=file_sha,
            block_type="template_element",
            locator={"page": None, "slide": None, "sheet": sheet_name, "cellRange": cell_range or None, "paragraph": None, "table": None, "row": None, "block": None, "shape": index, "bbox": None},
            text=description, structured_data={"elementType": "conditional_formatting", "rules": rules},
            parser_name="ooxml-xlsx-conditional-formatting", warnings=[],
        ))
    return blocks


def extract_xlsx_pivots(archive: zipfile.ZipFile, sheet_root: ET.Element, sheet_target: str, sheet_name: str, source_path: str, file_sha: str) -> list[dict[str, Any]]:
    """Extract pivot layout and cache-source metadata without expanding cached values."""
    sheet_rel_path = posixpath.join(posixpath.dirname(sheet_target), "_rels", posixpath.basename(sheet_target) + ".rels")
    if sheet_rel_path not in archive.namelist():
        return []
    sheet_rels = ET.fromstring(archive.read(sheet_rel_path))
    pivot_targets = [
        relationship_target(archive, sheet_rel_path, rel.get("Id", ""), posixpath.dirname(sheet_target))
        for rel in sheet_rels.findall(qn(PKG_REL_NS, "Relationship"))
        if rel.get("Type", "").endswith("/pivotTable")
    ]
    blocks = []
    for index, pivot_path in enumerate((item for item in pivot_targets if item), start=1):
        if pivot_path not in archive.namelist():
            continue
        pivot = ET.fromstring(archive.read(pivot_path))
        location = pivot.find(qn(S_NS, "location"))
        cell_range = location.get("ref", "") if location is not None else ""
        metadata: dict[str, Any] = {
            "elementType": "pivot_table",
            "name": pivot.get("name"),
            "cacheId": pivot.get("cacheId"),
            "cellRange": cell_range or None,
            "sourceSheet": None,
            "sourceRange": None,
            "sourceTable": None,
            "rowFields": [],
            "columnFields": [],
            "pageFields": [],
            "dataFields": [],
        }
        pivot_rel_path = posixpath.join(posixpath.dirname(pivot_path), "_rels", posixpath.basename(pivot_path) + ".rels")
        if pivot_rel_path in archive.namelist():
            pivot_rels = ET.fromstring(archive.read(pivot_rel_path))
            cache_path = next((
                relationship_target(archive, pivot_rel_path, rel.get("Id", ""), posixpath.dirname(pivot_path))
                for rel in pivot_rels.findall(qn(PKG_REL_NS, "Relationship"))
                if rel.get("Type", "").endswith("/pivotCacheDefinition")
            ), None)
            if cache_path and cache_path in archive.namelist():
                cache = ET.fromstring(archive.read(cache_path))
                cache_fields = cache.find(qn(S_NS, "cacheFields"))
                field_names = [field.get("name", f"Field {i + 1}") for i, field in enumerate(cache_fields.findall(qn(S_NS, "cacheField")))] if cache_fields is not None else []
                source = cache.find(f"{qn(S_NS, 'cacheSource')}/{qn(S_NS, 'worksheetSource')}")
                if source is not None:
                    metadata["sourceSheet"] = source.get("sheet")
                    metadata["sourceRange"] = source.get("ref")
                    metadata["sourceTable"] = source.get("name")
                pivot_fields = pivot.find(qn(S_NS, "pivotFields"))
                axes = []
                if pivot_fields is not None:
                    axes = [field.get("axis") for field in pivot_fields.findall(qn(S_NS, "pivotField"))]

                def names_for(container_name: str, axis: str | None = None, index_attribute: str = "x") -> list[str]:
                    container = pivot.find(qn(S_NS, container_name))
                    if container is None:
                        return []
                    result = []
                    for field in container:
                        try:
                            field_index = int(field.get(index_attribute, "-1"))
                        except ValueError:
                            continue
                        if 0 <= field_index < len(field_names) and (axis is None or field_index < len(axes) and axes[field_index] == axis):
                            result.append(field_names[field_index])
                    return result

                metadata["rowFields"] = names_for("rowFields", "axisRow")
                metadata["columnFields"] = names_for("colFields", "axisCol")
                metadata["pageFields"] = names_for("pageFields", index_attribute="fld")
                data_fields = pivot.find(qn(S_NS, "dataFields"))
                if data_fields is not None:
                    for field in data_fields.findall(qn(S_NS, "dataField")):
                        try:
                            field_index = int(field.get("fld", "-1"))
                        except ValueError:
                            continue
                        metadata["dataFields"].append({
                            "name": field.get("name") or (field_names[field_index] if 0 <= field_index < len(field_names) else None),
                            "sourceField": field_names[field_index] if 0 <= field_index < len(field_names) else None,
                            "aggregation": field.get("subtotal"),
                        })
        summary = f"Pivot table {metadata['name'] or index} at {cell_range or 'unknown range'}: " + json.dumps(metadata, ensure_ascii=False, sort_keys=True)
        blocks.append(make_block(
            source_path=source_path, source_format="xlsx", file_sha=file_sha,
            block_type="template_element",
            locator={"page": None, "slide": None, "sheet": sheet_name, "cellRange": cell_range or None, "paragraph": None, "table": None, "row": None, "block": None, "shape": index, "bbox": None},
            text=summary, structured_data=metadata,
            parser_name="ooxml-xlsx-pivot", warnings=[],
        ))
    return blocks


def extract_xlsx(path: Path, source_path: str) -> list[dict[str, Any]]:
    raw = path.read_bytes()
    file_sha = sha256_bytes(raw)
    blocks: list[dict[str, Any]] = []
    with zipfile.ZipFile(path) as archive:
        strings = shared_strings(archive)
        formats = xlsx_number_formats(archive)
        for sheet_name, target in workbook_sheets(archive):
            root = ET.fromstring(archive.read(target))
            merges = merged_ranges(root)
            blocks.extend(extract_xlsx_rules(root, sheet_name, source_path, file_sha))
            blocks.extend(extract_xlsx_pivots(archive, root, target, sheet_name, source_path, file_sha))
            sheet_data = root.find(qn(S_NS, "sheetData"))
            if sheet_data is None:
                continue
            for row in sheet_data.findall(qn(S_NS, "row")):
                row_index = int(row.get("r", "0") or 0)
                cells = []
                for cell in row.findall(qn(S_NS, "c")):
                    address = cell.get("r", "")
                    value, formula, metadata = cell_value(cell, strings, formats)
                    col, row_number = cell_parts(address)
                    containing_merge = next((item for item in merges if item["startColumn"] <= col <= item["endColumn"] and item["startRow"] <= row_number <= item["endRow"]), None)
                    if containing_merge and address != containing_merge["anchor"]:
                        continue
                    if value or formula:
                        cells.append({"address": address, "value": value, "formula": formula, **metadata})
                if not cells:
                    continue
                cells.sort(key=lambda item: column_number(item["address"]))
                cell_range = f"{cells[0]['address']}:{cells[-1]['address']}"
                text = "\t".join(item["value"] or (f"={item['formula']}" if item["formula"] else "") for item in cells)
                blocks.append(make_block(
                    source_path=source_path,
                    source_format="xlsx",
                    file_sha=file_sha,
                    block_type="cell_range",
                    locator={"page": None, "slide": None, "sheet": sheet_name, "cellRange": cell_range, "paragraph": None, "table": None, "row": row_index, "block": None, "shape": None, "bbox": None},
                    text=text,
                    structured_data={"cells": cells, "mergedRanges": [item["range"] for item in merges if item["startRow"] <= row_index <= item["endRow"]]},
                    parser_name="ooxml-xlsx-structure",
                    warnings=[]
                ))
            blocks.extend(extract_xlsx_charts(archive, root, target, sheet_name, source_path, file_sha))
    return blocks


def image_dimensions(raw: bytes, suffix: str) -> tuple[int, int]:
    if suffix == ".png" and raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return struct.unpack(">II", raw[16:24])
    if suffix in {".jpg", ".jpeg"} and raw.startswith(b"\xff\xd8"):
        offset = 2
        while offset + 9 < len(raw):
            if raw[offset] != 0xFF:
                offset += 1
                continue
            marker = raw[offset + 1]
            if marker in {0xD8, 0xD9}:
                offset += 2
                continue
            length = struct.unpack(">H", raw[offset + 2:offset + 4])[0]
            if marker in {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}:
                height, width = struct.unpack(">HH", raw[offset + 5:offset + 9])
                return width, height
            offset += 2 + length
    if suffix == ".webp" and raw.startswith(b"RIFF") and raw[8:12] == b"WEBP":
        chunk = raw[12:16]
        if chunk == b"VP8X" and len(raw) >= 30:
            return int.from_bytes(raw[24:27], "little") + 1, int.from_bytes(raw[27:30], "little") + 1
        if chunk == b"VP8 " and len(raw) >= 30 and raw[23:26] == b"\x9d\x01\x2a":
            return int.from_bytes(raw[26:28], "little") & 0x3FFF, int.from_bytes(raw[28:30], "little") & 0x3FFF
        if chunk == b"VP8L" and len(raw) >= 25 and raw[20] == 0x2F:
            bits = int.from_bytes(raw[21:25], "little")
            return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
    raise ValueError(f"unsupported or corrupt image: {suffix}")


def extract_image(path: Path, source_path: str) -> list[dict[str, Any]]:
    raw = path.read_bytes()
    file_sha = sha256_bytes(raw)
    width, height = image_dimensions(raw, path.suffix.lower())
    block = make_block(
        source_path=source_path,
        source_format="image",
        file_sha=file_sha,
        block_type="image",
        locator={"page": None, "slide": None, "sheet": None, "cellRange": None, "paragraph": None, "table": None, "row": None, "block": 1, "shape": None, "bbox": [0, 0, 1, 1]},
        text=f"[image] {path.name} ({width}x{height})",
        structured_data={"width": width, "height": height, "mimeType": {".png": "image/png", ".webp": "image/webp"}.get(path.suffix.lower(), "image/jpeg")},
        parser_name="image-binary-metadata",
        confidence=1.0,
        warnings=["visual_content_not_analyzed"],
    )
    block["mediaArtifactId"] = str(uuid.uuid5(BLOCK_NAMESPACE, f"media:{source_path}:{file_sha}"))
    return [block]


def extract_text_file(path: Path, source_path: str) -> list[dict[str, Any]]:
    raw = path.read_bytes()
    text = raw.decode("utf-8-sig")
    file_sha = sha256_bytes(raw)
    suffix = path.suffix.lower()
    blocks: list[dict[str, Any]] = []
    if suffix == ".csv":
        for row_index, values in enumerate(csv.reader(text.splitlines()), start=1):
            if not any(value.strip() for value in values):
                continue
            blocks.append(make_block(source_path=source_path, source_format="csv", file_sha=file_sha, block_type="table",
                locator={"page": None, "slide": None, "sheet": "CSV", "cellRange": f"A{row_index}:{column_letters(max(1, len(values)))}{row_index}", "paragraph": None, "table": 1, "row": row_index, "block": None, "shape": None, "bbox": None},
                text="\t".join(values), structured_data={"cells": values}, parser_name="python-csv"))
        return blocks
    if suffix == ".json":
        value = json.loads(text)
        entries = value.items() if isinstance(value, dict) else enumerate(value) if isinstance(value, list) else [("value", value)]
        for index, (key, item) in enumerate(entries, start=1):
            rendered = json.dumps(item, ensure_ascii=False, sort_keys=True) if not isinstance(item, str) else item
            blocks.append(make_block(source_path=source_path, source_format="json", file_sha=file_sha, block_type="structured_record",
                locator={"page": None, "slide": None, "sheet": None, "cellRange": None, "paragraph": None, "table": None, "row": None, "block": index, "shape": None, "bbox": None, "jsonPath": f"$.{key}"},
                text=f"{key}: {rendered}", structured_data={"key": str(key), "value": item}, parser_name="python-json"))
        return blocks
    paragraphs = [item for item in re.split(r"\n\s*\n", text) if canonicalize(item)]
    for index, paragraph in enumerate(paragraphs, start=1):
        blocks.append(make_block(source_path=source_path, source_format="txt", file_sha=file_sha, block_type="paragraph",
            locator={"page": None, "slide": None, "sheet": None, "cellRange": None, "paragraph": index, "table": None, "row": None, "block": None, "shape": None, "bbox": None},
            text=paragraph, parser_name="utf8-text"))
    return blocks


def pptx_slide_paths(archive: zipfile.ZipFile) -> list[str]:
    presentation = ET.fromstring(archive.read("ppt/presentation.xml"))
    rels = ET.fromstring(archive.read("ppt/_rels/presentation.xml.rels"))
    targets = {rel.get("Id"): rel.get("Target") for rel in rels.findall(qn(PKG_REL_NS, "Relationship"))}
    slide_list = presentation.find(qn(P_NS, "sldIdLst"))
    if slide_list is None:
        return []
    paths = []
    for slide_id in slide_list.findall(qn(P_NS, "sldId")):
        target = targets.get(slide_id.get(qn(R_NS, "id"), ""), "")
        if target.startswith("/"):
            paths.append(target.lstrip("/"))
        else:
            paths.append(posixpath.normpath(posixpath.join("ppt", target)))
    return paths


def pptx_slide_size(archive: zipfile.ZipFile) -> tuple[int, int]:
    presentation = ET.fromstring(archive.read("ppt/presentation.xml"))
    size = presentation.find(qn(P_NS, "sldSz"))
    return (int(size.get("cx", "1")), int(size.get("cy", "1"))) if size is not None else (1, 1)


def pptx_bbox(node: ET.Element, slide_size: tuple[int, int]) -> list[float] | None:
    transform = node.find(f".//{qn(P_NS, 'xfrm')}")
    if transform is None:
        transform = node.find(f".//{qn(A_NS, 'xfrm')}")
    if transform is None:
        return None
    offset = transform.find(qn(A_NS, "off"))
    extent = transform.find(qn(A_NS, "ext"))
    if offset is None or extent is None:
        return None
    width, height = slide_size
    x, y = int(offset.get("x", "0")), int(offset.get("y", "0"))
    cx, cy = int(extent.get("cx", "0")), int(extent.get("cy", "0"))
    return [round(x / width, 6), round(y / height, 6), round((x + cx) / width, 6), round((y + cy) / height, 6)]


def pptx_text(node: ET.Element) -> str:
    paragraphs = []
    for paragraph in node.findall(f".//{qn(A_NS, 'p')}"):
        text = "".join(item.text or "" for item in paragraph.iter(qn(A_NS, "t")))
        if canonicalize(text):
            paragraphs.append(text)
    return "\n".join(paragraphs)


def pptx_related_part(archive: zipfile.ZipFile, source_path: str, relationship_suffix: str) -> str | None:
    rel_path = posixpath.join(posixpath.dirname(source_path), "_rels", posixpath.basename(source_path) + ".rels")
    if rel_path not in archive.namelist():
        return None
    rels = ET.fromstring(archive.read(rel_path))
    rel = next((item for item in rels.findall(qn(PKG_REL_NS, "Relationship")) if item.get("Type", "").endswith(relationship_suffix)), None)
    if rel is None:
        return None
    return relationship_target(archive, rel_path, rel.get("Id", ""), posixpath.dirname(source_path))


def pptx_theme_tokens(archive: zipfile.ZipFile, theme_path: str | None) -> dict[str, Any]:
    if not theme_path or theme_path not in archive.namelist():
        return {"colors": {}, "fonts": {}}
    theme = ET.fromstring(archive.read(theme_path))
    elements = theme.find(f".//{qn(A_NS, 'themeElements')}")
    colors: dict[str, str] = {}
    color_scheme = elements.find(qn(A_NS, "clrScheme")) if elements is not None else None
    if color_scheme is not None:
        for slot in color_scheme:
            color = next(iter(slot), None)
            if color is None:
                continue
            colors[slot.tag.split("}", 1)[-1]] = color.get("val") or color.get("lastClr") or ""
    fonts: dict[str, Any] = {}
    font_scheme = elements.find(qn(A_NS, "fontScheme")) if elements is not None else None
    if font_scheme is not None:
        for role in ("majorFont", "minorFont"):
            group = font_scheme.find(qn(A_NS, role))
            if group is not None:
                latin = group.find(qn(A_NS, "latin"))
                east_asian = group.find(qn(A_NS, "ea"))
                fonts[role] = {
                    "latin": latin.get("typeface", "") if latin is not None else "",
                    "eastAsian": east_asian.get("typeface", "") if east_asian is not None else "",
                }
    return {"colors": colors, "fonts": fonts}


def pptx_placeholder_defaults(archive: zipfile.ZipFile, part_path: str | None, slide_size: tuple[int, int]) -> list[dict[str, Any]]:
    if not part_path or part_path not in archive.namelist():
        return []
    root = ET.fromstring(archive.read(part_path))
    shape_tree = root.find(f".//{qn(P_NS, 'spTree')}")
    if shape_tree is None:
        return []
    placeholders = []
    for shape in shape_tree.findall(qn(P_NS, "sp")):
        placeholder = shape.find(f"./{qn(P_NS, 'nvSpPr')}/{qn(P_NS, 'nvPr')}/{qn(P_NS, 'ph')}")
        if placeholder is None:
            continue
        properties = shape.find(f"./{qn(P_NS, 'nvSpPr')}/{qn(P_NS, 'cNvPr')}")
        style = shape.find(qn(P_NS, "style"))
        style_refs = {}
        if style is not None:
            for ref in style:
                style_refs[ref.tag.split("}", 1)[-1]] = {key: ref.get(key) for key in ("idx", "typeface") if ref.get(key) is not None}
                scheme = ref.find(f".//{qn(A_NS, 'schemeClr')}")
                if scheme is not None:
                    style_refs[ref.tag.split("}", 1)[-1]]["schemeColor"] = scheme.get("val")
        placeholders.append({
            "type": placeholder.get("type", "obj"),
            "index": placeholder.get("idx"),
            "name": properties.get("name") if properties is not None else None,
            "bbox": pptx_bbox(shape, slide_size),
            "styleReferences": style_refs,
        })
    return placeholders


def pptx_slide_design(archive: zipfile.ZipFile, slide_path: str, slide_size: tuple[int, int]) -> dict[str, Any]:
    layout_path = pptx_related_part(archive, slide_path, "/slideLayout")
    master_path = pptx_related_part(archive, layout_path, "/slideMaster") if layout_path else None
    theme_path = pptx_related_part(archive, master_path, "/theme") if master_path else None
    return {
        "slideLayout": layout_path,
        "slideMaster": master_path,
        "theme": theme_path,
        "themeTokens": pptx_theme_tokens(archive, theme_path),
        "layoutPlaceholders": pptx_placeholder_defaults(archive, layout_path, slide_size),
        "masterPlaceholders": pptx_placeholder_defaults(archive, master_path, slide_size),
    }


def extract_pptx(path: Path, source_path: str, classification: str) -> list[dict[str, Any]]:
    raw = path.read_bytes()
    file_sha = sha256_bytes(raw)
    blocks: list[dict[str, Any]] = []
    with zipfile.ZipFile(path) as archive:
        slide_size = pptx_slide_size(archive)
        for slide_index, slide_path in enumerate(pptx_slide_paths(archive), start=1):
            root = ET.fromstring(archive.read(slide_path))
            design = pptx_slide_design(archive, slide_path, slide_size)
            if design["slideLayout"] or design["slideMaster"] or design["themeTokens"]["colors"] or design["themeTokens"]["fonts"]:
                description = f"Slide {slide_index} layout, master and theme design tokens: " + json.dumps(design, ensure_ascii=False, sort_keys=True)
                blocks.append(make_block(
                    source_path=source_path, source_format="pptx", file_sha=file_sha,
                    block_type="template_element",
                    locator={"page": None, "slide": slide_index, "sheet": None, "cellRange": None, "paragraph": None, "table": None, "row": None, "block": None, "shape": 0, "bbox": None},
                    text=description, structured_data={"elementType": "slide_design_inheritance", **design},
                    parser_name="ooxml-pptx-design", warnings=[], classification=classification,
                ))
            rel_path = str(Path(slide_path).parent / "_rels" / (Path(slide_path).name + ".rels"))
            rel_targets: dict[str, str] = {}
            if rel_path in archive.namelist():
                rels = ET.fromstring(archive.read(rel_path))
                rel_targets = {rel.get("Id"): rel.get("Target", "") for rel in rels.findall(qn(PKG_REL_NS, "Relationship"))}
            shape_tree = root.find(f"./{qn(P_NS, 'cSld')}/{qn(P_NS, 'spTree')}")
            if shape_tree is None:
                continue
            shape_index = 0
            for node in shape_tree:
                if node.tag not in {qn(P_NS, "sp"), qn(P_NS, "graphicFrame"), qn(P_NS, "pic")}:
                    continue
                shape_index += 1
                bbox = pptx_bbox(node, slide_size)
                locator = {"page": None, "slide": slide_index, "sheet": None, "cellRange": None, "paragraph": None, "table": None, "row": None, "block": None, "shape": shape_index, "bbox": bbox}
                if node.tag == qn(P_NS, "pic"):
                    metadata = node.find(f"./{qn(P_NS, 'nvPicPr')}/{qn(P_NS, 'cNvPr')}")
                    blip = node.find(f".//{qn(A_NS, 'blip')}")
                    rel_id = blip.get(qn(R_NS, "embed"), "") if blip is not None else ""
                    target = rel_targets.get(rel_id, "")
                    label = metadata.get("descr") or metadata.get("name") if metadata is not None else "slide image"
                    block = make_block(source_path=source_path, source_format="pptx", file_sha=file_sha, block_type="image", locator=locator, text=f"[slide image] {label}", structured_data={"relationshipId": rel_id or None, "target": target or None}, parser_name="ooxml-pptx-structure", warnings=["visual_content_not_analyzed"], classification=classification)
                    block["mediaArtifactId"] = str(uuid.uuid5(BLOCK_NAMESPACE, f"media:{source_path}:{file_sha}:{slide_index}:{shape_index}:{target}"))
                    blocks.append(block)
                    continue
                table_node = node.find(f".//{qn(A_NS, 'tbl')}")
                if table_node is not None:
                    for row_index, row in enumerate(table_node.findall(qn(A_NS, "tr")), start=1):
                        cells = [canonicalize(pptx_text(cell)) for cell in row.findall(qn(A_NS, "tc"))]
                        if not any(cells):
                            continue
                        table_locator = dict(locator, table=shape_index, row=row_index)
                        blocks.append(make_block(source_path=source_path, source_format="pptx", file_sha=file_sha, block_type="table", locator=table_locator, text="\t".join(cells), structured_data={"cells": cells}, parser_name="ooxml-pptx-table", warnings=[] if bbox else ["bbox_not_available"], classification=classification))
                    continue
                text = pptx_text(node)
                if text:
                    placeholder = node.find(f"./{qn(P_NS, 'nvSpPr')}/{qn(P_NS, 'nvPr')}/{qn(P_NS, 'ph')}")
                    placeholder_type = placeholder.get("type", "") if placeholder is not None else ""
                    blocks.append(make_block(source_path=source_path, source_format="pptx", file_sha=file_sha, block_type="heading" if placeholder_type in {"title", "ctrTitle"} else "shape", locator=locator, text=text, structured_data={"placeholderType": placeholder_type or None}, parser_name="ooxml-pptx-structure", warnings=[] if bbox else ["bbox_not_available"], classification=classification))
    return blocks


def iter_supported(input_path: Path) -> Iterable[Path]:
    if input_path.is_file():
        yield input_path
        return
    for path in sorted(input_path.rglob("*")):
        if path.is_file() and path.suffix.lower() in {".docx", ".pdf", ".xlsx", ".pptx", ".png", ".jpg", ".jpeg", ".webp", ".txt", ".csv", ".json"}:
            yield path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--base", type=Path, help="Base directory used for stable sourcePath values")
    parser.add_argument("--pdftotext")
    parser.add_argument("--soffice", help="LibreOffice executable used for optional DOCX page mapping")
    parser.add_argument("--pptx-classification", choices=["project_content", "template_style"], default="project_content")
    args = parser.parse_args()
    start = time.perf_counter()
    pdftotext = find_pdftotext(args.pdftotext)
    soffice = find_soffice(args.soffice)
    blocks: list[dict[str, Any]] = []
    for path in iter_supported(args.input):
        source_path = str(path.relative_to(args.base)) if args.base else path.name
        suffix = path.suffix.lower()
        if suffix == ".docx":
            blocks.extend(extract_docx(path, source_path, soffice, pdftotext))
        elif suffix == ".pdf":
            blocks.extend(extract_pdf(path, source_path, pdftotext))
        elif suffix == ".xlsx":
            blocks.extend(extract_xlsx(path, source_path))
        elif suffix == ".pptx":
            blocks.extend(extract_pptx(path, source_path, args.pptx_classification))
        elif suffix in {".png", ".jpg", ".jpeg", ".webp"}:
            blocks.extend(extract_image(path, source_path))
        elif suffix in {".txt", ".csv", ".json"}:
            blocks.extend(extract_text_file(path, source_path))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("\n".join(json.dumps(block, ensure_ascii=False, sort_keys=True) for block in blocks) + "\n", encoding="utf-8")
    counts: dict[str, int] = {}
    for block in blocks:
        counts[block["sourceFormat"]] = counts.get(block["sourceFormat"], 0) + 1
    print(json.dumps({"files": len(list(iter_supported(args.input))), "blocks": len(blocks), "byFormat": counts, "elapsedMs": round((time.perf_counter() - start) * 1000, 2), "output": str(args.output)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
