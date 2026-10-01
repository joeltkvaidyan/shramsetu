"""Tests for PII stripping before text is sent to external AI providers."""
from app.services.pii import strip_pii

import re

TEN_DIGIT = re.compile(r"(?<!\d)\d{10}(?!\d)")
TWELVE_DIGIT = re.compile(r"(?<!\d)\d{12}(?!\d)")


def test_plain_mobile_number_redacted():
    assert strip_pii("Please call me at 9876543210 today") == "Please call me at <phone> today"


def test_spaced_aadhaar_redacted():
    out = strip_pii("My Aadhaar is 1234 5678 9012 please verify")
    assert "1234" not in out and "9012" not in out
    assert "<id>" in out


def test_plain_aadhaar_redacted():
    out = strip_pii("Aadhaar 123456789012 verification pending")
    assert not TWELVE_DIGIT.search(out)
    assert "<id>" in out


def test_ordinary_text_untouched():
    text = "My wages were not paid for 20 days in November. The site is in Ernakulam."
    assert strip_pii(text) == text


def test_multiple_pii_in_one_text():
    out = strip_pii("mobile 9123456780, aadhaar 4321 8765 2109, alternate 9998887776")
    assert not TEN_DIGIT.search(out)
    assert not TWELVE_DIGIT.search(out)


def test_empty_string_safe():
    assert strip_pii("") == ""
