# Evidence Research OS — Implementation Guide (Phase 5: Methodology Registry)

Prerequisite: Phases 1-4 built and validated. This phase doesn't add new research capability — it makes the capability you already built **selectable and swappable** instead of hardcoded.

---

## What a Methodology is

A saved bundle of five things, referenced together by ID:

```yaml
# methodologies/deep-research-council-v1.yaml
id: deep-research-council-v1
name: "Deep Research Council"
description: "3-agent evidence council + citation audit — the original implementation"
is_default: true
compatible_modes: [research]

workflow:
  stages:
    - {id: trigger_classifier, node: trigger_classifier}
    - {id: plan, node: plan}
    - {id: independent_first_pass, node: independent_first_pass, roles: [scientist, investigator, skeptic]}
    - {id: evidence_extraction, node: evidence_extraction}
    - {id: conflict_detection, node: conflict_detection, loop_while: has_open_contradictions, loop_target: targeted_research}
    - {id: targeted_research, node: targeted_research}
    - {id: adversarial_review, node: adversarial_review}
    - {id: evidence_adjudication, node: evidence_adjudication}
    - {id: synthesis, node: synthesis}
    - {id: citation_audit, node: citation_audit, loop_while: audit_failed, loop_target: targeted_repair}
    - {id: targeted_repair, node: targeted_repair}
    - {id: human_checkpoint, node: human_checkpoint, interrupt: true}
    - {id: final_output, node: final_output}

tools:
  enabled: [search_web, fetch_url, fetch_pdf, grep_project, keyword_search,
            semantic_search, citation_verify, store_source, retrieve_evidence]

prompts:
  set: role-prompts/v1        # directory of versioned prompt files
  overrides: {}                # optional per-role text overrides, rarely used

skills:
  scientist: [hypothesis-decomposition]
  investigator: [source-retrieval, contradiction-search]
  skeptic: [adversarial-review-research]
  judge: [evidence-adjudication]

models:
  scientist: "..."
  investigator: "..."
  skeptic: "..."
  judge: "..."                 # validated != any council model, same rule as Phase 1

budget_defaults:
  max_model_calls: 50
  max_research_rounds: 5
```

**Deliberately not a general graph language.** Stages reference node functions and condition functions **by name from a fixed registry** — no arbitrary code in the YAML. This keeps methodology files safe to author, edit, and share without becoming a code-execution surface.

---

## Task 39: Node & condition registries (`app/graph/registry.py`)

```python
from app.graph import nodes

NODE_REGISTRY = {
    "trigger_classifier": nodes.trigger_classifier,
    "plan": nodes.plan,
    "independent_first_pass": nodes.independent_first_pass,
    "evidence_extraction": nodes.evidence_extraction,
    "conflict_detection": nodes.conflict_detection,
    "novelty_check": nodes.novelty_check,
    "targeted_research": nodes.targeted_research,
    "adversarial_review": nodes.adversarial_review,
    "evidence_adjudication": nodes.evidence_adjudication,
    "synthesis": nodes.synthesis,
    "citation_audit": nodes.citation_audit,
    "targeted_repair": nodes.targeted_repair,
    "human_checkpoint": nodes.human_checkpoint,
    "final_output": nodes.final_output,
    "methodology_analysis": nodes.methodology_analysis,   # Phase 4, academic tier
    "reproducibility_audit": nodes.reproducibility_audit,
}

CONDITION_REGISTRY = {
    "has_open_contradictions": lambda s: bool(s["open_contradictions"]),
    "audit_failed": lambda s: not s["audit_passed"],
}
```

Adding a new stage type later means adding one function here — not touching the compiler.

## Task 40: Methodology schema (`app/models/methodology.py`)

```python
from pydantic import BaseModel
from typing import Optional, Literal

class StageSpec(BaseModel):
    id: str
    node: str                      # must exist in NODE_REGISTRY
    roles: list[str] = []
    loop_while: Optional[str] = None    # must exist in CONDITION_REGISTRY
    loop_target: Optional[str] = None   # must be another stage id
    interrupt: bool = False

class WorkflowSpec(BaseModel):
    stages: list[StageSpec]

class ToolsSpec(BaseModel):
    enabled: list[str]

class PromptsSpec(BaseModel):
    set: str
    overrides: dict[str, str] = {}

class BudgetDefaults(BaseModel):
    max_model_calls: int = 50
    max_research_rounds: int = 5

class Methodology(BaseModel):
    id: str
    name: str
    description: str
    is_default: bool = False
    compatible_modes: list[Literal["research", "brainstorm", "academic"]]
    workflow: WorkflowSpec
    tools: ToolsSpec
    prompts: PromptsSpec
    skills: dict[str, list[str]]
    models: dict[str, str]
    budget_defaults: BudgetDefaults
```

