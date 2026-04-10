from __future__ import annotations

import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from backend.pipeline.orchestrator import run_pipeline
from backend.pipeline.sentiment import analyze_sentiment


class OrchestratorTests(unittest.IsolatedAsyncioTestCase):
    @patch("backend.pipeline.orchestrator.search_web_deep", return_value=[])
    @patch("backend.pipeline.orchestrator.scrape_reddit")
    @patch("backend.pipeline.orchestrator.scrape_twitter", return_value=[])
    @patch("backend.pipeline.orchestrator.search_community_signals", return_value=[])
    @patch("backend.pipeline.orchestrator.analyze_sentiment")
    @patch("backend.pipeline.orchestrator.generate_analysis")
    @patch("backend.pipeline.orchestrator.generate_flowchart", return_value="flowchart TD\nA-->B")
    @patch("backend.pipeline.orchestrator.get_failure_cases", return_value={})
    @patch("backend.pipeline.orchestrator.analyze_competitors", return_value={})
    @patch("backend.pipeline.orchestrator.get_investor_intel", return_value={})
    @patch("backend.pipeline.orchestrator.generate_revenue_defaults", return_value={})
    @patch("backend.pipeline.orchestrator.run_simulation", return_value={})
    async def test_analysis_receives_real_sentiment(
        self,
        _run_simulation,
        _generate_revenue_defaults,
        _get_investor_intel,
        _analyze_competitors,
        _get_failure_cases,
        _generate_flowchart,
        mock_generate_analysis,
        mock_analyze_sentiment,
        _search_community_signals,
        _scrape_twitter,
        mock_scrape_reddit,
        _search_web_deep,
    ):
        mock_scrape_reddit.return_value = [
            {
                "title": "People want this",
                "body": "This solves a painful workflow.",
                "url": "https://reddit.com/r/startups/1",
                "score": 12,
                "subreddit": "startups",
                "created_at": "2026-01-01T00:00:00Z",
            }
        ]
        mock_analyze_sentiment.return_value = {
            "summary": "Live social signal",
            "reddit_sentiment": "positive",
            "twitter_sentiment": "unknown",
            "overall_sentiment_score": 0.81,
            "key_positives": ["Clear user demand"],
            "key_concerns": [],
            "notable_comments": [],
            "source_coverage": [{"source": "reddit", "label": "Reddit", "count": 1}],
            "sampled_signal_count": 1,
        }

        def _analysis(_idea, _web_results, sentiment):
            return {
                "executive_summary": sentiment["summary"],
                "confidence_score": 0.8,
                "verdict": "Promising",
            }

        mock_generate_analysis.side_effect = _analysis

        result = await run_pipeline("AI invoicing app")

        self.assertEqual(result["sentiment"]["summary"], "Live social signal")
        self.assertEqual(result["analysis"]["executive_summary"], "Live social signal")
        mock_generate_analysis.assert_called_once()
        self.assertEqual(
            mock_generate_analysis.call_args.args[2]["summary"],
            "Live social signal",
        )

    @patch("backend.pipeline.orchestrator.search_web_deep", return_value=[])
    @patch("backend.pipeline.orchestrator.scrape_reddit", return_value=[])
    @patch("backend.pipeline.orchestrator.scrape_twitter", return_value=[])
    @patch("backend.pipeline.orchestrator.search_community_signals", return_value=[])
    @patch("backend.pipeline.orchestrator.generate_analysis")
    @patch("backend.pipeline.orchestrator.generate_flowchart", return_value="")
    @patch("backend.pipeline.orchestrator.get_failure_cases", return_value={})
    @patch("backend.pipeline.orchestrator.analyze_competitors", return_value={})
    @patch("backend.pipeline.orchestrator.get_investor_intel", return_value={})
    @patch("backend.pipeline.orchestrator.generate_revenue_defaults", return_value={})
    @patch("backend.pipeline.orchestrator.run_simulation", return_value={})
    async def test_vc_fields_are_backfilled_and_clamped(
        self,
        _run_simulation,
        _generate_revenue_defaults,
        _get_investor_intel,
        _analyze_competitors,
        _get_failure_cases,
        _generate_flowchart,
        mock_generate_analysis,
        _search_community_signals,
        _scrape_twitter,
        _scrape_reddit,
        _search_web_deep,
    ):
        mock_generate_analysis.return_value = {
            "executive_summary": "Strong potential",
            "confidence_score": 0.82,
            "verdict": "Promising",
            "would_i_fund_score": 142,  # should clamp to 100
            "would_i_fund_subscores": {
                "team_execution": -7,   # should clamp to 0
            },
            "improvement_suggestions": [
                {
                    "priority": "9",
                    "area": "invalid-area",
                    "what_to_improve": "Tighten onboarding messaging",
                    "why_it_matters": "Weak activation lowers conversion confidence",
                    "how_to_do_it": "Test 3 onboarding variants",
                    "expected_impact": "Higher activation",
                    "effort": "invalid",
                }
            ],
        }

        result = await run_pipeline("Vertical SaaS for clinics")
        analysis = result["analysis"]

        self.assertIn(analysis["would_i_fund"], {"yes", "no", "maybe"})
        self.assertEqual(analysis["would_i_fund_score"], 100)
        self.assertEqual(analysis["would_i_fund_subscores"]["team_execution"], 0)
        self.assertIn("market_size_quality", analysis["would_i_fund_subscores"])
        self.assertIn("overall", analysis["would_i_fund_rationale"])
        self.assertIn("why_not_fundable", analysis["would_i_fund_rationale"])
        self.assertIn("improvement_suggestions", analysis)
        self.assertEqual(analysis["improvement_suggestions"][0]["priority"], 5)
        self.assertEqual(analysis["improvement_suggestions"][0]["area"], "operations")
        self.assertEqual(analysis["improvement_suggestions"][0]["effort"], "medium")

    @patch("backend.pipeline.orchestrator.search_web_deep", return_value=[])
    @patch("backend.pipeline.orchestrator.scrape_reddit", return_value=[])
    @patch("backend.pipeline.orchestrator.scrape_twitter", return_value=[])
    @patch("backend.pipeline.orchestrator.search_community_signals", return_value=[])
    @patch(
        "backend.pipeline.orchestrator.analyze_sentiment",
        return_value={
            "summary": "Mixed sentiment",
            "reddit_sentiment": "neutral",
            "twitter_sentiment": "negative",
            "overall_sentiment_score": 0.42,
            "key_positives": [],
            "key_concerns": ["High onboarding friction"],
            "notable_comments": [],
            "source_coverage": [],
            "sampled_signal_count": 0,
        },
    )
    @patch(
        "backend.pipeline.orchestrator.analyze_competitors",
        return_value={
            "comparison_matrix": [
                {
                    "name": "Incumbent X",
                    "warning_signals": ["Rising churn in SMB segment"],
                }
            ]
        },
    )
    @patch("backend.pipeline.orchestrator.generate_analysis")
    @patch("backend.pipeline.orchestrator.generate_flowchart", return_value="")
    @patch("backend.pipeline.orchestrator.get_failure_cases", return_value={})
    @patch("backend.pipeline.orchestrator.get_investor_intel", return_value={})
    @patch("backend.pipeline.orchestrator.generate_revenue_defaults", return_value={})
    @patch("backend.pipeline.orchestrator.run_simulation", return_value={})
    async def test_improvement_suggestions_backfilled_when_missing(
        self,
        _run_simulation,
        _generate_revenue_defaults,
        _get_investor_intel,
        _get_failure_cases,
        _generate_flowchart,
        mock_generate_analysis,
        _analyze_competitors,
        _analyze_sentiment,
        _search_community_signals,
        _scrape_twitter,
        _scrape_reddit,
        _search_web_deep,
    ):
        mock_generate_analysis.return_value = {
            "executive_summary": "Potential if execution improves",
            "confidence_score": 0.55,
            "verdict": "Risky",
            # improvement_suggestions intentionally omitted
        }

        result = await run_pipeline("Workflow automation for agencies")
        analysis = result["analysis"]
        suggestions = analysis.get("improvement_suggestions") or []

        self.assertGreaterEqual(len(suggestions), 3)
        first = suggestions[0]
        self.assertIn("priority", first)
        self.assertIn("area", first)
        self.assertIn("what_to_improve", first)
        self.assertIn("why_it_matters", first)
        self.assertIn("how_to_do_it", first)
        self.assertIn("expected_impact", first)
        self.assertIn("effort", first)


