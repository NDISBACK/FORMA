from __future__ import annotations

from typing import Any

from apify_client import ApifyClient

from backend.config import APIFY_API_KEY
from backend.convex_client import get_scrape_cache, set_scrape_cache
from backend.pipeline.community_signals import dedupe_community_signals, normalize_query

_client: ApifyClient | None = None
_CACHE_TTL_SECONDS = 60 * 60 * 6


def _get_client() -> ApifyClient:
    global _client
    if not APIFY_API_KEY:
        raise ValueError("APIFY_API_KEY is missing. Add it to your .env file.")
    if _client is None:
        _client = ApifyClient(token=APIFY_API_KEY)
    return _client


def _cache_key(kind: str, query: str, limit: int) -> str:
    return f"{kind}:{normalize_query(query)}:{limit}"


def _dedupe_records(
    records: list[dict[str, Any]],
    projector,
) -> list[dict[str, Any]]:
    deduped_meta = dedupe_community_signals([projector(record) for record in records])
    by_url = {str(record.get("url") or ""): record for record in records if record.get("url")}
    by_fallback = {
        f"{record.get('title', '')}|{record.get('text', '')}|{record.get('body', '')}": record
        for record in records
    }

    deduped: list[dict[str, Any]] = []
    for item in deduped_meta:
        url = str(item.get("url") or "")
        if url and url in by_url:
            deduped.append(by_url[url])
            continue
        fallback_key = f"{item.get('title', '')}|{item.get('text', '')}|{item.get('body', '')}"
        if fallback_key in by_fallback:
            deduped.append(by_fallback[fallback_key])
    return deduped


def scrape_reddit(query: str, *, max_posts: int = 20) -> list[dict[str, Any]]:
    """Search Reddit for posts/comments related to *query*."""
    cache_key = _cache_key("reddit", query, max_posts)
    cached = get_scrape_cache(cache_key)
    if cached:
        return cached

    client = _get_client()
    search_query = normalize_query(query)
    run_input = {
        "searches": [search_query],
        "maxPostCount": max_posts,
        "maxComments": 0,
        "proxy": {"useApifyProxy": True},
    }
    run = client.actor("trudax/reddit-scraper-lite").call(run_input=run_input)
    items = list(client.dataset(run["defaultDatasetId"]).iterate_items())

    normalized: list[dict[str, Any]] = []
    for item in items:
        normalized.append({
            "source": "reddit",
            "title": item.get("title", ""),
            "body": item.get("body", ""),
            "url": item.get("url", ""),
            "score": item.get("score", 0),
            "num_comments": item.get("numberOfComments", 0),
            "subreddit": item.get("subreddit", ""),
            "created_at": item.get("createdAt"),
        })
    deduped = _dedupe_records(
        normalized,
        lambda entry: {
            "source": "reddit",
            "title": entry.get("title"),
            "text": entry.get("body"),
            "body": entry.get("body"),
            "url": entry.get("url"),
        },
    )

    set_scrape_cache(
        cache_key,
        kind="reddit",
        payload=deduped,
        ttl_seconds=_CACHE_TTL_SECONDS,
    )
    return deduped


def scrape_twitter(query: str, *, max_tweets: int = 30) -> list[dict[str, Any]]:
    """Search Twitter/X for tweets related to *query*."""
    cache_key = _cache_key("twitter", query, max_tweets)
    cached = get_scrape_cache(cache_key)
    if cached:
        return cached

    client = _get_client()
    search_query = normalize_query(query)
    run_input = {
        "searchTerms": [search_query],
        "maxTweets": max_tweets,
        "addUserInfo": True,
        "scrapeTweetReplies": False,
    }
    run = client.actor("apidojo/tweet-scraper").call(run_input=run_input)
    items = list(client.dataset(run["defaultDatasetId"]).iterate_items())

    normalized: list[dict[str, Any]] = []
    for item in items:
        normalized.append({
            "source": "twitter",
            "text": item.get("full_text", item.get("text", "")),
            "url": item.get("url", ""),
            "likes": item.get("favorite_count", 0),
            "retweets": item.get("retweet_count", 0),
            "author": item.get("user", {}).get("name", ""),
            "created_at": item.get("created_at"),
        })
    deduped = _dedupe_records(
        normalized,
        lambda entry: {
            "source": "twitter",
            "text": entry.get("text"),
            "url": entry.get("url"),
        },
    )

    set_scrape_cache(
        cache_key,
        kind="twitter",
        payload=deduped,
        ttl_seconds=_CACHE_TTL_SECONDS,
    )
    return deduped
