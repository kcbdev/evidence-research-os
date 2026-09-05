"""Web + PDF fetch (guide §4.2). Every fetch path must be wrapped by the
PBI-010 cache before agent use — these functions are the raw fetchers."""
import httpx
import trafilatura
from pypdf import PdfReader
import io


def fetch_url(url: str) -> str:
    resp = httpx.get(url, timeout=15, follow_redirects=True)
    return trafilatura.extract(resp.text) or ""


def fetch_pdf(url: str) -> str:
    resp = httpx.get(url, timeout=30)
    reader = PdfReader(io.BytesIO(resp.content))
    return "\n".join(page.extract_text() or "" for page in reader.pages)
