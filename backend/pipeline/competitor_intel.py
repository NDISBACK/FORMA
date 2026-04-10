from __future__ import annotations

import json
from typing import Any

from openai import OpenAI

from backend.config import OPENAI_API_KEY
from backend.pipeline.exa_search import search_web_deep

_SYSTEM_PROMPT = """\
You are a competitive intelligence analyst. You will receive real website \
content scraped from competitors of a business idea.

Generate a detailed competitive comparison matrix. Return ONLY valid JSON \
(no markdown fences) with this exact structure:
{
  "comparison_matrix": [
    {
      "name": "competitor name",
      "pricing": "pricing info or 'Unknown'",
      "key_features": ["feature 1", "feature 2", ...],
      "weaknesses": ["weakness 1", ...],
      "threat_level": "high|medium|low",
      "failure_modes": ["how this competitor could fail", "..."],
      "why_they_fail": ["root-cause reasons they struggle", "..."],
      "warning_signals": ["early warning signal 1", "..."],
      "strategic_mistakes": ["mistake 1", "..."],
      "evidence": ["source-backed proof points", "..."]
    }
  ],
  "our_advantage": "2-3 sentences on how the user's idea can differentiate",
  "gaps_in_market": ["gap 1", "gap 2"]
}
"""

_MAX_COMPETITORS = 3


def _normalize_row(row: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(row or {})
    normalized["name"] = str(normalized.get("name") or "Unknown competitor")
    normalized["pricing"] = str(normalized.get("pricing") or "Unknown")
    normalized["threat_level"] = str(normalized.get("threat_level") or "medium").lower()
    if normalized["threat_level"] not in {"high", "medium", "low"}:
        normalized["threat_level"] = "medium"

    list_fields = [
        "key_features",
        "weaknesses",
        "failure_modes",
        "why_they_fail",
        "warning_signals",
        "strategic_mistakes",
        "evidence",
    ]
    for field in list_fields:
        value = normalized.get(field)
        if isinstance(value, list):
            normalized[field] = [str(x) for x in value if str(x).strip()][:6]
        elif value:
            normalized[field] = [str(value)]
        else:
            normalized[field] = []
    return normalized


def analyze_competitors(
    idea: str,
    competitors: list[dict[str, Any]],
) -> dict[str, Any]:
    """Scrape competitor websites and produce a comparison matrix."""
    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY is missing.")

    competitor_names = [
        c.get("name", "") for c in competitors if c.get("name")
    ][:_MAX_COMPETITORS]

    scraped: list[dict[str, Any]] = []
    for name in competitor_names:
        try:
            results = search_web_deep(
                f"{name} pricing features product",
                num_results=2,
                max_characters=5000,
                search_type="auto",
            )
            scraped.extend(results)
        except Exception:
            pass

    research_text = "\n\n".join(
        f"Competitor: {r.get('title', 'N/A')} ({r.get('url', '')})\n"
        f"{(r.get('text') or '')[:3000]}"
        for r in scraped[:10]
    )

    known_competitors = json.dumps(competitors[:_MAX_COMPETITORS], indent=2)

    user_msg = (
        f"Business idea: {idea}\n\n"
        f"--- KNOWN COMPETITORS (from earlier analysis) ---\n{known_competitors}\n\n"
        f"--- SCRAPED COMPETITOR CONTENT ---\n{research_text or '(no content found)'}"
    )

    client = OpenAI(api_key=OPENAI_API_KEY)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        temperature=0.3,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
    )
    payload = json.loads(response.choices[0].message.content)
    matrix = payload.get("comparison_matrix")
    if not isinstance(matrix, list):
        matrix = []
    payload["comparison_matrix"] = [_normalize_row(row) for row in matrix[:_MAX_COMPETITORS]]
    payload["our_advantage"] = str(payload.get("our_advantage") or "")
    gaps = payload.get("gaps_in_market")
    payload["gaps_in_market"] = [str(x) for x in gaps] if isinstance(gaps, list) else []
    return payload
