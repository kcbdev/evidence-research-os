"""PBI-009 gate: tools against LOCAL fixtures only — no live web in gates.

- grep: real `rg` binary (installed PBI-009 via winget); the fixture
  adapts PATH for shells predating the install.
- fetch: ThreadingHTTPServer on 127.0.0.1 serving generated fixtures.
- blackboard: tmp LabProjectStore with repo-local git identity.
"""
import functools
import io
import os
import shutil
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from app.models.evidence import Source, Evidence
from app.store.lab_project import LabProjectStore
from app.tools import grep_project as grep_mod
from app.tools.blackboard import store_source, retrieve_evidence
from app.tools.fetch import fetch_url, fetch_pdf

TS = "2026-09-05T10:00:00Z"


def _ensure_rg_on_path():
    if shutil.which("rg"):
        return
    candidates = [
        Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft/WinGet/Packages",
        Path("C:/Program Files/ripgrep"),
    ]
    for base in candidates:
        if not base.is_dir():
            continue
        for rg in list(base.rglob("rg.exe"))[:1]:
            os.environ["PATH"] = str(rg.parent) + os.pathsep + os.environ["PATH"]
            return
    pytest.skip("rg binary not found — install ripgrep (PBI-009)")


def test_grep_returns_file_line_hits(tmp_path):
    _ensure_rg_on_path()
    (tmp_path / "a.yaml").write_text("id: C-1\nstatement: X improves Y.\n")
    (tmp_path / "b.yaml").write_text("id: C-2\nstatement: unrelated.\n")
    out = grep_mod.grep_project(str(tmp_path), "improves")
    assert "a.yaml:2:" in out and "X improves Y." in out
    assert "b.yaml" not in out
    assert grep_mod.grep_project(str(tmp_path), "no-such-token") == ""


def test_grep_docstring_nudges_iterative_use():
    doc = grep_mod.grep_project.__doc__ or ""
    assert "narrow" in doc and "read" in doc


@pytest.fixture()
def local_server(tmp_path):
    (tmp_path / "index.html").write_text(
        "<html><body><article><p>Vitamin D supports bone density.</p>"
        "</article></body></html>", encoding="utf-8")
    (tmp_path / "doc.pdf").write_bytes(_pdf_with_text("Hello PDF world"))
    handler = functools.partial(SimpleHTTPRequestHandler, directory=str(tmp_path))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_port}"
    server.shutdown()


def _pdf_with_text(text: str) -> bytes:
    writer = PdfWriter()
    page = writer.add_blank_page(width=200, height=200)
    stream = DecodedStreamObject()
    stream.set_data(f"BT /F1 12 Tf 10 100 Td ({text}) Tj ET".encode("latin-1"))
    font = DictionaryObject()
    font[NameObject("/Type")] = NameObject("/Font")
    font[NameObject("/Subtype")] = NameObject("/Type1")
    font[NameObject("/BaseFont")] = NameObject("/Helvetica")
    fonts = DictionaryObject()
    fonts[NameObject("/F1")] = writer._add_object(font)
    resources = DictionaryObject()
    resources[NameObject("/Font")] = fonts
    page[NameObject("/Resources")] = writer._add_object(resources)
    page[NameObject("/Contents")] = writer._add_object(stream)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def test_fetch_url_extracts_article_text(local_server):
    text = fetch_url(local_server + "/index.html")
    assert "Vitamin D supports bone density." in text
    assert "<article>" not in text


def test_fetch_pdf_extracts_page_text(local_server):
    assert "Hello PDF world" in fetch_pdf(local_server + "/doc.pdf")


def _make_store(tmp_path) -> LabProjectStore:
    store = LabProjectStore(tmp_path, "lp-tools")
    with store.repo.config_writer() as cfg:
        cfg.set_value("user", "name", "test")
        cfg.set_value("user", "email", "test@example.org")
    return store


def test_blackboard_store_and_retrieve(tmp_path):
    store = _make_store(tmp_path)
    src = Source(id="S-1", kind="official_data", url="https://e.org",
                 title="t", retrieved_at=TS, quality_tier=1)
    assert store_source(store, src) == src
    store.write_evidence(Evidence(id="E-1", source_id="S-1",
                                  location={"page": 1, "section": "s"},
                                  text_reference="t", supports=["C-1"],
                                  evidence_type="empirical", strength="high"))
    store.write_evidence(Evidence(id="E-2", source_id="S-1",
                                  location={"page": 2, "section": "s"},
                                  text_reference="t", supports=["C-9"],
                                  evidence_type="empirical", strength="low"))
    got = retrieve_evidence(store, "C-1")
    assert [e.id for e in got] == ["E-1"]
    assert retrieve_evidence(store, "C-missing") == []
