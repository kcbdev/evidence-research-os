"""Batch-review N3: no test may download the fastembed model.

Autouse fixture — any test reaching the embedder without its own mock
fails LOUDLY here instead of downloading ~130MB on a cold machine.
Tests that need vectors mock `app.tools.semantic_index.embed`, which
shadows this guard for that test (embed() never touches _get_embedder
when mocked).
"""
import pytest


@pytest.fixture(autouse=True)
def _no_model_download(monkeypatch):
    def _forbidden():
        raise AssertionError(
            "embedder reached without a mock — tests must seam-mock "
            "app.tools.semantic_index.embed (no model download)")
    monkeypatch.setattr("app.tools.semantic_index._get_embedder",
                        _forbidden)
