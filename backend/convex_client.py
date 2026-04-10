from __future__ import annotations

import json
import time
from typing import Any

import httpx

from backend.config import CONVEX_URL

_TIMEOUT = 15.0


def _url(kind: str) -> str:
    base = CONVEX_URL.rstrip("/")
    return f"{base}/api/{kind}"


def mutation(name: str, args: dict[str, Any] | None = None) -> Any:
    """Call a Convex mutation synchronously. Returns the mutation result."""
    payload: dict[str, Any] = {"path": name, "format": "json"}
    if args:
        payload["args"] = args
    resp = httpx.post(_url("mutation"), json=payload, timeout=_TIMEOUT)
    resp.raise_for_status()
    body = resp.json()
    if body.get("status") == "error":
        raise RuntimeError(f"Convex mutation error: {body.get('errorMessage', body)}")
    return body.get("value")


def query(name: str, args: dict[str, Any] | None = None) -> Any:
    """Call a Convex query synchronously. Returns the query result."""
    payload: dict[str, Any] = {"path": name, "format": "json"}
    if args:
        payload["args"] = args
    resp = httpx.post(_url("query"), json=payload, timeout=_TIMEOUT)
    resp.raise_for_status()
    body = resp.json()
    if body.get("status") == "error":
        raise RuntimeError(f"Convex query error: {body.get('errorMessage', body)}")
    return body.get("value")


def create_job(idea: str) -> str:
    """Create a new pipeline job. Returns the Convex document ID."""
    return mutation("jobs:createJob", {"idea": idea})


def update_progress(job_id: str, progress: int, stage_label: str) -> None:
    mutation("jobs:updateProgress", {
        "job_id": job_id,
        "progress": progress,
        "stage_label": stage_label,
    })


def complete_job(job_id: str, result: dict[str, Any]) -> None:
    mutation("jobs:completeJob", {
        "job_id": job_id,
        "result": json.dumps(result),
    })


def fail_job(job_id: str, error: str) -> None:
    mutation("jobs:failJob", {"job_id": job_id, "error": error})


def get_job(job_id: str) -> dict[str, Any] | None:
    return query("jobs:getJob", {"job_id": job_id})


def list_analyses() -> list[dict[str, Any]]:
    return query("jobs:listAnalyses") or []


def get_analysis(job_id: str) -> dict[str, Any] | None:
    return query("jobs:getAnalysis", {"job_id": job_id})


def get_scrape_cache(cache_key: str) -> Any:
    try:
        cached = query("jobs:getFreshScrapeCache", {"cache_key": cache_key})
    except Exception:
        return None
    if not cached:
        return None
    payload = cached.get("payload")
    if isinstance(payload, str):
        try:
            return json.loads(payload)
        except json.JSONDecodeError:
            return None
    return payload


def set_scrape_cache(
    cache_key: str,
    *,
    kind: str,
    payload: Any,
    ttl_seconds: int,
) -> None:
    try:
        mutation(
            "jobs:putScrapeCache",
            {
                "cache_key": cache_key,
                "kind": kind,
                "payload": json.dumps(payload),
                "expires_at": int(time.time() * 1000) + ttl_seconds * 1000,
            },
        )
    except Exception:
        pass
