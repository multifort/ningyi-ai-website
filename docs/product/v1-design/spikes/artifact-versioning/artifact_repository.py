#!/usr/bin/env python3
"""Deterministic content, render, template, and package version registry."""

from __future__ import annotations

import hashlib
import json
import uuid
from typing import Any


NAMESPACE = uuid.UUID("70000000-0000-4000-8000-000000000005")


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def stable_id(*parts: Any) -> str:
    return str(uuid.uuid5(NAMESPACE, ":".join(str(part) for part in parts)))


def create_repository(project_id: str) -> dict[str, Any]:
    return {"schemaVersion": "1.0", "projectId": project_id, "activePublishedContentVersionId": None, "contentVersions": [], "templateVersions": [], "renderVersions": [], "packages": []}


def add_content_candidate(repository: dict[str, Any], run_id: str, semantic_manifest: dict[str, str]) -> dict[str, Any]:
    if not semantic_manifest or any(len(value) != 64 for value in semantic_manifest.values()):
        raise ValueError("semantic manifest requires sha256 values")
    version_no = len(repository["contentVersions"]) + 1
    manifest_hash = digest(canonical_bytes(semantic_manifest))
    parent = repository["activePublishedContentVersionId"]
    item = {"id": stable_id(repository["projectId"], "content", version_no, manifest_hash), "versionNo": version_no, "parentVersionId": parent, "status": "candidate", "runId": run_id, "semanticManifest": semantic_manifest, "manifestHash": manifest_hash}
    repository["contentVersions"].append(item)
    return item


def publish_content(repository: dict[str, Any], content_version_id: str) -> None:
    target = find(repository["contentVersions"], content_version_id)
    if target["status"] != "candidate":
        raise ValueError("only candidate content can be published")
    active_id = repository["activePublishedContentVersionId"]
    if active_id:
        find(repository["contentVersions"], active_id)["status"] = "archived"
    target["status"] = "published"
    repository["activePublishedContentVersionId"] = target["id"]


def rollback_content(repository: dict[str, Any], content_version_id: str) -> None:
    target = find(repository["contentVersions"], content_version_id)
    if target["status"] not in {"published", "archived"}:
        raise ValueError("rollback target must have been published")
    active_id = repository["activePublishedContentVersionId"]
    if active_id and active_id != target["id"]:
        find(repository["contentVersions"], active_id)["status"] = "archived"
    target["status"] = "published"
    repository["activePublishedContentVersionId"] = target["id"]


def add_template(repository: dict[str, Any], template_key: str, content: bytes) -> dict[str, Any]:
    version_no = 1 + sum(item["templateKey"] == template_key for item in repository["templateVersions"])
    content_hash = digest(content)
    item = {"id": stable_id(repository["projectId"], "template", template_key, version_no, content_hash), "templateKey": template_key, "versionNo": version_no, "contentHash": content_hash}
    repository["templateVersions"].append(item)
    return item


def add_render_version(repository: dict[str, Any], content_version_id: str, template_version_id: str, renderer_version: str, files: list[dict[str, Any]]) -> dict[str, Any]:
    find(repository["contentVersions"], content_version_id)
    find(repository["templateVersions"], template_version_id)
    render_no = 1 + sum(item["contentVersionId"] == content_version_id for item in repository["renderVersions"])
    artifacts = []
    for file in files:
        sha256 = digest(file["content"])
        artifact_id = stable_id(content_version_id, render_no, file["deliverable"], file["format"], sha256, file["visibility"])
        artifacts.append({"id": artifact_id, "deliverable": file["deliverable"], "format": file["format"], "objectKey": file["objectKey"], "sha256": sha256, "sizeBytes": len(file["content"]), "visibility": file["visibility"]})
    item = {"id": stable_id(content_version_id, "render", render_no, template_version_id, renderer_version), "contentVersionId": content_version_id, "renderNo": render_no, "templateVersionId": template_version_id, "rendererVersion": renderer_version, "modelCalls": 0, "status": "available", "artifacts": artifacts}
    repository["renderVersions"].append(item)
    return item


def create_package(repository: dict[str, Any], content_version_id: str, package_type: str, artifact_ids: list[str]) -> dict[str, Any]:
    if package_type not in {"client", "internal", "archive"}:
        raise ValueError("unknown package type")
    available = {artifact["id"]: artifact for render in repository["renderVersions"] if render["contentVersionId"] == content_version_id and render["status"] == "available" for artifact in render["artifacts"]}
    missing = set(artifact_ids) - set(available)
    if missing:
        raise ValueError(f"artifacts are missing or belong to another content version: {sorted(missing)}")
    selected = [available[artifact_id] for artifact_id in dict.fromkeys(artifact_ids)]
    if package_type == "client":
        selected = [artifact for artifact in selected if artifact["visibility"] in {"client", "both"}]
    if not selected:
        raise ValueError("package has no visible artifacts")
    ids = [artifact["id"] for artifact in selected]
    manifest = [{"id": artifact["id"], "sha256": artifact["sha256"], "objectKey": artifact["objectKey"]} for artifact in selected]
    manifest_hash = digest(canonical_bytes(manifest))
    item = {"id": stable_id(content_version_id, "package", package_type, manifest_hash), "contentVersionId": content_version_id, "packageType": package_type, "artifactIds": ids, "manifestHash": manifest_hash, "modelCalls": 0, "status": "available"}
    repository["packages"].append(item)
    return item


def find(items: list[dict[str, Any]], item_id: str) -> dict[str, Any]:
    for item in items:
        if item["id"] == item_id:
            return item
    raise ValueError(f"unknown id: {item_id}")
