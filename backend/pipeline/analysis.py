from __future__ import annotations

import json
from typing import Any

from openai import OpenAI

from backend.config import OPENAI_API_KEY

_SYSTEM_PROMPT = """\
You are a top-tier business analyst. You will receive:
1. Web research results about a business idea
2. Public sentiment analysis from Reddit, X, and other community sources

Synthesize everything into a comprehensive business analysis. Return ONLY valid \
JSON (no markdown fences) with this exact structure:
{
  "executive_summary": "3-5 sentence overview of the idea's viability",
  "market_size": "estimated TAM/SAM/SOM with reasoning",
  "target_audience": "detailed description of ideal customers",
  "swot": {
    "strengths": ["..."],
    "weaknesses": ["..."],
    "opportunities": ["..."],
    "threats": ["..."]
  },
  "competitors": [
    {"name": "...", "description": "...", "threat_level": "high|medium|low"}
  ],
  "revenue_model": "suggested monetization strategy",
  "go_to_market": "step-by-step launch strategy",
  "risk_factors": ["..."],
  "recommendations": ["actionable next step 1", "..."],
  "verdict": "Promising | Risky | Saturated | Niche",
  "confidence_score": <float 0-1>,
  "would_i_fund": "yes" | "no" | "maybe",
  "would_i_fund_score": <int 0-100>,
  "would_i_fund_subscores": {
    "team_execution": <int 0-100>,
    "market_size_quality": <int 0-100>,
    "moat_defensibility": <int 0-100>,
    "traction_signals": <int 0-100>,
    "risk_profile": <int 0-100>
  },
  "would_i_fund_rationale": {
    "overall": "Detailed investment rationale",
    "team_execution": "Why this sub-score was assigned",
    "market_size_quality": "Why this sub-score was assigned",
    "moat_defensibility": "Why this sub-score was assigned",
    "traction_signals": "Why this sub-score was assigned",
    "risk_profile": "Why this sub-score was assigned",
    "why_not_fundable": ["Specific blockers if decision is no/maybe"]
  },
  "improvement_suggestions": [
    {
      "priority": <int 1-5 where 1 is highest>,
      "area": "product|market|gtm|moat|pricing|team|operations",
      "what_to_improve": "specific improvement",
      "why_it_matters": "why this change increases win probability",
      "how_to_do_it": "concrete implementation approach",
      "expected_impact": "expected outcome if executed well",
      "effort": "low|medium|high"
    }
  ],
  "idea_scores": {
    "market_size": <int 1-10>,
    "competition": <int 1-10, where 10 = very low competition / favorable>,
    "feasibility": <int 1-10>,
    "timing": <int 1-10>,
    "revenue_potential": <int 1-10>,
    "founder_fit": <int 1-10>
  }
}
"""


def generate_analysis(
    idea: str,
    web_results: list[dict[str, Any]],
    sentiment: dict[str, Any],
) -> dict[str, Any]:
    """Synthesize web research + sentiment into a structured business analysis."""
    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY is missing. Add it to your .env file.")

    web_summary = "\n\n".join(
        f"Source: {r.get('title', 'N/A')} ({r.get('url', '')})\n"
        f"{(r.get('text') or '')[:3000]}"
        for r in web_results[:10]
    )

    user_msg = (
        f"Business idea: {idea}\n\n"
        f"--- WEB RESEARCH ---\n{web_summary}\n\n"
        f"--- PUBLIC SENTIMENT ---\n{json.dumps(sentiment, indent=2)}"
    )

    client = OpenAI(api_key=OPENAI_API_KEY)
    response = client.chat.completions.create(
        model="gpt-4o",
        temperature=0.3,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
    )
    return json.loads(response.choices[0].message.content)
