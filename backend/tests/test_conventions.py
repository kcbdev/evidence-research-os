"""Convention guard (PBI-019 live-run regression): every text read/write
in app/ MUST pin encoding="utf-8" explicitly. Windows locale default
(cp1252) corrupted model output containing smart quotes (0x92 decode
crash in a debates transcript) — this test fails the suite if any
bare read_text()/write_text() call is ever reintroduced.
"""
from pathlib import Path

APP = Path(__file__).resolve().parent.parent / "app"


def test_no_bare_text_io():
    offenders = []
    for path in sorted(APP.rglob("*.py")):
        lines = path.read_text(encoding="utf-8").splitlines()
        for i, line in enumerate(lines):
            if "read_text()" in line:
                offenders.append(f"{path.name}:{i + 1}: bare read_text()")
            if "write_text(" in line:
                window = "\n".join(lines[i:i + 6])
                if 'encoding="utf-8"' not in window and \
                        "encoding='utf-8'" not in window:
                    offenders.append(
                        f"{path.name}:{i + 1}: write_text without encoding")
    assert offenders == [], "locale-dependent IO:\n" + "\n".join(offenders)
