"""PBI-010 gate: miss fetches once, hit never refetches, reuse crosses
sessions (spec: re-running reuses the cache), kinds don't collide,
and graph/agents can never import raw fetch (ban test)."""
import re
from app.tools import cache as cache_mod
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
    (cache_dir / f"{cache_key('https://e.org/a')}.html.txt").write_text("seeded")
    assert cached_fetch(tmp_path, "s1", "https://e.org/a", boom) == "seeded"


def test_rerun_reuses_cache_across_sessions(tmp_path):
    calls = []

    def fetch(url):
        calls.append(url)
        return "x"

    cached_fetch(tmp_path, "s1", "https://e.org/a", fetch)
    r = cached_fetch(tmp_path, "s2", "https://e.org/a", fetch)  # re-run: no refetch
    assert r == "x" and calls == ["https://e.org/a"]
    # ...but the hit is recorded in the new session's dir (provenance):
    assert (tmp_path / "tool_outputs" / "s2").is_dir()
    cached_fetch(tmp_path, "s1", "https://e.org/b", fetch)  # new URL refetches
    assert calls == ["https://e.org/a", "https://e.org/b"]


def test_html_pdf_keys_do_not_collide(tmp_path):
    def fetch(url):
        return f"fetched:{url}"

    a = cached_fetch(tmp_path, "s1", "https://e.org/doc", fetch, kind="html")
    b = cached_fetch(tmp_path, "s1", "https://e.org/doc", fetch, kind="pdf")
    assert (a, b) == ("fetched:https://e.org/doc", "fetched:https://e.org/doc")
    assert len(list((tmp_path / "tool_outputs" / "s1").glob("*.txt"))) == 2


def test_wrappers_delegate_to_raw_fetchers(tmp_path, monkeypatch):
    calls = []

    def fake_fetch(url):
        calls.append(url)
        return "wrapped!"

    monkeypatch.setattr(cache_mod, "fetch_url", fake_fetch)
    monkeypatch.setattr(cache_mod, "fetch_pdf", fake_fetch)
    assert cache_mod.cached_fetch_url(tmp_path, "s1", "https://e.org/a") == "wrapped!"
    assert cache_mod.cached_fetch_pdf(tmp_path, "s1", "https://e.org/a") == "wrapped!"
    assert calls == ["https://e.org/a", "https://e.org/a"]  # kind-split keys


def test_no_raw_fetch_imports_in_graph_or_agents():
    import re as _re
    root = __import__("pathlib").Path(__file__).resolve().parent.parent / "app"
    offenders = []
    for sub in ("graph", "agents"):
        for path in (root / sub).rglob("*.py"):
            text = path.read_text(encoding="utf-8")
            if _re.search(r"from app\.tools\.fetch import.*\bfetch_(url|pdf)\b"
                          r"|from app\.tools import fetch\b", text):
                offenders.append(str(path))
    assert offenders == [], f"raw fetch imports bypass the cache: {offenders}"
