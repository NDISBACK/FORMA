from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse


_WS_RE = re.compile(r"\s+")
_NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")

_SOURCE_LABELS = {
    "reddit": "Reddit",
    "twitter": "X",
    "hackernews": "Hacker News",
    "producthunt": "Product Hunt",
    "github": "GitHub",
    "community": "Community",
}


def normalize_query(query: str) -> str:
    return _WS_RE.sub(" ", (query or "").strip()).lower()


def source_label(source: str | None) -> str:
    key = str(source or "community").strip().lower()
    return _SOURCE_LABELS.get(key, key.replace("_", " ").title())


def source_from_url(url: str | None) -> str:
    host = urlparse(url or "").netloc.lower()
    if "reddit.com" in host:
        return "reddit"
    if "twitter.com" in host or "x.com" in host:
        return "twitter"
    if "news.ycombinator.com" in host:
        return "hackernews"
    if "producthunt.com" in host:
        return "producthunt"
    if "github.com" in host:
        return "github"
    return "community"


def short_text(text: str | None, *, max_chars: int = 320) -> str:
    clean = _WS_RE.sub(" ", str(text or "")).strip()
    if len(clean) <= max_chars:
        return clean
    return clean[: max_chars - 1].rstrip() + "…"


def community_signal_key(item: dict[str, Any]) -> str:
    url = (item.get("url") or "").strip().lower()
    source = str(item.get("source") or "community").strip().lower()
    title = short_text(item.get("title"), max_chars=120).lower()
    text = short_text(item.get("text"), max_chars=180).lower()
    base = url or f"{source}|{title}|{text}"
    return _NON_ALNUM_RE.sub("-", base).strip("-")


def dedupe_community_signals(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in items:
        key = community_signal_key(item)
        if not key or key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def reddit_posts_to_signals(posts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    signals: list[dict[str, Any]] = []
    for post in posts:
        title = str(post.get("title") or "").strip()
        body = str(post.get("body") or "").strip()
        combined = " — ".join(part for part in (title, body) if part)
        signals.append(
            {
                "source": "reddit",
                "title": title,
                "text": short_text(combined, max_chars=420),
                "url": post.get("url", ""),
                "author": post.get("subreddit", ""),
                "created_at": post.get("created_at"),
                "engagement": post.get("score", 0),
            }
        )
    return dedupe_community_signals(signals)


def twitter_posts_to_signals(posts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    signals: list[dict[str, Any]] = []
    for post in posts:
        text = short_text(post.get("text"), max_chars=420)
        signals.append(
            {
                "source": "twitter",
                "title": "",
                "text": text,
                "url": post.get("url", ""),
                "author": post.get("author", ""),
                "created_at": post.get("created_at"),
                "engagement": (post.get("likes", 0) or 0) + (post.get("retweets", 0) or 0),
            }
        )
    return dedupe_community_signals(signals)


def web_results_to_signals(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    signals: list[dict[str, Any]] = []
    for item in results:
        source = item.get("source") or source_from_url(item.get("url"))
        title = str(item.get("title") or "").strip()
        text = short_text(item.get("text"), max_chars=420)
        signals.append(
            {
                "source": source,
                "title": title,
                "text": text,
                "url": item.get("url", ""),
                "author": item.get("author", ""),
                "created_at": item.get("published_date") or item.get("created_at"),
                "engagement": item.get("engagement", 0),
            }
        )
    return dedupe_community_signals(signals)


def summarize_source_coverage(signals: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts: dict[str, int] = {}
    for item in signals:
        source = str(item.get("source") or "community").strip().lower()
        counts[source] = counts.get(source, 0) + 1
    return [
        {"source": source, "label": source_label(source), "count": count}
        for source, count in sorted(counts.items(), key=lambda pair: (-pair[1], pair[0]))
    ]
