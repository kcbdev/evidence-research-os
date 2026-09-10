# Evidence Research OS — Implementation Guide (Phase 5b: User-Authorable Logic)

Extends Phase 5. Read that first — this changes one of its explicit design decisions and you should know which one and why.

## The decision being reversed

Phase 5 said: methodology stages reference nodes/conditions **by name from a fixed registry**, no arbitrary code in YAML. That was framed as a safety boundary. It's the right call when authors might be untrusted. **You are the only author of this system.** The actual risk with pure-registry-only isn't security — it's that every genuinely new idea (a new agent persona, a new branching rule, a new scoring algorithm) requires a code change and redeploy before you can even try it. That's friction you don't need to pay for a threat model that doesn't apply to a single-operator tool.

So: three tiers, matched to how much new logic something actually needs. Use the lowest tier that covers what you're building — most new ideas fit Tier A or B and never need real code.

---

## Tier A — New agent roles via prompt + tools only (no code, ever)

Covers: a new specialized reviewer, a new persona, a new evaluation angle — anything expressible as "given this system prompt and this tool list, do a ReAct loop and produce this output shape."

### Generic executor (`app/graph/generic_node.py`)

```python
from app.agents.client import call_model
from app.tools.dispatch import get_tools_for_names

def make_prompt_agent_node(role_config: dict):
    """role_config comes straight from methodology YAML — no code involved
    in defining the role, only in this one generic executor."""
    system_prompt = role_config["system_prompt"]
    tool_names = role_config.get("tools", [])
    model_id = role_config["model"]
    output_schema = role_config.get("output_schema")  # optional Pydantic model path

    def node(state):
        tools = get_tools_for_names(tool_names)
        result = run_react_loop(model_id, system_prompt, state, tools)
        if output_schema:
            result = validate_against_schema(result, output_schema)
        # write result into the evidence graph like any built-in node would
        return state

    return node
```

### Methodology YAML addition

```yaml
custom_roles:
  - id: red_team_reviewer
    system_prompt: |
      You review claims specifically for commercial viability objections
      a skeptical investor would raise — separate from the Skeptic's
      epistemic/methodological review.
    tools: [grep_project, keyword_search]
    model: "..."
    output_schema: null   # or a path to a Pydantic model for structured output
```

