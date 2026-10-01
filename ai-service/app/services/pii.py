"""PII scrubbing for text that leaves the box.

Voice questions and chat text may contain personal identifiers. Before any
text is sent to an EXTERNAL provider (Groq LLM, Sarvam MT/TTS, Google
Translate/TTS), obvious identifiers are replaced with placeholders:

  - 10-digit Indian mobile numbers (starting 6-9)      → <phone>
  - 12-digit Aadhaar-like numbers, spaced or not       → <id>

The regexes are deliberately conservative: short counts ("12 days", "Rs 450")
never match because a match must be exactly 10 or 12 digits with non-digit
delimiters on both sides. The worker still sees their own words in their chat
history — this only guards the outbound copy.
"""
from __future__ import annotations

import re

_MOBILE = re.compile(r"(?<!\d)[6-9]\d{9}(?!\d)")
_AADHAAR_SPACED = re.compile(r"(?<!\d)\d{4}\s\d{4}\s\d{4}(?!\d)")
_AADHAAR_PLAIN = re.compile(r"(?<!\d)\d{12}(?!\d)")


def strip_pii(text: str) -> str:
    if not text:
        return text
    # Spaced Aadhaar first so its 4-digit groups can't be eaten by other rules.
    out = _AADHAAR_SPACED.sub("<id>", text)
    out = _MOBILE.sub("<phone>", out)
    out = _AADHAAR_PLAIN.sub("<id>", out)
    return out
