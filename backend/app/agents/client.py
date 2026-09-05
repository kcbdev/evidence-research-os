"""OpenRouter client (OpenAI-compatible endpoint, guide §3.1)."""
import os
from openai import OpenAI


def get_client() -> OpenAI:
    return OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=os.environ["OPENROUTER_API_KEY"],
    )


def call_model(model_id: str, system: str, user: str) -> str:
    client = get_client()
    resp = client.chat.completions.create(
        model=model_id,
        messages=[{"role": "system", "content": system},
                  {"role": "user", "content": user}],
    )
    content = resp.choices[0].message.content
    assert content is not None, f"empty completion from {model_id}"
    return content
