"""Web + PDF fetch (guide §4.2). Every fetch path must be wrapped by the
PBI-010 cache before agent use — these functions are the raw fetchers."""
from pathlib import Path
import httpx
import trafilatura
from pypdf import PdfReader
import io


def fetch_url(url: str) -> str:
    resp = httpx.get(url, timeout=15, follow_redirects=True)
    resp.raise_for_status()  # 404/500 must read as failure, never as ""
    return trafilatura.extract(resp.text) or ""


def extract_pdf(source) -> str:
    """Local-path counterpart to fetch_pdf: bytes, str path, or Path."""
    if isinstance(source, (str, Path)):
        data = Path(source).read_bytes()
    else:
        data = source
    reader = PdfReader(io.BytesIO(data))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def fetch_pdf(url: str) -> str:
    resp = httpx.get(url, timeout=30, follow_redirects=True)
    resp.raise_for_status()
    return extract_pdf(resp.content)
