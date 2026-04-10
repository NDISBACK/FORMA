from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from backend.convex_client import update_progress, complete_job, fail_job
from backend.pipeline.apify_scrape import scrape_reddit, scrape_twitter
from backend.pipeline.analysis import generate_analysis
from backend.pipeline.community_signals import (
    dedupe_community_signals,
    reddit_posts_to_signals,
    summarize_source_coverage,
    twitter_posts_to_signals,
    web_results_to_signals,
)
from backend.pipeline.competitor_intel import analyze_competitors
from backend.pipeline.exa_search import search_web_deep, search_community_signals
from backend.pipeline.failure_cases import get_failure_cases
from backend.pipeline.flowchart import generate_flowchart
from backend.pipeline.investor_intel import get_investor_intel
from backend.pipeline.revenue_simulation import generate_revenue_defaults, run_simulation
from backend.pipeline.sentiment import analyze_sentiment

_executor = ThreadPoolExecutor(max_workers=12)


def _clamp_int(v: Any, low: int, high: int, default: int) -> int:
    try:
        return max(low, min(high, int(round(float(v)))))
    except Exception:
        return default


def _normalize_vc_analysis(analysis: dict[str, Any]) -> None:
    """Backfill and normalize VC fundability fields for UI/PDF stability."""
    if not analysis:
        return

    cs = float(analysis.get("confidence_score") or 0.5)
    default_score = _clamp_int(cs * 100, 0, 100, 50)

    vc_score = _clamp_int(analysis.get("would_i_fund_score"), 0, 100, default_score)
    analysis["would_i_fund_score"] = vc_score

    fund_decision = str(analysis.get("would_i_fund") or "").strip().lower()
    if fund_decision not in {"yes", "no", "maybe"}:
        if vc_score >= 70:
            fund_decision = "yes"
        elif vc_score <= 44:
            fund_decision = "no"
        else:
            fund_decision = "maybe"
    analysis["would_i_fund"] = fund_decision

    subs = analysis.get("would_i_fund_subscores")
    if not isinstance(subs, dict):
        subs = {}
    sub_defaults = {
        "team_execution": default_score,
        "market_size_quality": default_score,
        "moat_defensibility": default_score,
        "traction_signals": default_score,
        "risk_profile": default_score,
    }
    normalized_subs: dict[str, int] = {}
    for key, fallback in sub_defaults.items():
        normalized_subs[key] = _clamp_int(subs.get(key), 0, 100, fallback)
    analysis["would_i_fund_subscores"] = normalized_subs

    rationale = analysis.get("would_i_fund_rationale")
    if not isinstance(rationale, dict):
        rationale = {}
    rationale.setdefault(
        "overall",
        "Investment confidence is inferred from market potential, execution readiness, defensibility, traction, and risk trade-offs.",
    )
    for key in normalized_subs.keys():
        rationale.setdefault(
            key,
            "Signal quality was limited, so this score is conservative and should be validated with deeper diligence.",
        )
    blockers = rationale.get("why_not_fundable")
    if not isinstance(blockers, list):
        blockers = []
    if fund_decision != "yes" and not blockers:
        blockers = [
            "Evidence of repeatable customer demand is still limited.",
            "Execution and go-to-market assumptions need stronger validation.",
        ]
    rationale["why_not_fundable"] = blockers
    analysis["would_i_fund_rationale"] = rationale