## Task 41: Graph compiler (`app/graph/compile.py`)

```python
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.sqlite import SqliteSaver
from app.graph.state import LabProjectState
from app.graph.registry import NODE_REGISTRY, CONDITION_REGISTRY
from app.models.methodology import Methodology
from app.agents.config import validate_model_assignment

def build_graph_from_methodology(methodology: Methodology, checkpoint_path):
    validate_model_assignment(
        {k: v for k, v in methodology.models.items() if k != "judge"},
        methodology.models["judge"],
    )

    g = StateGraph(LabProjectState)
    stage_ids = [s.id for s in methodology.workflow.stages]

    for stage in methodology.workflow.stages:
        if stage.node not in NODE_REGISTRY:
            raise ValueError(f"Unknown node '{stage.node}' in methodology {methodology.id}")
        g.add_node(stage.id, NODE_REGISTRY[stage.node])

    g.add_edge(START, stage_ids[0])
    for i, stage in enumerate(methodology.workflow.stages):
        next_id = stage_ids[i + 1] if i + 1 < len(stage_ids) else END
        if stage.loop_while:
            cond = CONDITION_REGISTRY[stage.loop_while]
            g.add_conditional_edges(stage.id,
                lambda s, cond=cond, target=stage.loop_target, nxt=next_id:
                    target if cond(s) else nxt)
        else:
            g.add_edge(stage.id, next_id)

    interrupts = [s.id for s in methodology.workflow.stages if s.interrupt]
    saver = SqliteSaver.from_conn_string(str(checkpoint_path))
    return g.compile(checkpointer=saver, interrupt_before=interrupts)
```

This replaces the Phase 1/2 hardcoded `build_graph` function entirely — every methodology, including the default, now goes through this same compiler.

## Task 42: Migration — capture the current implementation as the default methodology

This is the literal answer to "set current implemented methodology as default, also saved." Write a one-time script, run once:

```python
# scripts/capture_default_methodology.py
"""
Run once, after Phase 5's compiler is in place. Serializes the exact
Phase 1-4 hardcoded pipeline into methodologies/deep-research-council-v1.yaml
and marks it as_default. From this point on, the hardcoded build_graph
function in app/graph/build.py should be deleted — the methodology file
IS the pipeline definition now.
"""
import yaml
from pathlib import Path

DEFAULT_METHODOLOGY = {
    "id": "deep-research-council-v1",
    "name": "Deep Research Council",
    "description": "3-agent evidence council + citation audit — the original implementation",
    "is_default": True,
    "compatible_modes": ["research"],
    "workflow": {"stages": [
        {"id": "trigger_classifier", "node": "trigger_classifier"},
        {"id": "plan", "node": "plan"},
        {"id": "independent_first_pass", "node": "independent_first_pass",
         "roles": ["scientist", "investigator", "skeptic"]},
        {"id": "evidence_extraction", "node": "evidence_extraction"},
        {"id": "conflict_detection", "node": "conflict_detection",
         "loop_while": "has_open_contradictions", "loop_target": "targeted_research"},
        {"id": "targeted_research", "node": "targeted_research"},
        {"id": "adversarial_review", "node": "adversarial_review"},
        {"id": "evidence_adjudication", "node": "evidence_adjudication"},
        {"id": "synthesis", "node": "synthesis"},
        {"id": "citation_audit", "node": "citation_audit",
         "loop_while": "audit_failed", "loop_target": "targeted_repair"},
        {"id": "targeted_repair", "node": "targeted_repair"},
        {"id": "human_checkpoint", "node": "human_checkpoint", "interrupt": True},
        {"id": "final_output", "node": "final_output"},
    ]},
    "tools": {"enabled": ["search_web", "fetch_url", "fetch_pdf", "grep_project",
                           "keyword_search", "semantic_search", "citation_verify",
                           "store_source", "retrieve_evidence"]},
    "prompts": {"set": "role-prompts/v1", "overrides": {}},
    "skills": {
        "scientist": ["hypothesis-decomposition"],
        "investigator": ["source-retrieval", "contradiction-search"],
        "skeptic": ["adversarial-review-research"],
        "judge": ["evidence-adjudication"],
    },
    "models": {},   # fill from your actual current project.yaml council_models/judge_model
    "budget_defaults": {"max_model_calls": 50, "max_research_rounds": 5},
}

def main():
    root = Path("methodologies")
    root.mkdir(exist_ok=True)
    (root / "deep-research-council-v1.yaml").write_text(yaml.safe_dump(DEFAULT_METHODOLOGY))
    print("Captured default methodology. Delete app/graph/build.py's hardcoded build_graph now.")

if __name__ == "__main__":
    main()
```