The compiler (Phase 5's `build_graph_from_methodology`) checks `custom_roles` first and builds a `make_prompt_agent_node` for each; only falls through to `NODE_REGISTRY` for built-ins. **This alone probably covers 80% of what you'll want to author** — it's pure YAML, no code, no redeploy.

---

## Tier B — New conditions via a safe expression language (no code, sandboxed eval)

Covers: new branching logic that isn't a full new agent, just "loop back if X" where X is a simple check over state.

Use `simpleeval` — a restricted expression evaluator (no imports, no attribute access to dunders, no arbitrary function calls) designed exactly for this: letting end users write conditions without giving them a code-execution surface.

```python
# app/graph/expr_condition.py
from simpleeval import simple_eval

def make_expr_condition(expression: str):
    def condition(state: dict) -> bool:
        # only plain state fields are exposed — no access to the filesystem,
        # no imports, no method calls beyond basic comparisons/arithmetic
        return bool(simple_eval(expression, names=state))
    return condition
```

### Methodology YAML addition

```yaml
workflow:
  stages:
    - id: conflict_detection
      node: conflict_detection
      loop_condition: "len(open_contradictions) > 2"   # NEW: inline expression
      loop_target: targeted_research
```

Compiler change: if a stage has `loop_condition` (expression string) instead of `loop_while` (registry name), wrap it with `make_expr_condition` instead of looking it up in `CONDITION_REGISTRY`. Both forms coexist — registry names for the conditions you use often and want named/reusable, inline expressions for one-off branching you're experimenting with.

This is genuinely safe even if you later loosen the single-operator assumption — `simpleeval` is the right tool specifically because it doesn't require trusting the author, unlike Tier C below.

---

## Tier C — Real custom node/tool code (trusted, because single-operator)

Covers: an actual new algorithm — a bespoke scoring formula, a new dedup strategy, a new tool integration — that can't be expressed as prompt+tools or a simple expression.

### Discovery mechanism (`app/graph/custom_nodes.py`)

```python
import importlib.util
from pathlib import Path

CUSTOM_NODES_DIR = Path("custom_nodes")

def discover_custom_nodes() -> dict:
    """Each file in custom_nodes/ must define NODE_ID: str and
    def run(state) -> state. Loaded at graph-build time, merged with
    the built-in NODE_REGISTRY. No sandboxing — this runs as trusted
    code, same trust level as the rest of the backend, because you
    wrote it."""
    discovered = {}
    for f in CUSTOM_NODES_DIR.glob("*.py"):
        spec = importlib.util.spec_from_file_location(f.stem, f)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        discovered[mod.NODE_ID] = mod.run
    return discovered
```

```python
# app/graph/compile.py — merge at build time
from app.graph.registry import NODE_REGISTRY
from app.graph.custom_nodes import discover_custom_nodes

def get_full_node_registry():
    return {**NODE_REGISTRY, **discover_custom_nodes()}
```

### Example custom node (`custom_nodes/experiment_scorer.py`)

```python
NODE_ID = "experiment_scorer"

def run(state):
    """Bespoke scoring of proposed experiments by feasibility x novelty.
    This is exactly the kind of thing that doesn't fit Tier A (it's a
    deterministic formula, not a prompted judgment) or Tier B (it needs
    real computation, not a one-line expression)."""
    from app.store.lab_project import LabProjectStore
    store = LabProjectStore(ROOT, state["lab_project_id"])
    for idea in store.list_ideas():
        if idea.proposed_experiment:
            score = _score(idea.proposed_experiment)
            # write score back, e.g. into idea.novelty_check or a new field
    return state

def _score(exp) -> float:
    feasibility_weight = {"high": 1.0, "medium": 0.6, "low": 0.3}[exp.feasibility]
    return feasibility_weight  # extend with real logic
```

### Guardrails worth keeping even without sandboxing

- **Route through the existing tool layer, don't bypass it.** A custom node that fetches a URL directly instead of via `cached_fetch`/`fetch_url` breaks the caching and audit-trail guarantees everything else respects. This is a code-review discipline for future-you, not an enforced boundary — worth a comment convention (`# TOOL-LAYER: ...`) so it's easy to spot violations later.
- **Version custom nodes like everything else.** They live in the same git-tracked repo as the rest of the backend — a bad custom node is a bad commit, revertable the same way.
- **Custom nodes still respect the budget controller** — they read/write `state["budget"]` the same as built-in nodes; nothing exempts them from `max_model_calls`/`max_research_rounds` if they call models.
- **If you ever add a second human as an author** (a collaborator, not just you), Tier C stops being free — that's the point where WASM sandboxing (`extism`/`wasmtime`) or at minimum a container-per-custom-node execution model becomes worth the complexity. Not needed today; worth flagging so it doesn't get forgotten if the trust model ever changes.

---

## Methodology schema addition (`app/models/methodology.py`)

```python
class CustomRoleSpec(BaseModel):
    id: str
    system_prompt: str
    tools: list[str] = []
    model: str
    output_schema: Optional[str] = None

class StageSpec(BaseModel):
    id: str
    node: str
    roles: list[str] = []
    loop_while: Optional[str] = None       # registry condition name (Tier B, named)
    loop_condition: Optional[str] = None   # inline simpleeval expression (Tier B, ad hoc)
    loop_target: Optional[str] = None
    interrupt: bool = False

class Methodology(BaseModel):
    # ...unchanged fields from Phase 5...
    custom_roles: list[CustomRoleSpec] = []   # Tier A
```

---

## Net effect

You can now author a genuinely new methodology — new agent persona, new branching rule, or new algorithmic node — entirely through YAML for the first two tiers, and through a single dropped-in Python file for the third, without touching the compiler or the built-in registry. The compiler's job stays the same across all three tiers: build a graph from a methodology spec. What changed is how much of that spec can be authored without a code change to the *engine itself* — which was always the actual goal; the registry-only version of Phase 5 just drew that line one tier too conservatively for a tool only you operate.

**Done when:** you've authored one new methodology using only Tier A/B (no custom_nodes file) and one using a Tier C custom node, run both against a real Lab Project, and confirmed the budget controller and tool-output cache behave identically to built-in nodes in both cases.
