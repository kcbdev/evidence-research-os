"""Model-assignment validation (guide §3.2).

Load-bearing rule: the judge must never adjudicate council output it
could have produced itself (self-preference bias). Enforced as a hard
startup check at graph compile — not a convention.
"""


def validate_model_assignment(council_models: dict[str, str],
                              judge_model: str,
                              meta_reviewer_model: str | None = None):
    if judge_model in council_models.values():
        raise ValueError(
            f"Judge model '{judge_model}' overlaps with a council model — "
            "this is a self-preference bias risk, refusing to start run."
        )
    # PBI-074 (guide Task 51 note): the Meta-Reviewer is a 6th role slot —
    # the same self-preference reasoning excludes it from the council.
    # Optional so pre-5b call sites (project-level council/judge pairs
    # with no meta concept) keep working unchanged.
    if meta_reviewer_model is not None and \
            meta_reviewer_model in council_models.values():
        raise ValueError(
            f"Meta-reviewer model '{meta_reviewer_model}' overlaps with a "
            "council model — this is a self-preference bias risk, "
            "refusing to start run."
        )
