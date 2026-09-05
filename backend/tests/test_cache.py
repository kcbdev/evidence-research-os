"""PBI-010 gate: miss fetches once, hit never refetches, sessions isolated."""
import re
import pytest
from app.tools.cache import cache_key, cached_fetch


def test_cache_key_stable_hex16():
    k1, k2 = cache_key("https://e.org/a"), cache_key("https://e.org/a")
    assert k1 == k2 and re.fullmatch(r"[0-9a-f]{16}", k1)
    assert cache_key("https://e.org/b") != k1


def test_miss_fetches_hit_reads_cache(tmp_path):
    calls = []

    def fetch(url):
        calls.append(url)
        return "content!"

    r1 = cached_fetch(tmp_path, "s1", "https://e.org/a", fetch)
    r2 = cached_fetch(tmp_path, "s1", "https://e.org/a", fetch)
    assert (r1, r2) == ("content!", "content!")
    assert calls == ["https://e.org/a"]  # fetched exactly once


def test_preseeded_cache_never_calls_fetch(tmp_path):
    def boom(url):
        raise AssertionError("fetch must not run on cache hit")

    cache_dir = tmp_path / "tool_outputs" / "s1"
    cache_dir.mkdir(parents=True)
    (cache_dir / f"{cache_key('https://e.org/a')}.txt").write_text("seeded")
    assert cached_fetch(tmp_path, "s1", "https://e.org/a", boom) == "seeded"


def test_sessions_isolated_and_urls_distinct(tmp_path):
    calls = []

    def fetch(url):
        calls.append(url)
        return "x"

    cached_fetch(tmp_path, "s1", "https://e.org/a", fetch)
    cached_fetch(tmp_path, "s2", "https://e.org/a", fetch)  # new session refetches
    cached_fetch(tmp_path, "s1", "https://e.org/b", fetch)  # new URL refetches
    assert calls == ["https://e.org/a", "https://e.org/a", "https://e.org/b"]
    files = list((tmp_path / "tool_outputs" / "s1").glob("*.txt"))
    assert len(files) == 2
