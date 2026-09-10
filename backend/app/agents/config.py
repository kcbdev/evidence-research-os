"""Model-assignment validation (guide §3.2).

Load-bearing rule: the judge must never adjudicate council output it
could have produced itself (self-preference bias). Enforced as a hard
startup check at graph compile — not a convention.
"""


def validate_model_assignment(council_models: dict[str, str], judge_model: str):
    if judge_model in council_models.values():
        raise ValueError(
            f"Judge model '{judge_model}' overlaps with a council model — "
            "this is a self-preference bias risk, refusing to start run."
        )
