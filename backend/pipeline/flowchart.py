from __future__ import annotations

import re
from typing import Any

from openai import OpenAI

from backend.config import OPENAI_API_KEY

_SYSTEM_PROMPT = """\
You are a strict Mermaid.js generator.

Return ONLY valid Mermaid flowchart code.

Requirements:
- Use: flowchart TD
- Output must start EXACTLY with: flowchart TD
- Do NOT include any explanation, markdown, or text before/after

STRICT RULES:
- Use ONLY alphanumeric node IDs with underscores (no spaces)
- Example: idea_node, target_audience
- NEVER use reserved words like: end, class, graph

- ALWAYS define nodes BEFORE connecting them
- Node format: id["Label"]

- ONLY use arrows: -->
- NEVER use other arrow types

- Edge labels MUST use this format:
  A -->|label| B

- DO NOT use:
  - parentheses ()
  - colons :
  - semicolons ;
  - quotes inside labels except wrapping quotes

- Keep labels SHORT and SIMPLE (2–4 words max)

STRUCTURE:
- Include these nodes:
  idea, target_audience, value_proposition,
  revenue_streams, key_activities,
  channels, cost_structure, competitive_advantage

- Use subgraphs EXACTLY like this format:

  subgraph market
    target_audience["Target Audience"]
    channels["Channels"]
  end

  subgraph product
    value_proposition["Value Proposition"]
    competitive_advantage["Competitive Advantage"]
  end

  subgraph revenue
    revenue_streams["Revenue Streams"]
    cost_structure["Cost Structure"]
  end

  subgraph operations
    key_activities["Key Activities"]
  end

FLOW:
- idea MUST connect to value_proposition
- value_proposition MUST connect to target_audience
- target_audience MUST connect to revenue_streams
- revenue_streams MUST connect to cost_structure
- idea MUST connect to key_activities
- channels MUST connect to target_audience
- competitive_advantage MUST connect to value_proposition

FINAL CHECK BEFORE OUTPUT:
- Ensure NO syntax errors
- Ensure ALL nodes are connected
- Ensure code renders correctly in Mermaid

If unsure, return an empty string.
"""


def generate_flowchart(
    idea: str,
    analysis: dict[str, Any],
) -> str:
    """Generate a Mermaid flowchart string from the business analysis."""
    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY is missing. Add it to your .env file.")

    import json

    user_msg = (
        f"Business idea: {idea}\n\n"
        f"Business analysis:\n{json.dumps(analysis, indent=2)}"
    )

    client = OpenAI(api_key=OPENAI_API_KEY)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        temperature=0.4,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
    )

    mermaid_code = response.choices[0].message.content.strip()
    mermaid_code = re.sub(r"^```(?:mermaid)?\s*", "", mermaid_code)
    mermaid_code = re.sub(r"\s*```$", "", mermaid_code)
    return mermaid_code
