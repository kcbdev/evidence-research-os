"""Tier A generic executor (PBI-058, Phase 5b guide).

A custom role is pure YAML (system prompt + tool list + model, no
code); this ONE generic node executes it: bounded ReAct loop (max 3
rounds) over the dispatch registry, transcript to debates/, result
merged into first_pass like any built-in first-pass finding. Budget
parity: every model attempt is charged (PBI-061 asserts this).
output_schema is a best-effort hint (spec decision): FINAL parsed as
JSON and validated when possible, kept as text otherwise — never a
second type system.
"""
import json
from pathlib import Path
from app.agents.client import call_model_resilient
from app.graph.budget import consume_calls
from app.store.lab_project import LabProjectStore
from app.tools.dispatch import tool_catalog

MAX_ROUNDS = 3


def _parse_tool_lines(text: str) -> list[tuple[str, str]]:
    calls = []
    for line in (text or "").splitlines():
        line = line.strip()
        if line.startswith("TOOL:"):
            rest = line[len("TOOL:"):].strip()
            if "|" in rest:
                name, _, args = rest.partition("|")
                calls.append((name.strip(), args.strip()))
    return calls


def _parse_final(text: str) -> str | None:
    finals = [line[len("FINAL:"):].strip() for line in (text or "").splitlines()
              if line.strip().startswith("FINAL:")]
    return "\n".join(finals) if finals else None


def make_prompt_agent_node(role_config: dict, lab_project_path: Path,
                           tools: dict):
    """role_config comes straight from methodology YAML — no code in
    defining the role, only in this one generic executor. tools are
    pre-resolved callables (unknown names fail at compile, not here)."""
    role_id = role_config["id"]
    system_prompt = role_config["system_prompt"]
    model_id = role_config["model"]
    tool_names = list(tools)
    output_schema = role_config.get("output_schema")

    def node(state) -> dict:
        store = LabProjectStore(lab_project_path, state["lab_project_id"])
        ctx = {"lab_project_path": str(lab_project_path),
               "project_id": state["lab_project_id"],
               "session_id": state.get("session_id", "adhoc"),
               "store": store}
        transcript = [f"TASK: {state.get('active_question', '')}",
                      tool_catalog(tool_names)]
        spent = 0
        final = None
        for _ in range(MAX_ROUNDS):
            text, attempts = call_model_resilient(
                model_id, system_prompt, "\n\n".join(transcript))
            spent += attempts
            final = _parse_final(text)
            calls = _parse_tool_lines(text)
            transcript.append(f"MODEL:\n{text}")
            if not calls:
                break  # FINAL (or silence) with no calls ends the loop
            for name, args_json in calls:
                try:
                    args = json.loads(args_json or "{}")
                    if not isinstance(args, dict):
                        raise ValueError("args must be a JSON object")
                    result = tools[name](ctx, **args)
                    transcript.append(f"TOOL {name} RESULT:\n{str(result)[:2000]}")
                except Exception as exc:
                    # Tool misuse is model error, not node failure: the
                    # error text goes back into the loop (bounded).
                    transcript.append(f"TOOL {name} ERROR: {exc}")
        if final is None:
            final = transcript[-1] if transcript else ""
        if output_schema:
            final = _validate_hint(final, output_schema, transcript)
        debates = Path(lab_project_path) / state["lab_project_id"] / "debates"
        debates.mkdir(parents=True, exist_ok=True)
        (debates / f"{role_id}.md").write_text(
            "\n\n".join(transcript) + "\n", encoding="utf-8")
        tmp = {"budget": state["budget"].model_copy()}
        consume_calls(tmp, spent)
        merged = dict(state.get("first_pass", {}) or {})
        merged[role_id] = final
        return {"first_pass": merged, "budget": tmp["budget"]}

    return node


def _validate_hint(final: str, schema_path: str, transcript: list) -> str:
    """Best-effort output_schema check ("module:Class"). Unparseable or
    invalid output keeps the text with a note — a hint, not a gate."""
    try:
        module_name, _, class_name = schema_path.partition(":")
        if not module_name or not class_name:
            raise ValueError("schema must look like 'module:Class'")
        import importlib
        model = getattr(importlib.import_module(module_name), class_name)
        model.model_validate(json.loads(final))
    except Exception as exc:
        transcript.append(f"SCHEMA NOTE (non-blocking): {exc}")
    return final
