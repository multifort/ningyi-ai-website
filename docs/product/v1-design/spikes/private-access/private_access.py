#!/usr/bin/env python3
"""Tenant-bound private artifact authorization and short-lived download tokens."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import uuid
from typing import Any


NAMESPACE = uuid.UUID("70000000-0000-4000-8000-000000000009")
MAX_DOWNLOAD_TTL = 300


def create_registry() -> dict[str, Any]:
    return {"solutions": {}, "artifacts": {}}


def register_solution(registry: dict[str, Any], solution_id: str, owner_user_id: str) -> None:
    existing = registry["solutions"].get(solution_id)
    if existing and existing["ownerUserId"] != owner_user_id:
        raise ValueError("solution ownership cannot be changed")
    registry["solutions"][solution_id] = {"ownerUserId": owner_user_id, "status": "active"}


def register_artifact(registry: dict[str, Any], solution_id: str, owner_user_id: str, object_key: str) -> dict[str, Any]:
    solution = registry["solutions"].get(solution_id)
    if not solution or solution["ownerUserId"] != owner_user_id or solution["status"] != "active":
        raise ValueError("active solution ownership is required")
    prefix = f"private/{owner_user_id}/{solution_id}/"
    if not object_key.startswith(prefix) or ".." in object_key.split("/"):
        raise ValueError("object key is outside the private tenant prefix")
    artifact_id = str(uuid.uuid5(NAMESPACE, object_key))
    artifact = {"id": artifact_id, "solutionId": solution_id, "ownerUserId": owner_user_id, "objectKey": object_key, "status": "active"}
    registry["artifacts"][artifact_id] = artifact
    return artifact


def authorize(registry: dict[str, Any], user_id: str, solution_id: str, artifact_id: str, action: str) -> dict[str, Any]:
    artifact = registry["artifacts"].get(artifact_id)
    if not artifact:
        return decision(action, artifact_id, False, "UNKNOWN_ARTIFACT")
    solution = registry["solutions"].get(solution_id)
    if artifact["ownerUserId"] != user_id or not solution or solution["ownerUserId"] != user_id:
        return decision(action, artifact_id, False, "CROSS_USER_DENIED")
    if artifact["solutionId"] != solution_id:
        return decision(action, artifact_id, False, "SOLUTION_MISMATCH")
    if artifact["status"] != "active" or solution["status"] != "active":
        return decision(action, artifact_id, False, "ARTIFACT_REVOKED")
    return decision(action, artifact_id, True, "OWNER_MATCH")


def issue_download(registry: dict[str, Any], user_id: str, solution_id: str, artifact_id: str, secret: bytes, now: int, ttl_seconds: int = 120) -> tuple[str, dict[str, Any]]:
    if ttl_seconds < 1 or ttl_seconds > MAX_DOWNLOAD_TTL:
        raise ValueError(f"download ttl must be between 1 and {MAX_DOWNLOAD_TTL} seconds")
    access = authorize(registry, user_id, solution_id, artifact_id, "download")
    if not access["allowed"]:
        return "", access
    expires_at = now + ttl_seconds
    payload = {"artifactId": artifact_id, "solutionId": solution_id, "userId": user_id, "expiresAt": expires_at}
    encoded = base64.urlsafe_b64encode(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")).rstrip(b"=")
    signature = hmac.new(secret, encoded, hashlib.sha256).digest()
    token = f"{encoded.decode('ascii')}.{base64.urlsafe_b64encode(signature).rstrip(b'=').decode('ascii')}"
    access.update({"expiresAt": expires_at, "tokenHash": hashlib.sha256(token.encode("utf-8")).hexdigest()})
    return token, access


def verify_download(registry: dict[str, Any], token: str, authenticated_user_id: str, secret: bytes, now: int) -> dict[str, Any]:
    artifact_id = "00000000-0000-4000-8000-000000000000"
    try:
        encoded_text, signature_text = token.split(".", 1)
        encoded = encoded_text.encode("ascii")
        signature = decode_base64(signature_text)
        expected = hmac.new(secret, encoded, hashlib.sha256).digest()
        if not hmac.compare_digest(signature, expected):
            return decision("download", artifact_id, False, "TOKEN_INVALID")
        payload = json.loads(decode_base64(encoded_text).decode("utf-8"))
        artifact_id = payload["artifactId"]
        if payload["userId"] != authenticated_user_id:
            return decision("download", artifact_id, False, "CROSS_USER_DENIED")
        if payload["expiresAt"] <= now:
            return decision("download", artifact_id, False, "TOKEN_EXPIRED")
        return authorize(registry, authenticated_user_id, payload["solutionId"], artifact_id, "download") | {"expiresAt": payload["expiresAt"], "tokenHash": hashlib.sha256(token.encode("utf-8")).hexdigest()}
    except (ValueError, KeyError, TypeError, json.JSONDecodeError, UnicodeDecodeError):
        return decision("download", artifact_id, False, "TOKEN_INVALID")


def revoke_solution(registry: dict[str, Any], user_id: str, solution_id: str) -> None:
    solution = registry["solutions"].get(solution_id)
    if not solution or solution["ownerUserId"] != user_id:
        raise ValueError("solution ownership is required")
    solution["status"] = "deleted"
    for artifact in registry["artifacts"].values():
        if artifact["solutionId"] == solution_id:
            artifact["status"] = "revoked"


def decision(action: str, artifact_id: str, allowed: bool, reason: str) -> dict[str, Any]:
    return {"schemaVersion": "1.0", "action": action, "artifactId": artifact_id, "allowed": allowed, "reason": reason, "expiresAt": None, "tokenHash": None}


def decode_base64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
