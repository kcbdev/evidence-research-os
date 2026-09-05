"""Blackboard helpers over LabProjectStore: the Investigator/Scientist
read-write surface for sources and evidence (guide §4)."""
from app.models.evidence import Source, Evidence
from app.store.lab_project import LabProjectStore


def store_source(store: LabProjectStore, source: Source) -> Source:
    store.write_source(source)
    return source


def retrieve_evidence(store: LabProjectStore, claim_id: str) -> list[Evidence]:
    return [e for e in store.list_evidence() if claim_id in e.supports]