def _normalize_improvement_suggestions(
    analysis: dict[str, Any],
    sentiment: dict[str, Any],
    competitor_intel: dict[str, Any],
) -> None:
    if not analysis:
        return

    raw = analysis.get("improvement_suggestions")
    if not isinstance(raw, list):
        raw = []

    allowed_areas = {"product", "market", "gtm", "moat", "pricing", "team", "operations"}
    allowed_effort = {"low", "medium", "high"}

    normalized: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        area = str(item.get("area") or "operations").strip().lower()
        if area not in allowed_areas:
            area = "operations"
        effort = str(item.get("effort") or "medium").strip().lower()
        if effort not in allowed_effort:
            effort = "medium"
        normalized.append(
            {
                "priority": _clamp_int(item.get("priority"), 1, 5, 3),
                "area": area,
                "what_to_improve": str(item.get("what_to_improve") or "").strip(),
                "why_it_matters": str(item.get("why_it_matters") or "").strip(),
                "how_to_do_it": str(item.get("how_to_do_it") or "").strip(),
                "expected_impact": str(item.get("expected_impact") or "").strip(),
                "effort": effort,
            }
        )

    if not normalized:
        concerns = sentiment.get("key_concerns") or []
        concern_text = str(concerns[0]) if concerns else "activation and retention risk"
        vc = analysis.get("would_i_fund_rationale") or {}
        blockers = vc.get("why_not_fundable") or []
        blocker_text = str(blockers[0]) if blockers else "insufficient validation of demand and moat"
        matrix = (competitor_intel or {}).get("comparison_matrix") or []
        competitor_name = str(matrix[0].get("name")) if matrix else "incumbents"
        competitor_warning = (
            str((matrix[0].get("warning_signals") or [None])[0])
            if matrix and isinstance(matrix[0], dict)
            else "churn and weak differentiation signals"
        )
        normalized = [
            {
                "priority": 1,
                "area": "gtm",
                "what_to_improve": "Strengthen your initial customer acquisition wedge.",
                "why_it_matters": f"Current concern centers on {concern_text}, which can suppress conversion and traction.",
                "how_to_do_it": "Run 2-3 channel experiments with strict CAC and activation targets, then double down on the best-performing channel.",
                "expected_impact": "Higher early growth predictability and stronger investor confidence in go-to-market.",
                "effort": "medium",
            },
            {
                "priority": 2,
                "area": "moat",
                "what_to_improve": "Build defensibility around a clear differentiator.",
                "why_it_matters": f"{blocker_text} leaves the idea vulnerable to fast-follow competition.",
                "how_to_do_it": "Introduce proprietary workflow/data loops and implementation depth that is hard to copy.",
                "expected_impact": "Lower competitive substitution risk and improved long-term valuation narrative.",
                "effort": "high",
            },
            {
                "priority": 3,
                "area": "product",
                "what_to_improve": "Eliminate the top friction point in onboarding and activation.",
                "why_it_matters": f"Competitor signals from {competitor_name} indicate risk around {competitor_warning}.",
                "how_to_do_it": "Instrument onboarding steps, remove bottlenecks, and ship a 7-day activation playbook with measurable milestones.",
                "expected_impact": "Improved retention, clearer product-market fit signal, and stronger fundability profile.",
                "effort": "medium",
            },
        ]

    # Fill missing fields and ensure deterministic ordering.
    for idx, item in enumerate(normalized, start=1):
        item["priority"] = _clamp_int(item.get("priority"), 1, 5, min(5, idx))
        item["what_to_improve"] = item.get("what_to_improve") or "Define a concrete improvement initiative."
        item["why_it_matters"] = item.get("why_it_matters") or "This reduces execution and market risk."
        item["how_to_do_it"] = item.get("how_to_do_it") or "Break this into milestones and validate quickly."
        item["expected_impact"] = item.get("expected_impact") or "Should improve competitiveness and investment readiness."
        effort = str(item.get("effort") or "medium").lower()
        item["effort"] = effort if effort in allowed_effort else "medium"
        area = str(item.get("area") or "operations").lower()
        item["area"] = area if area in allowed_areas else "operations"

    normalized.sort(key=lambda x: x.get("priority", 99))
    analysis["improvement_suggestions"] = normalized[:6]


async def _run_in_thread(func, *args, **kwargs):
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_executor, lambda: func(*args, **kwargs))


async def _safe(label: str, coro):
    """Run a coroutine and return (label, result, None) or (label, None, error)."""
    try:
        result = await coro
        return label, result, None
    except Exception as exc:
        return label, None, f"{type(exc).__name__}: {exc}"


async def _safe_with_timeout(label: str, coro, *, timeout: int = 25):
    """Like _safe but with a hard timeout — gracefully degrades."""
    try:
        result = await asyncio.wait_for(coro, timeout=timeout)
        return label, result, None
    except asyncio.TimeoutError:
        return label, [], f"Timed out after {timeout}s"
    except Exception as exc:
        return label, [], f"{type(exc).__name__}: {exc}"


