from __future__ import annotations

import base64
import io
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

_PAGE_W, _PAGE_H = A4
_MARGIN = 20 * mm
_AVAIL = _PAGE_W - 2 * _MARGIN
_LOGO_PATH = Path(__file__).resolve().parent.parent / "assets" / "logo.png"

_NAVY = colors.HexColor("#1a1a2e")
_DARK_BLUE = colors.HexColor("#16213e")
_MID_BLUE = colors.HexColor("#0f3460")
_ACCENT = colors.HexColor("#e94560")
_LIGHT_BG = colors.HexColor("#f4f6fb")
_RULE_COLOR = colors.HexColor("#d0d7e6")
_TEXT = colors.HexColor("#333333")
_MUTED = colors.HexColor("#888888")

_styles = getSampleStyleSheet()

_COVER_TITLE = ParagraphStyle(
    "CoverTitle", parent=_styles["Title"], fontSize=32, leading=38,
    textColor=colors.white, alignment=TA_CENTER, spaceAfter=4,
)
_COVER_SUB = ParagraphStyle(
    "CoverSub", parent=_styles["Heading2"], fontSize=14, leading=18,
    textColor=colors.HexColor("#aab4cc"), alignment=TA_CENTER, spaceAfter=0,
)
_COVER_IDEA = ParagraphStyle(
    "CoverIdea", parent=_styles["BodyText"], fontSize=13, leading=18,
    textColor=_TEXT, alignment=TA_CENTER, spaceBefore=12, spaceAfter=4,
)
_SECTION = ParagraphStyle(
    "Section", parent=_styles["Heading1"], fontSize=14, leading=18,
    textColor=colors.white, spaceBefore=0, spaceAfter=0,
    leftIndent=6, fontName="Helvetica-Bold",
)
_H2 = ParagraphStyle(
    "FormaH2", parent=_styles["Heading2"], fontSize=12, spaceAfter=4,
    spaceBefore=10, textColor=_MID_BLUE,
)
_BODY = ParagraphStyle(
    "FormaBody", parent=_styles["BodyText"], fontSize=10, leading=14,
    textColor=_TEXT,
)
_BODY_CENTER = ParagraphStyle(
    "FormaBodyC", parent=_BODY, alignment=TA_CENTER,
)
_SMALL = ParagraphStyle(
    "FormaSmall", parent=_BODY, fontSize=8, textColor=_MUTED,
    alignment=TA_CENTER,
)
_BADGE_TEXT = ParagraphStyle(
    "Badge", parent=_BODY, fontSize=11, textColor=colors.white,
    alignment=TA_CENTER, fontName="Helvetica-Bold",
)


def _p(text: str, style=None) -> Paragraph:
    return Paragraph(str(text or "-"), style or _BODY)


def _section_banner(title: str) -> list:
    """Dark blue banner bar with white heading text."""
    banner_data = [[Paragraph(title, _SECTION)]]
    banner = Table(banner_data, colWidths=[_AVAIL], rowHeights=[28])
    banner.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), _DARK_BLUE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
    ]))
    return [Spacer(1, 14), banner, Spacer(1, 6)]


def _hr() -> Table:
    """Thin colored horizontal rule."""
    t = Table([[""]], colWidths=[_AVAIL], rowHeights=[1])
    t.setStyle(TableStyle([
        ("LINEBELOW", (0, 0), (-1, -1), 0.75, _RULE_COLOR),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return t


def _bullet_list(items: list[str]) -> list:
    elems = []
    for item in items or ["-"]:
        elems.append(Paragraph(f"\u2022  {item}", _BODY))
    return elems


def _data_table(data: list[list], col_widths=None) -> Table:
    t = Table(data, colWidths=col_widths, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), _DARK_BLUE),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 6),
        ("TOPPADDING", (0, 1), (-1, -1), 6),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, _LIGHT_BG]),
    ]))
    return t


def _verdict_badge(verdict: str, confidence) -> Table:
    """Color-coded verdict pill."""
    v_lower = str(verdict).lower()
    if "proceed" in v_lower or "go" in v_lower or "viable" in v_lower:
        bg = colors.HexColor("#27ae60")
    elif "caution" in v_lower or "maybe" in v_lower or "risky" in v_lower:
        bg = colors.HexColor("#f39c12")
    else:
        bg = colors.HexColor("#e74c3c")

    label = f"{verdict}  |  Confidence: {confidence}"
    badge_data = [[Paragraph(label, _BADGE_TEXT)]]
    badge = Table(badge_data, colWidths=[_AVAIL * 0.6], rowHeights=[30])
    badge.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROUNDEDCORNERS", [6, 6, 6, 6]),
    ]))
    badge.hAlign = "CENTER"
    return badge


