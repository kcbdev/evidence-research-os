"""OpenRouter client (OpenAI-compatible endpoint, guide §3.1)."""
import os
import time
import openai
from openai import OpenAI


def get_client() -> OpenAI:
    try:
        api_key = os.environ["OPENROUTER_API_KEY"]
    except KeyError:
        raise RuntimeError(
            "OPENROUTER_API_KEY is not set — export it before starting a run."
        )
    return OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=api_key,
    )


def call_model(model_id: str, system: str, user: str) -> str:
    """Single attempt (PBI-008). Raises ValueError on empty content,
    RuntimeError on missing key, openai.APIError on transport/status
    failures. Prefer call_model_resilient (PBI-022) in graph nodes."""
    client = get_client()
    resp = client.chat.completions.create(
        model=model_id,
        messages=[{"role": "system", "content": system},
                  {"role": "user", "content": user}],
    )
    content = resp.choices[0].message.content
    if not content:
        raise ValueError(f"empty completion from {model_id}")
    return content


def call_model_resilient(model_id: str, system: str, user: str, *,
                         max_attempts: int = 3,
                         sleep=time.sleep) -> tuple[str, int]:
    """Bounded retry around call_model. Retries empty content and
    transport/status failures (openai.APIError covers connection,
    timeout, 429, 5xx); anything else raises immediately. Returns
    (content, attempts_made) so callers charge EVERY attempt to the
    budget — retries are never free calls. Linear backoff (1s, 2s…);
    after exhaustion reraises the last failure (APIError) or a
    ValueError for persistent emptiness."""
    last_failure: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            return call_model(model_id, system, user), attempt
        except ValueError as exc:
            last_failure = exc
        except openai.APIError as exc:
            last_failure = exc
        if attempt < max_attempts:
            sleep(attempt)
    assert last_failure is not None
    raise last_failure
