"""Pydantic v2 domain models — the schema contract (spec §4.2, guide §1.1).

Adapted from the implementation guide §1.1 plus the Idea schema from
spec §4.2 (I-008). Contradiction/Experiment object types (spec §2.3) are
deliberately absent: Phase 1 tracks contradictions as Task objects +
state ids (guide §2.3), and experiments nest inside Idea until
Phase 2 gives them their own lifecycle. Their models arrive with
their consumer PBIs — not here.

Micro-decisions: Idea carries a `type` discriminator like the other
objects (spec I-008 omits the line; added for uniformity);
novelty_check/proposed_experiment are Optional (an idea exists before
it is novelty-checked).
"""
from pydantic import BaseModel, Field
from typing import Literal, Optional
from datetime import datetime

SourceKind = Literal[
    "primary_paper", "systematic_review", "institutional_report",
    "official_data", "technical_doc", "journalism",
    "expert_commentary", "product_analogue", "web_content",
]


class Source(BaseModel):
    id: str
    type: Literal["source"] = "source"
    kind: SourceKind
    url: str
    title: str
    retrieved_at: datetime
    quality_tier: int = Field(ge=1, le=9)
    independence_cluster: Optional[str] = None


ClaimStatus = Literal[
    "SUPPORTED", "STRONGLY_SUPPORTED", "WEAKLY_SUPPORTED",
    "DISPUTED", "CONTRADICTED", "INSUFFICIENT_EVIDENCE", "UNVERIFIABLE",
]


class Confidence(BaseModel):
    source_quality: float
    methodological_strength: float
    independent_confirmation: float
    contradiction_level: float
    overall: float


class Claim(BaseModel):
    id: str
    type: Literal["claim"] = "claim"
    statement: str
    supporting_sources: list[str] = []
    opposing_sources: list[str] = []
    status: ClaimStatus = "INSUFFICIENT_EVIDENCE"
    confidence: Optional[Confidence] = None
    adjudicated_by: Optional[str] = None


class Evidence(BaseModel):
    id: str
    type: Literal["evidence"] = "evidence"
    source_id: str
    location: dict  # {"page": int, "section": str}
    text_reference: str
    supports: list[str] = []
    evidence_type: Literal["empirical", "argumentative", "analogical"]
    strength: Literal["high", "medium", "low"]


class NoveltyCheck(BaseModel):
    status: Literal["novel", "adjacent", "duplicate"]
    against: list[str] = []


class ProposedExperiment(BaseModel):
    hypothesis: str
    falsification_condition: str
    feasibility: Literal["high", "medium", "low"]


class Idea(BaseModel):
    id: str
    type: Literal["idea"] = "idea"
    statement: str
    novelty_check: Optional[NoveltyCheck] = None
    proposed_experiment: Optional[ProposedExperiment] = None
    status: Literal[
        "proposed", "under_skeptic_review", "promoted_to_claim", "rejected"
    ] = "proposed"


class Task(BaseModel):
    id: str
    type: Literal["task"] = "task"
    question: str
    reason: str
    required_sources: list[str] = []
    assigned_agent: Literal["scientist", "investigator", "skeptic"]


class Decision(BaseModel):
    id: str
    what: str
    why: str
    timestamp: datetime


class AuditCheck(BaseModel):
    stage: Literal["existence", "pincite", "support_match"]
    status: Literal["PASS", "WARNING", "FAIL"]
    detail: str = ""


class ClaimAudit(BaseModel):
    claim_id: str
    evidence_id: Optional[str] = None  # None = claim-level citation sweep
    checks: list[AuditCheck] = []


class AuditRun(BaseModel):
    id: str
    type: Literal["audit_run"] = "audit_run"
    created_at: datetime
    results: list[ClaimAudit] = []


class BudgetState(BaseModel):
    max_model_calls: int = 50
    max_research_rounds: int = 5
    calls_used: int = 0
    rounds_used: int = 0

    def exhausted(self) -> bool:
        return self.calls_used >= self.max_model_calls or self.rounds_used >= self.max_research_rounds


class ProjectMeta(BaseModel):
    id: str
    title: str
    mode: Literal["research", "brainstorm", "academic"] = "research"
    question: str
    created_at: datetime
    budget: BudgetState = BudgetState()
    council_models: dict[str, str]  # {"scientist": "...", "investigator": "...", "skeptic": "..."}
    judge_model: str
    # PBI-011: retrieval volume caps (spec §10). MVP defaults are generous
    # on purpose — the mechanism (not the numbers) is what's proven here.
    max_sources: int = 50
    max_sources_per_claim: int = 5
    # PBI-020: reversible archive flag (spec §8 DELETE semantics).
    # Archived projects vanish from listings but keep full history.
    archived: bool = False
