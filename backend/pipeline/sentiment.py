from __future__ import annotations

import json
from typing import Any

from openai import OpenAI

from backend.config import OPENAI_API_KEY

_SYSTEM_PROMPT = """\
You are a sentiment analysis expert. You will receive social media posts and \
comments about a business idea collected from Reddit and Twitter/X.

Analyze the overall public sentiment and return ONLY valid JSON (no markdown \
fences) with this exact structure:
{
  "reddit_sentiment": "positive" | "neutral" | "negative",
  "twitter_sentiment": "positive" | "neutral" | "negative",
  "overall_sentiment_score": <float 0-1, where 1 = extremely positive>,
  "key_concerns": ["concern 1", "concern 2", ...],
  "key_positives": ["positive 1", "positive 2", ...],
  "notable_comments": [
    {"source": "reddit"|"twitter", "text": "...", "sentiment": "positive"|"neutral"|"negative"}
  ],
  "summary": "2-3 sentence summary of overall public perception"
}

IMPORTANT: overall_sentiment_score must reflect the posts — use the full 0.0–1.0 range
(do not default to 0.5 unless sentiment is genuinely mixed). Align it with the
reddit/twitter labels you output.
"""


def _normalize_sentiment_payload(d: dict[str, Any]) -> dict[str, Any]:
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

    return d


def analyze_sentiment(
    reddit_posts: list[dict[str, Any]],
    twitter_posts: list[dict[str, Any]],
    idea: str,
) -> dict[str, Any]:
    """Run GPT-4o sentiment analysis on scraped social content."""
    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY is missing. Add it to your .env file.")

    reddit_text = "\n\n".join(
        f"[r/{p.get('subreddit', '?')}] {p.get('title', '')} — {p.get('body', '')}"
        for p in reddit_posts[:20]
    )
    twitter_text = "\n\n".join(
        f"@{p.get('author', '?')}: {p.get('text', '')}"
        for p in twitter_posts[:30]
    )

    user_msg = (
        f"Business idea: {idea}\n\n"
        f"--- REDDIT POSTS ({len(reddit_posts)} total) ---\n{reddit_text or '(none)'}\n\n"
        f"--- TWITTER/X POSTS ({len(twitter_posts)} total) ---\n{twitter_text or '(none)'}"
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
    return _normalize_sentiment_payload(data)
