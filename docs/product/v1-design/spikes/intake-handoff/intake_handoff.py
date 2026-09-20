#!/usr/bin/env python3
"""Anonymous intake draft to authenticated automatic-processing handoff."""

from __future__ import annotations

import hashlib
import uuid
from typing import Any


NAMESPACE = uuid.UUID("70000000-0000-4000-8000-000000000007")


def digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def create_draft(draft_id: str, purpose_primary: str | None, need_description: str, form_data: dict[str, Any], files: list[dict[str, Any]]) -> dict[str, Any]:
    selections = []
    for index, file in enumerate(files):
        selections.append({"id": str(uuid.uuid5(NAMESPACE, f"{draft_id}:file:{index}:{file['displayName']}:{file['sizeBytes']}:{file['lastModified']}")), "category": file["category"], "displayName": file["displayName"], "sizeBytes": file["sizeBytes"], "lastModified": file["lastModified"], "localState": "selected", "uploadState": "not_started", "privateObjectKey": None})
    return {"schemaVersion": "1.0", "draftId": draft_id, "status": "local", "ownerUserId": None, "solutionId": None, "purposePrimary": purpose_primary, "needDescription": need_description.strip(), "formData": form_data, "fileSelections": selections, "bindingNonceHash": None, "quickUnderstandingStarted": False}


def validation_errors(draft: dict[str, Any]) -> list[str]:
    errors = []
    if not draft["purposePrimary"]:
        errors.append("PURPOSE_REQUIRED")
    has_description = bool(draft["needDescription"].strip())
    has_content_file = any(file["category"] == "content" and file["localState"] == "selected" for file in draft["fileSelections"])
    if not has_description and not has_content_file:
        errors.append("DESCRIPTION_OR_CONTENT_FILE_REQUIRED")
    return errors


def begin_auth(draft: dict[str, Any], nonce: str) -> None:
    errors = validation_errors(draft)
    if errors:
        raise ValueError(f"intake minimum not met: {errors}")
    if draft["ownerUserId"] is not None:
        raise ValueError("draft is already bound")
    draft.update({"status": "awaiting_auth", "bindingNonceHash": digest(nonce)})


def auth_failed(draft: dict[str, Any]) -> None:
    if draft["status"] != "awaiting_auth":
        raise ValueError("draft is not awaiting authentication")
    # Deliberately preserve form fields, file references, and the pending nonce.


def bind_after_auth(draft: dict[str, Any], user_id: str, nonce: str) -> dict[str, Any]:
    if draft["ownerUserId"] is not None:
        if draft["ownerUserId"] == user_id and draft["bindingNonceHash"] == digest(nonce):
            return draft
        raise ValueError("draft belongs to another authenticated session")
    if draft["status"] != "awaiting_auth" or draft["bindingNonceHash"] != digest(nonce):
        raise ValueError("invalid or expired binding nonce")
    solution_id = str(uuid.uuid5(NAMESPACE, f"{user_id}:{draft['draftId']}:solution"))
    draft.update({"ownerUserId": user_id, "solutionId": solution_id, "status": "bound"})
    maybe_start(draft)
    return draft


def begin_upload(draft: dict[str, Any], file_id: str) -> str:
    require_owner(draft)
    file = file_by_id(draft, file_id)
    if file["localState"] != "selected":
        raise ValueError("local file must be selected again")
    object_key = f"private/{draft['ownerUserId']}/{draft['solutionId']}/{file['id']}"
    file.update({"uploadState": "uploading", "privateObjectKey": object_key})
    draft["status"] = "uploading"
    return object_key


def complete_upload(draft: dict[str, Any], file_id: str) -> None:
    file = file_by_id(draft, file_id)
    if file["uploadState"] != "uploading" or not file["privateObjectKey"]:
        raise ValueError("file upload was not started")
    file["uploadState"] = "uploaded"
    maybe_start(draft)


def mark_local_references_lost(draft: dict[str, Any]) -> None:
    for file in draft["fileSelections"]:
        if file["uploadState"] == "not_started":
            file["localState"] = "reselect_required"


def maybe_start(draft: dict[str, Any]) -> None:
    if draft["ownerUserId"] is None:
        return
    has_description = bool(draft["needDescription"].strip())
    has_uploaded_content = any(file["category"] == "content" and file["uploadState"] == "uploaded" for file in draft["fileSelections"])
    if has_description or has_uploaded_content:
        draft.update({"quickUnderstandingStarted": True, "status": "processing"})
    elif any(file["localState"] == "selected" for file in draft["fileSelections"]):
        draft["status"] = "uploading"


def file_by_id(draft: dict[str, Any], file_id: str) -> dict[str, Any]:
    for file in draft["fileSelections"]:
        if file["id"] == file_id:
            return file
    raise ValueError("unknown file selection")


def require_owner(draft: dict[str, Any]) -> None:
    if not draft["ownerUserId"] or not draft["solutionId"]:
        raise ValueError("authentication is required before upload")