def _mermaid_image(mermaid_code: str, width: float) -> Image | None:
    """Fetch a Mermaid diagram as PNG from mermaid.ink and return an Image."""
    if not mermaid_code or not mermaid_code.strip():
        return None
    try:
        encoded = base64.urlsafe_b64encode(mermaid_code.encode("utf-8")).decode("ascii")
        url = f"https://mermaid.ink/img/{encoded}?bgColor=white"
        resp = httpx.get(url, timeout=20)
        if resp.status_code != 200:
            return None
        img_buf = io.BytesIO(resp.content)
        img = Image(img_buf)
        iw, ih = img.imageWidth, img.imageHeight
        if iw and ih:
            ratio = min(width / iw, 1.0)
            img._restrictSize(iw * ratio, ih * ratio)
        return img
    except Exception:
        return None


def _cover_page(canvas, doc):
    """Draw the cover page: full-width navy banner with logo."""
    canvas.saveState()
    banner_h = 120 * mm
    canvas.setFillColor(_NAVY)
    canvas.rect(0, _PAGE_H - banner_h, _PAGE_W, banner_h, fill=1, stroke=0)

    if _LOGO_PATH.exists():
        logo_w = 50 * mm
        logo_h = 50 * mm
        logo_x = (_PAGE_W - logo_w) / 2
        logo_y = _PAGE_H - banner_h + 55 * mm
        canvas.drawImage(
            str(_LOGO_PATH), logo_x, logo_y,
            width=logo_w, height=logo_h,
            preserveAspectRatio=True, mask="auto",
        )

    canvas.setFillColor(_MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawCentredString(_PAGE_W / 2, 12 * mm, f"Page {doc.page}")

    canvas.restoreState()


def _later_pages(canvas, doc):
    """Header bar with logo + footer with page number on all pages after cover."""
    canvas.saveState()
    bar_h = 10 * mm
    canvas.setFillColor(_NAVY)
    canvas.rect(0, _PAGE_H - bar_h, _PAGE_W, bar_h, fill=1, stroke=0)

    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawString(_MARGIN, _PAGE_H - 7 * mm, "FORMA")

    if _LOGO_PATH.exists():
        canvas.drawImage(
            str(_LOGO_PATH),
            _PAGE_W - _MARGIN - 8 * mm, _PAGE_H - 9 * mm,
            width=8 * mm, height=8 * mm,
            preserveAspectRatio=True, mask="auto",
        )

    canvas.setStrokeColor(_RULE_COLOR)
    canvas.setLineWidth(0.5)
    canvas.line(_MARGIN, 10 * mm, _PAGE_W - _MARGIN, 10 * mm)

    canvas.setFillColor(_MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(_PAGE_W - _MARGIN, 5 * mm, f"Page {doc.page}")
    canvas.drawString(_MARGIN, 5 * mm, "FORMA Intelligence Report")

    canvas.restoreState()


def generate_pdf(result: dict[str, Any]) -> bytes:
    """Render a full FORMA analysis report as a polished PDF."""
    if isinstance(result, str):
        import json
        result = json.loads(result)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=_MARGIN, rightMargin=_MARGIN,
        topMargin=25 * mm, bottomMargin=20 * mm,
    )

    story: list = []
    analysis = result.get("analysis") or {}
    sentiment = result.get("sentiment") or {}
    failure = result.get("failure_cases") or {}
    comp_intel = result.get("competitor_intel") or {}
    investor = result.get("investor_intel") or {}
    flowchart_code = result.get("flowchart_mermaid") or ""

    # ================================================================
    # COVER PAGE
    # ================================================================
    story.append(Spacer(1, 75 * mm))
    story.append(Paragraph("FORMA", _COVER_TITLE))
    story.append(Paragraph("Business Idea Intelligence Report", _COVER_SUB))
    story.append(Spacer(1, 18 * mm))
    story.append(_hr())
    story.append(Spacer(1, 6))
    story.append(Paragraph(f"<b>Idea:</b> {result.get('idea', 'N/A')}", _COVER_IDEA))
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        f"Generated on {datetime.now().strftime('%B %d, %Y at %I:%M %p')}",
        _SMALL,
    ))
    story.append(Spacer(1, 8))

    verdict = analysis.get("verdict", "-")
    confidence = analysis.get("confidence_score", "-")
    story.append(_verdict_badge(verdict, confidence))

    story.append(PageBreak())

    # ================================================================
    # EXECUTIVE SUMMARY
    # ================================================================
    story.extend(_section_banner("Executive Summary"))
    story.append(_p(analysis.get("executive_summary", "-")))
    story.append(Spacer(1, 4))
    story.append(_hr())

    # ================================================================
    # BUSINESS FLOWCHART
    # ================================================================
    if flowchart_code.strip():
        story.extend(_section_banner("Business Flowchart"))
        fc_img = _mermaid_image(flowchart_code, _AVAIL)
        if fc_img:
            fc_img.hAlign = "CENTER"
            story.append(fc_img)
        else:
            fc_style = ParagraphStyle(
                "FlowchartCode", parent=_BODY, fontName="Courier",
                fontSize=7, leading=9, textColor=_MUTED,
                backColor=_LIGHT_BG, leftIndent=6, rightIndent=6,
                spaceBefore=4, spaceAfter=4,
            )
            cleaned = flowchart_code.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            story.append(Paragraph(cleaned.replace("\n", "<br/>"), fc_style))
        story.append(Spacer(1, 4))
        story.append(_hr())

    # ================================================================
    # MARKET & AUDIENCE
    # ================================================================
    story.extend(_section_banner("Market Size"))
    story.append(_p(analysis.get("market_size", "-")))
    story.append(Spacer(1, 4))
    story.extend(_section_banner("Target Audience"))
    story.append(_p(analysis.get("target_audience", "-")))
    story.append(Spacer(1, 4))
    story.append(_hr())

    # ================================================================
    # SWOT ANALYSIS — colored quadrants
    # ================================================================
    story.extend(_section_banner("SWOT Analysis"))
    swot = analysis.get("swot") or {}

    _sw = ParagraphStyle("SwotBody", parent=_BODY, fontSize=9, leading=12)
    _sw_hdr = ParagraphStyle("SwotHdr", parent=_sw, fontName="Helvetica-Bold",
                             fontSize=10, textColor=colors.white)

    def _swot_cell(items: list[str], style=_sw) -> Paragraph:
        lines = "<br/>".join(f"\u2022 {s}" for s in (items or ["-"]))
        return Paragraph(lines, style)

    half = _AVAIL / 2
    swot_data = [
        [Paragraph("Strengths", _sw_hdr), Paragraph("Weaknesses", _sw_hdr)],
        [_swot_cell(swot.get("strengths")), _swot_cell(swot.get("weaknesses"))],
        [Paragraph("Opportunities", _sw_hdr), Paragraph("Threats", _sw_hdr)],
        [_swot_cell(swot.get("opportunities")), _swot_cell(swot.get("threats"))],
    ]
    swot_tbl = Table(swot_data, colWidths=[half, half])
    swot_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#27ae60")),
        ("BACKGROUND", (1, 0), (1, 0), colors.HexColor("#e74c3c")),
        ("BACKGROUND", (0, 1), (0, 1), colors.HexColor("#eafaf1")),
        ("BACKGROUND", (1, 1), (1, 1), colors.HexColor("#fdedec")),
        ("BACKGROUND", (0, 2), (0, 2), colors.HexColor("#2980b9")),
        ("BACKGROUND", (1, 2), (1, 2), colors.HexColor("#e67e22")),
        ("BACKGROUND", (0, 3), (0, 3), colors.HexColor("#ebf5fb")),
        ("BACKGROUND", (1, 3), (1, 3), colors.HexColor("#fef5e7")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("TEXTCOLOR", (0, 2), (-1, 2), colors.white),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(swot_tbl)
    story.append(Spacer(1, 4))
    story.append(_hr())

    # ================================================================
    # COMPETITOR INTELLIGENCE
    # ================================================================
    story.extend(_section_banner("Competitor Intelligence"))
    matrix = comp_intel.get("comparison_matrix") or []
    if matrix:
        comp_data = [[_p("<b>Name</b>"), _p("<b>Pricing</b>"),
                       _p("<b>Features</b>"), _p("<b>Threat</b>")]]
        for c in matrix:
            comp_data.append([
                _p(c.get("name", "-")),
                _p(c.get("pricing", "-")),
                _p(", ".join(c.get("key_features", ["-"]))),
                _p(c.get("threat_level", "-")),
            ])
        story.append(_data_table(
            comp_data,
            col_widths=[_AVAIL * 0.2, _AVAIL * 0.2, _AVAIL * 0.4, _AVAIL * 0.2],
        ))

        for c in matrix[:3]:
            story.append(Paragraph(c.get("name", "Competitor"), _H2))
            failure_modes = c.get("failure_modes") or []
            why_they_fail = c.get("why_they_fail") or []
            warning_signals = c.get("warning_signals") or []
            strategic_mistakes = c.get("strategic_mistakes") or []
            evidence = c.get("evidence") or []

            if failure_modes:
                story.append(_p("<b>How they fail:</b>"))
                story.extend(_bullet_list(failure_modes))
            if why_they_fail:
                story.append(_p("<b>Why they fail:</b>"))
                story.extend(_bullet_list(why_they_fail))
            if warning_signals:
                story.append(_p("<b>Warning signals:</b>"))
                story.extend(_bullet_list(warning_signals))
            if strategic_mistakes:
                story.append(_p("<b>Strategic mistakes:</b>"))
                story.extend(_bullet_list(strategic_mistakes))
            if evidence:
                story.append(_p("<b>Evidence:</b>"))
                story.extend(_bullet_list(evidence))
    our_adv = comp_intel.get("our_advantage")
    if our_adv:
        story.append(Paragraph("Our Advantage", _H2))
        story.append(_p(our_adv))
    story.append(Spacer(1, 4))
    story.append(_hr())

    # ================================================================
    # VC FUNDABILITY
    # ================================================================
    story.extend(_section_banner("Would I Fund This?"))
    vc_decision = analysis.get("would_i_fund", "maybe")
    vc_score = analysis.get("would_i_fund_score", "-")
    vc_subscores = analysis.get("would_i_fund_subscores") or {}
    vc_rationale = analysis.get("would_i_fund_rationale") or {}

    vc_data = [
        [_p("<b>Decision</b>"), _p(str(vc_decision).upper())],
        [_p("<b>Fundability Score</b>"), _p(f"{vc_score}/100")],
    ]
    story.append(_data_table(vc_data, col_widths=[_AVAIL * 0.35, _AVAIL * 0.65]))
    story.append(Spacer(1, 4))

    if vc_subscores:
        sub_data = [[_p("<b>Dimension</b>"), _p("<b>Score</b>")]]
        labels = {
            "team_execution": "Team Execution",
            "market_size_quality": "Market Size Quality",
            "moat_defensibility": "Moat Defensibility",
            "traction_signals": "Traction Signals",
            "risk_profile": "Risk Profile",
        }
        for key, label in labels.items():
            sub_data.append([_p(label), _p(f"{vc_subscores.get(key, '-')} / 100")])
        story.append(_data_table(sub_data, col_widths=[_AVAIL * 0.6, _AVAIL * 0.4]))
        story.append(Spacer(1, 4))

    overall_rationale = vc_rationale.get("overall")
    if overall_rationale:
        story.append(_p(f"<b>Rationale:</b> {overall_rationale}"))

    blockers = vc_rationale.get("why_not_fundable") or []
    if blockers:
        story.append(Paragraph("Why Not Fully Fundable Yet", _H2))
        story.extend(_bullet_list(blockers))
    story.append(Spacer(1, 4))
    story.append(_hr())

    # ================================================================
    # PUBLIC SENTIMENT
    # ================================================================
    story.extend(_section_banner("Public Sentiment"))
    sent_data = [
        [_p("<b>Platform</b>"), _p("<b>Sentiment</b>")],
        [_p("Reddit"), _p(str(sentiment.get("reddit_sentiment", "-")))],
        [_p("Twitter / X"), _p(str(sentiment.get("twitter_sentiment", "-")))],
        [_p("<b>Overall Score</b>"),
         _p(str(sentiment.get("overall_sentiment_score", "-")))],
    ]
    coverage = sentiment.get("source_coverage") or []
    if coverage:
        coverage_text = ", ".join(
            f"{item.get('label') or item.get('source', 'Community')}: {item.get('count', 0)}"
            for item in coverage
        )
        sent_data.append([_p("Coverage"), _p(coverage_text)])
    story.append(_data_table(sent_data, col_widths=[_AVAIL * 0.4, _AVAIL * 0.6]))
    story.append(Spacer(1, 4))
    story.append(_p(sentiment.get("summary", "-")))

    concerns = sentiment.get("key_concerns") or []
    if concerns:
        story.append(Paragraph("Key Concerns", _H2))
        story.extend(_bullet_list(concerns))

    positives = sentiment.get("key_positives") or []
    if positives:
        story.append(Paragraph("Key Positives", _H2))
        story.extend(_bullet_list(positives))
    story.append(Spacer(1, 4))
    story.append(_hr())

    # ================================================================
    # FAILURE CASE STUDIES
    # ================================================================
    story.extend(_section_banner("Failure Case Studies"))
    cases = failure.get("cases") or []
    if cases:
        case_data = [[_p("<b>Company</b>"), _p("<b>What Failed</b>"), _p("<b>Lesson</b>")]]
        for c in cases:
            case_data.append([
                _p(c.get("company", "-")),
                _p(c.get("what_failed", "-")),
                _p(c.get("lesson", "-")),
            ])
        story.append(_data_table(
            case_data,
            col_widths=[_AVAIL * 0.2, _AVAIL * 0.4, _AVAIL * 0.4],
        ))
    how_avoid = failure.get("how_to_avoid") or []
    if how_avoid:
        story.append(Paragraph("How to Avoid These Failures", _H2))
        story.extend(_bullet_list(how_avoid))
    story.append(Spacer(1, 4))
    story.append(_hr())

    # ================================================================
    # INVESTOR INTELLIGENCE
    # ================================================================
    story.extend(_section_banner("Investor Intelligence"))
    story.append(_p(investor.get("funding_landscape", "-")))
    story.append(_p(
        f"<b>Average Seed Round:</b> {investor.get('avg_seed_size', '-')}"
    ))
    investors_list = investor.get("investors") or []
    if investors_list:
        inv_data = [[_p("<b>Name</b>"), _p("<b>Firm</b>"),
                      _p("<b>Focus</b>"), _p("<b>Portfolio</b>")]]
        for inv in investors_list:
            inv_data.append([
                _p(inv.get("name", "-")),
                _p(inv.get("firm", "-")),
                _p(inv.get("focus", "-")),
                _p(", ".join(inv.get("notable_portfolio", ["-"]))),
            ])
        story.append(_data_table(
            inv_data,
            col_widths=[_AVAIL * 0.2, _AVAIL * 0.2, _AVAIL * 0.3, _AVAIL * 0.3],
        ))
    story.append(Spacer(1, 4))
    story.append(_hr())

    # ================================================================
    # RECOMMENDATIONS
    # ================================================================
    story.extend(_section_banner("Recommendations"))
    story.extend(_bullet_list(analysis.get("recommendations") or []))
    story.append(Paragraph("Go-to-Market Strategy", _H2))
    story.append(_p(analysis.get("go_to_market", "-")))
    story.append(Paragraph("Revenue Model", _H2))
    story.append(_p(analysis.get("revenue_model", "-")))
    story.append(Spacer(1, 4))
    story.append(_hr())

    # ================================================================
    # PRIORITIZED IMPROVEMENT SUGGESTIONS
    # ================================================================
    story.extend(_section_banner("How to Improve This Idea"))
    improvements = analysis.get("improvement_suggestions") or []
    if improvements:
        for item in sorted(improvements, key=lambda x: x.get("priority", 99))[:6]:
            priority = item.get("priority", "-")
            area = item.get("area", "operations")
            effort = item.get("effort", "medium")
            story.append(Paragraph(f"Priority {priority} — {area} ({effort} effort)", _H2))
            story.append(_p(f"<b>What to improve:</b> {item.get('what_to_improve', '-') }"))
            story.append(_p(f"<b>Why it matters:</b> {item.get('why_it_matters', '-') }"))
            story.append(_p(f"<b>How to do it:</b> {item.get('how_to_do_it', '-') }"))
            story.append(_p(f"<b>Expected impact:</b> {item.get('expected_impact', '-') }"))
            story.append(Spacer(1, 2))
    else:
        story.append(_p("No prioritized improvement suggestions were generated."))
    story.append(Spacer(1, 4))
    story.append(_hr())

    # ================================================================
    # WEB SOURCES
    # ================================================================
    web_sources = result.get("web_sources") or []
    if web_sources:
        story.extend(_section_banner("Sources"))
        for i, src in enumerate(web_sources, 1):
            title = src.get("title", "Untitled")
            url = src.get("url", "")
            story.append(_p(f"{i}. {title} — <font color='#0f3460'>{url}</font>"))

    # ================================================================
    # FOOTER
    # ================================================================
    story.append(Spacer(1, 24))
    story.append(_hr())
    story.append(Spacer(1, 6))
    story.append(Paragraph("Generated by FORMA — Business Idea Intelligence", _SMALL))

    doc.build(story, onFirstPage=_cover_page, onLaterPages=_later_pages)
    return buf.getvalue()
