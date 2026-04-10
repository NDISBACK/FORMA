from __future__ import annotations

import json
from collections import defaultdict
from typing import Any

from openai import OpenAI

from backend.config import OPENAI_API_KEY
from backend.pipeline.community_signals import (
    dedupe_community_signals,
    short_text,
    source_label,
    summarize_source_coverage,
)

_SYSTEM_PROMPT = """\
You are a sentiment analysis expert. You will receive public community signals \
about a business idea collected from Reddit, Twitter/X, and other discussion \
sources such as Hacker News, Product Hunt, and GitHub.

Analyze the overall public sentiment and return ONLY valid JSON (no markdown \
fences) with this exact structure:
{
  "reddit_sentiment": "positive" | "neutral" | "negative",
  "twitter_sentiment": "positive" | "neutral" | "negative",
  "overall_sentiment_score": <float 0-1, where 1 = extremely positive>,
  "key_concerns": ["concern 1", "concern 2", ...],
  "key_positives": ["positive 1", "positive 2", ...],
  "notable_comments": [
    {"source": "<source>", "text": "...", "sentiment": "positive"|"neutral"|"negative"}
  ],
  "summary": "2-3 sentence summary of overall public perception"
}

IMPORTANT: overall_sentiment_score must reflect the posts — use the full 0.0–1.0 range
(do not default to 0.5 unless sentiment is genuinely mixed). Align it with the
reddit/twitter labels you output. If a platform has no credible evidence, use
"unknown" for that platform.
"""


def _normalize_sentiment_payload(
    d: dict[str, Any],
    *,
    coverage: list[dict[str, Any]],
    sampled_signal_count: int,
) -> dict[str, Any]:
    """Blend model score with platform labels so the score is not stuck at 0.5."""

    def lab_to_f(lab: str | None) -> float | None:
        if not lab:
            return None
        x = str(lab).lower().strip()
        if x == "positive":
            return 0.78
        if x == "negative":
            return 0.24
        if x == "unknown":
            return None
        return 0.52  # neutral

    r = lab_to_f(d.get("reddit_sentiment"))
    t = lab_to_f(d.get("twitter_sentiment"))
    parts = [x for x in (r, t) if x is not None]
    label_blend = sum(parts) / len(parts) if parts else None

    raw = d.get("overall_sentiment_score")
    if isinstance(raw, str):
        raw = raw.strip().rstrip("%")
        try:
            raw = float(raw)
        except ValueError:
            raw = None
    if raw is not None and raw > 1.0:
        raw = raw / 100.0

    if raw is None and label_blend is not None:
        d["overall_sentiment_score"] = round(label_blend, 3)
    elif raw is not None and label_blend is not None:
        # Model often returns 0.5 — pull toward label consensus
        blended = 0.42 * float(raw) + 0.58 * label_blend
        if abs(float(raw) - 0.5) < 0.04:
            d["overall_sentiment_score"] = round(0.35 * float(raw) + 0.65 * label_blend, 3)
        else:
            d["overall_sentiment_score"] = round(blended, 3)
    elif raw is not None:
        d["overall_sentiment_score"] = round(float(raw), 3)
    elif label_blend is not None:
        d["overall_sentiment_score"] = round(label_blend, 3)
    else:
        d["overall_sentiment_score"] = None

    d["source_coverage"] = coverage
    d["sampled_signal_count"] = sampled_signal_count
    d.setdefault("reddit_sentiment", "unknown")
    d.setdefault("twitter_sentiment", "unknown")
    d.setdefault("key_concerns", [])
    d.setdefault("key_positives", [])
    d.setdefault("notable_comments", [])
    d.setdefault("summary", "No public community data was available for analysis.")

    normalized_comments: list[dict[str, Any]] = []
    for comment in d.get("notable_comments") or []:
        normalized_comments.append(
            {
                "source": str(comment.get("source") or "community").strip().lower(),
                "text": short_text(comment.get("text"), max_chars=220),
                "sentiment": str(comment.get("sentiment") or "neutral").strip().lower(),
            }
        )
    d["notable_comments"] = normalized_comments[:6]
    return d


def _sample_signals(
    signals: list[dict[str, Any]],
    *,
    max_per_source: int = 4,
    max_total: int = 18,
) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for signal in dedupe_community_signals(signals):
        grouped[str(signal.get("source") or "community").strip().lower()].append(signal)

    sampled: list[dict[str, Any]] = []
    ordered_sources = sorted(grouped.keys(), key=lambda source: (-len(grouped[source]), source))
    for source in ordered_sources:
        ranked = sorted(
            grouped[source],
            key=lambda item: (
                -(item.get("engagement", 0) or 0),
                str(item.get("created_at") or ""),
            ),
        )
        sampled.extend(ranked[:max_per_source])

    sampled.sort(
        key=lambda item: (
            -(item.get("engagement", 0) or 0),
            str(item.get("created_at") or ""),
        )
    )
    return sampled[:max_total]


def analyze_sentiment(
    community_signals: list[dict[str, Any]],
    idea: str,
) -> dict[str, Any]:
    """Run GPT-4o-mini sentiment analysis on normalized community signals."""
    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY is missing. Add it to your .env file.")

    unique_signals = dedupe_community_signals(community_signals)
    if not unique_signals:
        return _normalize_sentiment_payload(
            {},
            coverage=[],
            sampled_signal_count=0,
        )

    coverage = summarize_source_coverage(unique_signals)
    sampled = _sample_signals(unique_signals)

    grouped_lines: dict[str, list[str]] = defaultdict(list)
    for signal in sampled:
        source = str(signal.get("source") or "community").strip().lower()
        title = short_text(signal.get("title"), max_chars=100)
        text = short_text(signal.get("text"), max_chars=220)
        url = signal.get("url", "")
        prefix = f"{title} — {text}" if title and title != text else text
        grouped_lines[source].append(prefix + (f" ({url})" if url else ""))

    blocks: list[str] = []
    for item in coverage:
        source = item["source"]
        label = source_label(source)
        lines = grouped_lines.get(source, [])
        body = "\n".join(f"- {line}" for line in lines) if lines else "- (no sampled items)"
        blocks.append(f"--- {label} ({item['count']} total, {len(lines)} sampled) ---\n{body}")

    user_msg = (
        f"Business idea: {idea}\n\n"
        f"Source coverage: {json.dumps(coverage, ensure_ascii=True)}\n\n"
        + "\n\n".join(blocks)
    )

    client = OpenAI(api_key=OPENAI_API_KEY)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        temperature=0.2,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
    )
    data = json.loads(response.choices[0].message.content)
    return _normalize_sentiment_payload(
        data,
        coverage=coverage,
        sampled_signal_count=len(sampled),
    )