class SentimentTests(unittest.TestCase):
    @patch("backend.pipeline.sentiment.OPENAI_API_KEY", "test-key")
    @patch("backend.pipeline.sentiment.OpenAI")
    def test_sentiment_adds_coverage_for_multi_source_signals(self, mock_openai):
        response_payload = {
            "reddit_sentiment": "positive",
            "twitter_sentiment": "neutral",
            "overall_sentiment_score": 0.64,
            "key_concerns": ["Price sensitivity"],
            "key_positives": ["Strong community interest"],
            "notable_comments": [
                {"source": "reddit", "text": "Looks useful", "sentiment": "positive"},
                {"source": "github", "text": "Would integrate this", "sentiment": "positive"},
            ],
            "summary": "Signals are broadly encouraging.",
        }

        mock_openai.return_value.chat.completions.create.return_value = SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(content=json.dumps(response_payload))
                )
            ]
        )

        result = analyze_sentiment(
            [
                {
                    "source": "reddit",
                    "title": "Great fit",
                    "text": "I would try this today",
                    "url": "https://reddit.com/r/startups/1",
                    "engagement": 10,
                },
                {
                    "source": "twitter",
                    "text": "Interesting but crowded market",
                    "url": "https://x.com/example/status/1",
                    "engagement": 8,
                },
                {
                    "source": "github",
                    "title": "Open issue",
                    "text": "Teams are asking for this workflow",
                    "url": "https://github.com/acme/app/issues/1",
                    "engagement": 4,
                },
            ],
            "AI invoicing app",
        )

        coverage = {item["source"]: item["count"] for item in result["source_coverage"]}
        self.assertEqual(coverage["reddit"], 1)
        self.assertEqual(coverage["twitter"], 1)
        self.assertEqual(coverage["github"], 1)
        self.assertEqual(result["sampled_signal_count"], 3)
        self.assertEqual(result["notable_comments"][1]["source"], "github")


if __name__ == "__main__":
    unittest.main()