Do the same for the Brainstorm and Academic pipelines you already built (Phases 2 and 4) — `brainstorm-ideation-v1.yaml` (swap `conflict_detection`→`novelty_check`, add Ideator role/skills), `academic-publication-v1.yaml` (adds `methodology_analysis`/`reproducibility_audit` stages before synthesis). All three become saved, selectable methodologies from day one of this phase — you're not just capturing one pipeline, you're capturing the three you've already built.

## Task 43: Methodology store + API

```python
# app/store/methodology.py
import yaml
from pathlib import Path
from app.models.methodology import Methodology

class MethodologyStore:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(exist_ok=True)

    def list(self) -> list[Methodology]:
        return [Methodology(**yaml.safe_load(f.read_text()))
                for f in self.root.glob("*.yaml")]

    def get(self, id: str) -> Methodology:
        return Methodology(**yaml.safe_load((self.root / f"{id}.yaml").read_text()))

    def save(self, m: Methodology):
        (self.root / f"{m.id}.yaml").write_text(yaml.safe_dump(m.model_dump()))

    def get_default(self) -> Methodology:
        for m in self.list():
            if m.is_default:
                return m
        raise ValueError("No default methodology set")

    def set_default(self, id: str):
        for m in self.list():
            if m.is_default and m.id != id:
                m.is_default = False
                self.save(m)
        target = self.get(id)
        target.is_default = True
        self.save(target)
```

```python
# app/api/methodologies.py
from fastapi import APIRouter
from app.store.methodology import MethodologyStore
from app.models.methodology import Methodology

router = APIRouter()
store = MethodologyStore(METHODOLOGIES_ROOT)

@router.get("/methodologies")
def list_methodologies():
    return store.list()

@router.post("/methodologies")
def create_methodology(m: Methodology):
    store.save(m)
    return m

@router.get("/methodologies/{id}")
def get_methodology(id: str):
    return store.get(id)

@router.post("/methodologies/{id}/set-default")
def set_default(id: str):
    store.set_default(id)
    return {"default": id}
```

## Task 44: Wire methodology selection into run-start

```python
# app/api/runs.py, modify start_run
@router.post("/lab-projects/{project_id}/runs")
def start_run(project_id: str, payload: dict):
    methodology_id = payload.get("methodology_id")
    methodology = (store.get(methodology_id) if methodology_id
                   else store.get_default())
    graph = build_graph_from_methodology(methodology, checkpoint_path)
    # ... proceed as before, using methodology.models / methodology.budget_defaults
    # as the run's actual config instead of project.yaml's council_models
```

`project.yaml`'s `council_models`/`judge_model`/budget fields become **per-Lab-Project overrides**, not the primary config — a run uses the selected methodology's models/budget unless the Lab Project explicitly overrides them. Keep that precedence explicit and documented, it's the kind of thing that causes confusing bugs if implicit.

## Task 45: UI — Methodology management

- **`/settings/methodologies`**: list of saved methodologies (name, description, compatible modes, default badge), "Set as default" action, "New Methodology" (start with a YAML editor — a visual workflow builder is real scope, not v1)
- **Run-start dialog** (wherever `POST /runs` is triggered from the Lab Project overview): methodology dropdown, defaulting to whichever is marked default, filtered by the Lab Project's mode

**Phase 5 done when:** you can list at least 3 methodologies (the captured research/brainstorm/academic pipelines), start a run explicitly selecting a non-default one, confirm it actually changes which nodes execute, and confirm `set-default` correctly changes which methodology a run uses when none is specified.

---

## Why this ordering matters

Building the Methodology registry before Phases 1-4 exist would mean designing an abstraction against pipelines that don't exist yet — guessing what needs to be swappable instead of knowing from three built, working pipelines (research/brainstorm/academic) what actually varies between them. That's exactly the premature-infra trap flagged earlier in the plan, one level up the stack.
