"""OpenRouter client (OpenAI-compatible endpoint, guide §3.1)."""
import os
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
    client = get_client()
    resp = client.chat.completions.create(
        model=model_id,
        messages=[{"role": "system", "content": system},
                  {"role": "user", "content": user}],
    )
    content = resp.choices[0].message.content
    if content is None:
        raise ValueError(f"empty completion from {model_id}")
    return content
