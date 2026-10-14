import logging

import pandas as pd
import pytest
from backend.services.telemetry import telemetry_service


def test_get_available_sessions_skips_only_unavailable_session_names(monkeypatch):
    class EventStub:
        def get_session(self, session_name):
            if session_name == "Q":
                return object()
            raise ValueError("session does not exist")

    monkeypatch.setattr(telemetry_service.fastf1, "get_event", lambda year, gp: EventStub())

    assert telemetry_service.get_available_sessions(2025, "Australia") == ["Q"]


def test_get_available_sessions_propagates_process_interrupts(monkeypatch):
    class EventStub:
        def get_session(self, session_name):
            raise KeyboardInterrupt

    monkeypatch.setattr(telemetry_service.fastf1, "get_event", lambda year, gp: EventStub())

    with pytest.raises(KeyboardInterrupt):
        telemetry_service.get_available_sessions(2025, "Australia")


def test_get_available_sessions_reports_schedule_errors(monkeypatch, capsys):
    def fail_to_get_event(year, gp):
        raise RuntimeError("schedule unavailable")

    monkeypatch.setattr(telemetry_service.fastf1, "get_event", fail_to_get_event)

    assert telemetry_service.get_available_sessions(2025, "Australia") == [
        "FP1",
        "FP2",
        "FP3",
        "Q",
        "R",
    ]
    assert "Error getting sessions for 2025 Australia: schedule unavailable" in capsys.readouterr().out


def test_get_lap_times_skips_and_logs_invalid_lap_time(monkeypatch, caplog):
    laps = pd.DataFrame(
        [
            {
                "IsAccurate": True,
                "LapTime": pd.Timedelta(seconds=90),
                "PitOutTime": pd.NaT,
                "PitInTime": pd.NaT,
                "Driver": "NOR",
                "LapNumber": 7,
                "Compound": "SOFT",
                "IsPersonalBest": True,
            },
            {
                "IsAccurate": True,
                "LapTime": "not a timedelta",
                "PitOutTime": pd.NaT,
                "PitInTime": pd.NaT,
                "Driver": "PIA",
                "LapNumber": 8,
                "Compound": "MEDIUM",
                "IsPersonalBest": False,
            },
        ]
    )

    class SessionDataStub:
        def __init__(self, **kwargs):
            pass

        def get_driver_lap_times(self, drivers):
            return laps

    monkeypatch.setattr(telemetry_service, "SessionData", SessionDataStub)

    with caplog.at_level(logging.WARNING, logger=telemetry_service.__name__):
        result = telemetry_service.get_lap_times(2025, "Australia", "R", ["NOR", "PIA"])

    assert result == [
        {
            "driver": "NOR",
            "lap_number": 7,
            "lap_time": 90.0,
            "is_valid": True,
            "compound": "soft",
        }
    ]
    assert "unsupported LapTime type str" in caplog.text
