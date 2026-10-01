"""Corpus honesty checks: every doc carries provenance headers, repealed Acts
are marked superseded, and the current-Code documents exist and cite PIB.

These tests are the automation behind the Phase 3 rule "don't invent facts —
cite an official source". They run offline over rag/sample_docs/*.txt.
"""
from pathlib import Path

DOCS = Path(__file__).resolve().parent.parent / "rag" / "sample_docs"

REPEALED_ACT_DOCS = {
    "minimum-wages-act.txt",
    "minimum-wages-hindi.txt",
    "payment-of-wages-act.txt",
    "equal-remuneration-act.txt",
    "contract-labour-act.txt",
    "interstate-migrant-workmen-act.txt",
    "bocw-act.txt",
    "building-workers-welfare-cess.txt",
    "workers-compensation.txt",
    "maternity-benefit-act.txt",
    "unorganised-workers-social-security.txt",
}

CURRENT_CODE_DOCS = [
    "code-on-wages-2019.txt",
    "code-on-social-security-2020.txt",
    "construction-osh-code-2020.txt",
    "industrial-relations-code-2020.txt",
]


def _header(text: str) -> str:
    return text.partition("---")[0]


def test_all_docs_have_status_header():
    for path in sorted(DOCS.glob("*.txt")):
        header = _header(path.read_text(encoding="utf-8"))
        assert "STATUS:" in header, f"{path.name} missing STATUS header"


def test_valid_status_values_only():
    for path in sorted(DOCS.glob("*.txt")):
        header = _header(path.read_text(encoding="utf-8"))
        status = next(
            ln.split(":", 1)[1].strip() for ln in header.splitlines() if ln.startswith("STATUS:")
        )
        assert status in {"current", "superseded", "active", "draft"}, path.name


def test_no_blanket_placeholder_date_remains():
    for path in sorted(DOCS.glob("*.txt")):
        header = _header(path.read_text(encoding="utf-8"))
        assert "LAST_UPDATED: 2025-04-01" not in header, f"{path.name} still has blanket date"


def test_active_docs_carry_source_url_and_verification():
    for path in sorted(DOCS.glob("*.txt")):
        text = path.read_text(encoding="utf-8")
        header = _header(text)
        status = next(
            ln.split(":", 1)[1].strip() for ln in header.splitlines() if ln.startswith("STATUS:")
        )
        if status == "superseded":
            continue
        assert "SOURCE_URL:" in header, f"{path.name} missing SOURCE_URL"
        assert "LAST_VERIFIED:" in header, f"{path.name} missing LAST_VERIFIED"


def test_repealed_acts_are_superseded_and_flagged_historical():
    for name in REPEALED_ACT_DOCS:
        text = (DOCS / name).read_text(encoding="utf-8")
        header = _header(text)
        assert "STATUS: superseded" in header, f"{name} must be marked superseded"
        assert "REPEALED" in text, f"{name} must carry the historical notice"
        assert "21 November 2025" in text, f"{name} must state the repeal date"
        assert "pib.gov.in" in text, f"{name} must cite the PIB source"


def test_current_code_docs_exist_and_cite_pib():
    for name in CURRENT_CODE_DOCS:
        path = DOCS / name
        assert path.exists(), f"{name} is missing"
        text = path.read_text(encoding="utf-8")
        header = _header(text)
        assert "STATUS: current" in header, f"{name} must be current"
        assert "21 November 2025" in text, f"{name} must state the commencement date"
        assert "pib.gov.in" in text, f"{name} must cite the PIB source"
