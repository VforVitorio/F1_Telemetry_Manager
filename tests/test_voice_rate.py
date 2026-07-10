"""Tests for the TTS words-per-minute -> Edge-TTS percent conversion (#52).

The bug: ``TTSRequest.rate`` is words-per-minute (default 175) but
``_format_rate`` emitted it verbatim as an Edge-TTS percentage, so the default
synthesized at +175% speed.  The fix maps wpm to a sane +/-N% around a 175
baseline.
"""

from __future__ import annotations

import re

from backend.models.voice_models import TTSRequest
from backend.services.voice.tts_service import _format_rate


def _percent(rate_str: str) -> int:
    m = re.fullmatch(r"([+-]\d+)%", rate_str)
    assert m, f"not a signed Edge-TTS rate string: {rate_str!r}"
    return int(m.group(1))


def test_default_rate_is_neutral_not_a_speed_multiplier():
    default_wpm = TTSRequest.model_fields["rate"].default
    pct = _percent(_format_rate(default_wpm))
    assert -50 <= pct <= 100  # sane band — never the +175% bug
    assert pct == 0  # 175 wpm baseline speaks at natural pace


def test_none_maps_to_neutral():
    assert _format_rate(None) == "+0%"


def test_slower_and_faster_straddle_zero():
    assert _percent(_format_rate(120)) < 0
    assert _percent(_format_rate(250)) > 0


def test_output_is_always_signed_percent():
    for wpm in (50, 175, 400):
        assert re.fullmatch(r"[+-]\d+%", _format_rate(wpm))