def _progress(job_id: str | None, pct: int, label: str) -> None:
    """Push a progress update to Convex (no-op when job_id is None)."""
    if job_id:
        try:
            update_progress(job_id, pct, label)
        except Exception:
            pass


async def _safe_tracked(label: str, coro, job_id: str | None, pct: int, msg: str):
    """Run a coroutine, then push a progress update when it finishes."""
    result = await _safe(label, coro)
    _progress(job_id, pct, msg)
    return result


async def run_pipeline(idea: str, *, job_id: str | None = None) -> dict[str, Any]:
    """Full analysis pipeline for a business idea.

    Phase 1 — data gathering (parallel): Exa search, Reddit, Twitter
    Phase 2 — sentiment analysis (needs phase 1)
    Phase 3 — business analysis (needs phase 1 + 2)
    Phase 4 — deep intelligence (parallel): flowchart, failure cases,
              competitor intel, investor intel
    """
    errors: list[dict[str, str]] = []

    try:
        _progress(job_id, 5, "Initializing")

        # --- Phase 1: parallel data gathering ---
        _progress(job_id, 8, "Searching the web")

        exa_queries = [
            f"{idea} market size and opportunity",
            f"{idea} competitors and alternatives",
            f"{idea} industry trends and future",
        ]
        exa_labels = [
            "Searching the web — market size",
            "Searching the web — competitors",
            "Searching the web — industry trends",
        ]
        exa_tasks = [
            _safe_tracked(
                f"exa_{i}",
                _run_in_thread(search_web_deep, q, num_results=5, max_characters=3000, search_type="deep"),
                job_id, 12 + i * 7, exa_labels[i],
            )
            for i, q in enumerate(exa_queries)
        ]
        reddit_task = _safe_with_timeout(
            "reddit",
            _run_in_thread(scrape_reddit, idea, max_posts=10),
            timeout=25,
        )
        twitter_task = _safe_with_timeout(
            "twitter",
            _run_in_thread(scrape_twitter, idea, max_tweets=15),
            timeout=25,
        )
        community_task = _safe_tracked(
            "community",
            _run_in_thread(search_community_signals, idea, per_source=2, max_characters=900),
            job_id, 30, "Scanning community discussions",
        )

        phase1_tasks = [*exa_tasks, reddit_task, twitter_task, community_task]
        phase1 = await asyncio.gather(*phase1_tasks)
        _progress(job_id, 33, "Scraping Reddit")
        _progress(job_id, 40, "Scraping Twitter")

        _progress(job_id, 45, "All data gathered")

        web_results: list[dict[str, Any]] = []
        reddit_posts: list[dict[str, Any]] = []
        twitter_posts: list[dict[str, Any]] = []
        community_results: list[dict[str, Any]] = []

        for label, result, error in phase1:
            if error:
                errors.append({"stage": label, "error": error})
                continue
            if label.startswith("exa"):
                web_results.extend(result or [])
            elif label == "reddit":
                reddit_posts = result or []
            elif label == "twitter":
                twitter_posts = result or []
            elif label == "community":
                community_results = result or []

        # --- Phase 2+3: sentiment then analysis ---
        _progress(job_id, 50, "Analyzing public sentiment")

        empty_sentiment: dict[str, Any] = {
            "reddit_sentiment": "unknown",
            "twitter_sentiment": "unknown",
            "overall_sentiment_score": None,
            "summary": "No public community data was available for analysis.",
            "key_concerns": [],
            "key_positives": [],
            "notable_comments": [],
            "source_coverage": [],
            "sampled_signal_count": 0,
        }

        community_signals = dedupe_community_signals(
            reddit_posts_to_signals(reddit_posts)
            + twitter_posts_to_signals(twitter_posts)
            + web_results_to_signals(community_results)
        )
        source_breakdown = summarize_source_coverage(community_signals)

        sentiment: dict[str, Any] = {
            **empty_sentiment,
            "source_coverage": source_breakdown,
        }
        if community_signals:
            _, sentiment_result, sentiment_err = await _safe(
                "sentiment",
                _run_in_thread(analyze_sentiment, community_signals, idea),
            )
        else:
            sentiment_result = None
            sentiment_err = None
        if sentiment_err:
            errors.append({"stage": "sentiment", "error": sentiment_err})
        elif sentiment_result:
            sentiment = sentiment_result

        _progress(job_id, 58, "Generating report")
        _, analysis_result, analysis_err = await _safe(
            "analysis",
            _run_in_thread(generate_analysis, idea, web_results, sentiment),
        )

        analysis: dict[str, Any] = {}
        if analysis_err:
            errors.append({"stage": "analysis", "error": analysis_err})
        else:
            analysis = analysis_result or {}

        _progress(job_id, 70, "Business analysis complete")

        # --- Phase 4: deep intelligence (parallel) ---
        phase4 = await asyncio.gather(
            _safe_tracked(
                "flowchart",
                _run_in_thread(generate_flowchart, idea, analysis),
                job_id, 80, "Building business flowchart",
            ),
            _safe_tracked(
                "failure_cases",
                _run_in_thread(get_failure_cases, idea, web_results),
                job_id, 83, "Researching failure case studies",
            ),
            _safe_tracked(
                "competitor_intel",
                _run_in_thread(analyze_competitors, idea, analysis.get("competitors", [])),
                job_id, 86, "Analyzing competitor intelligence",
            ),
            _safe_tracked(
                "investor_intel",
                _run_in_thread(get_investor_intel, idea),
                job_id, 89, "Finding investor intelligence",
            ),
            _safe_tracked(
                "revenue_defaults",
                _run_in_thread(generate_revenue_defaults, idea, analysis),
                job_id, 95, "Building revenue simulation",
            ),
        )

        _progress(job_id, 98, "Finalizing report")

        flowchart_mermaid = ""
        failure_cases: dict[str, Any] = {}
        competitor_intel: dict[str, Any] = {}
        investor_intel: dict[str, Any] = {}
        revenue_defaults: dict[str, Any] = {}

        for label, res, err in phase4:
            if err:
                errors.append({"stage": label, "error": err})
                continue
            if label == "flowchart":
                flowchart_mermaid = res or ""
            elif label == "failure_cases":
                failure_cases = res or {}
            elif label == "competitor_intel":
                competitor_intel = res or {}
            elif label == "investor_intel":
                investor_intel = res or {}
            elif label == "revenue_defaults":
                revenue_defaults = res or {}

        revenue_simulation: dict[str, Any] = {}
        if revenue_defaults:
            try:
                revenue_simulation = run_simulation(revenue_defaults)
                revenue_simulation["defaults"] = revenue_defaults
            except Exception as exc:
                errors.append({"stage": "revenue_simulation", "error": str(exc)})

        if analysis and not analysis.get("idea_scores"):
            cs = float(analysis.get("confidence_score") or 0.5)
            base = max(1, min(10, int(round(cs * 10))))
            analysis["idea_scores"] = {
                "market_size": base,
                "competition": base,
                "feasibility": base,
                "timing": base,
                "revenue_potential": base,
                "founder_fit": base,
            }
        _normalize_vc_analysis(analysis)
        _normalize_improvement_suggestions(analysis, sentiment, competitor_intel)

        result = {
            "idea": idea,
            "web_sources": [
                {"title": r["title"], "url": r["url"]} for r in web_results
            ],
            "social_data": {
                "reddit_post_count": len(reddit_posts),
                "twitter_post_count": len(twitter_posts),
                "community_signal_count": len(community_results),
                "source_breakdown": sentiment.get("source_coverage", source_breakdown),
            },
            "sentiment": sentiment,
            "analysis": analysis,
            "flowchart_mermaid": flowchart_mermaid,
            "failure_cases": failure_cases,
            "competitor_intel": competitor_intel,
            "investor_intel": investor_intel,
            "revenue_simulation": revenue_simulation,
            "errors": errors if errors else None,
        }

        if job_id:
            complete_job(job_id, result)

        return result

    except Exception as exc:
        if job_id:
            fail_job(job_id, str(exc))
        raise
