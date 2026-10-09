"""Mounted backend GP and exception boundaries, requiring the parent source tier."""

import json
import os
import subprocess
import sys
from types import ModuleType
from pathlib import Path

import pandas as pd
import pytest

if not os.getenv("F1_BOUNDARY_FULL"):
    parent_source = Path(
        os.environ.get("F1_PARENT_SOURCE", Path(__file__).resolve().parents[1].parents[1])
    )
    if not (parent_source / "src" / "f1_strat_manager" / "gp_slugs.py").is_file():
        pytest.skip(
            "Run F1_BOUNDARY_FULL=1 with parent source for mounted boundary coverage",
            allow_module_level=True,
        )

from backend.api.v1.endpoints import circuit_domination, comparison, strategy
from backend.core.gp_paths import InvalidGPError, resolve_race_dir, resolve_radio_slug
from backend.services.simulation import simulator

from tests.test_security_public_errors import MARKER

BAD_GPS = [
    "../../escape",
    r"..\..\escape",
    "/absolute/path",
    r"C:\private",
    "C:relative",
    r"\\host\share",
    "unknown225",
    "../Melbourne",
    "Melbourne/..",
]


@pytest.fixture(scope="module")
def mounted_client():
    os.environ["F1_MCP_ENABLED"] = "true"
    from backend.main import app
    from starlette.testclient import TestClient

    with pytest.MonkeyPatch.context() as patch:
        patch.setenv("F1_API_KEY", "fictional-local-225")
        patch.setenv("F1_RATE_LIMIT_OFF", "1")
        with TestClient(app, headers={"X-API-Key": "fictional-local-225"}) as client:
            yield client


@pytest.mark.parametrize("gp", BAD_GPS)
def test_rejected_gp_never_enters_loaders(gp, mounted_client, monkeypatch):
    from backend.core import gp_paths

    entered = []

    def forbidden(*args, **kwargs):
        entered.append(True)
        raise AssertionError("Rejected GP entered a loader")

    for target, name in [
        (strategy, "get_laps_df"),
        (strategy, "_get_radio_corpus"),
        (simulator, "_load_laps_df"),
        (simulator, "RaceReplayEngine"),
    ]:
        monkeypatch.setattr(target, name, forbidden)
    monkeypatch.setattr(gp_paths, "contained_data_path", forbidden)
    requests = [
        mounted_client.post(
            "/api/v1/strategy/simulate",
            json={"gp": gp, "driver": "NOR", "team": "McLaren", "no_llm": True},
        ),
        mounted_client.get(
            "/api/v1/strategy/lap-state", params={"gp": gp, "driver": "NOR", "lap": 1}
        ),
        mounted_client.get("/api/v1/strategy/radio-laps", params={"gp": gp}),
        mounted_client.get(
            "/api/v1/strategy/radio-transcript", params={"gp": gp, "driver": "NOR", "lap": 1}
        ),
    ]
    assert [r.status_code for r in requests] == [400] * 4
    with pytest.raises(InvalidGPError):
        list(simulator.simulate_race(simulator.SimConfig(2025, gp, "NOR", "McLaren", no_llm=True)))
    with pytest.raises(InvalidGPError):
        strategy._get_race_laps_df(2025, gp)
    assert not entered


@pytest.mark.parametrize(
    "alias,folder,slug",
    [
        ("Australia", "Melbourne", "australia"),
        ("Melbourne", "Melbourne", "australia"),
        ("Miami", "Miami_Gardens", "united_states_miami"),
        ("Miami Gardens", "Miami_Gardens", "united_states_miami"),
        ("Marina Bay", "Marina_Bay", "singapore"),
        ("Las_Vegas", "Las_Vegas", "united_states_las_vegas"),
        ("São Paulo", "São_Paulo", "brazil"),
        ("Montréal", "Montréal", "canada"),
        ("Qatar", "Lusail", "qatar"),
        ("Sao Paulo", "São_Paulo", "brazil"),
        ("Montreal", "Montréal", "canada"),
    ],
)
def test_aliases_use_raw_folders_separate_from_radio(alias, folder, slug, tmp_path, monkeypatch):
    monkeypatch.setenv("F1_STRAT_DATA_ROOT", str(tmp_path))
    expected = tmp_path / "raw" / "2025" / folder
    expected.mkdir(parents=True)
    assert resolve_race_dir(2025, alias) == expected.resolve()
    assert strategy._resolve_race_dir(2025, alias) == expected.resolve()
    assert simulator._resolve_race_dir(2025, alias) == expected.resolve()
    assert resolve_radio_slug(alias) == slug


@pytest.mark.parametrize(
    "linked", ["folder", "laps.parquet", "weather.parquet", "metadata.json", "year"]
)
def test_link_escape_rejected_before_loader(linked, tmp_path, monkeypatch, mounted_client):
    data = tmp_path / "data"
    outside = tmp_path / "outside"
    outside.mkdir()
    monkeypatch.setenv("F1_STRAT_DATA_ROOT", str(data))
    target = data / "raw" / "2025" / "Melbourne"
    if linked == "year":
        link = target.parent
    elif linked == "folder":
        link = target
    else:
        link = target / linked
        if os.name != "nt":
            outside = outside / linked
            outside.touch()
    link.parent.mkdir(parents=True, exist_ok=True)
    if os.name == "nt":
        completed = subprocess.run(
            ["cmd", "/c", "mklink", "/J", str(link), str(outside)], capture_output=True, text=True
        )
        assert completed.returncode == 0, completed.stderr
    else:
        link.symlink_to(outside, target_is_directory=linked in ("folder", "year"))
    with pytest.raises(InvalidGPError):
        resolve_race_dir(2025, "Melbourne")
    response = mounted_client.post(
        "/api/v1/strategy/simulate", json={"gp": "Melbourne", "driver": "NOR", "team": "McLaren"}
    )
    assert response.status_code == 400


@pytest.mark.parametrize(
    "endpoint,target",
    [
        ("comparison/compare", "fetch_lap_telemetry"),
        ("circuit-domination", "get_circuit_domination_data"),
    ],
)
@pytest.mark.parametrize("exception,status", [(ValueError, 404), (RuntimeError, 500)])
def test_telemetry_exceptions_sanitized(
    endpoint, target, exception, status, mounted_client, monkeypatch, caplog
):
    module = comparison if endpoint.startswith("comparison") else circuit_domination

    def fail(*args, **kwargs):
        raise exception(MARKER)

    monkeypatch.setattr(module, target, fail)
    response = mounted_client.get(
        f"/api/v1/{endpoint}",
        params={
            "year": 2025,
            "gp": "Melbourne",
            "session": "R",
            "driver1": "NOR",
            "driver2": "PIA",
            "drivers": "NOR,PIA",
        },
    )
    assert response.status_code == status
    assert MARKER.split()[0] not in response.text
    assert MARKER in caplog.text


@pytest.mark.parametrize(
    "path,status",
    [("message", 503), ("stream", 200), ("tool-message", 503), ("tool-message-stream", 200)],
)
def test_mounted_chat_provider_failure(
    path, status, mounted_client, fake_openai, monkeypatch, caplog
):
    from backend.services.chatbot import chat_engine

    async def no_tools():
        return []

    monkeypatch.setattr(chat_engine, "list_openai_tools", no_tools)
    fake_openai.push_error(500, MARKER)
    response = mounted_client.post(f"/api/v1/chat/{path}", json={"text": "hello"})
    assert response.status_code == status
    assert MARKER.split()[0] not in response.text
    assert MARKER.split()[0] in caplog.text


def test_mounted_mcp_errors(mounted_client, monkeypatch, caplog):
    def fail(*args, **kwargs):
        raise FileNotFoundError(MARKER)

    monkeypatch.setattr(strategy, "get_lap_state", fail)
    headers = {"Accept": "application/json, text/event-stream"}
    response = mounted_client.post(
        "/mcp/mcp",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {"name": "offline225", "version": "1"},
            },
        },
    )
    assert response.status_code == 200, response.text
    headers["mcp-session-id"] = response.headers["mcp-session-id"]
    mounted_client.post(
        "/mcp/mcp", headers=headers, json={"jsonrpc": "2.0", "method": "notifications/initialized"}
    )
    response = mounted_client.post(
        "/mcp/mcp",
        headers=headers,
        json={
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {
                "name": "predict_pace",
                "arguments": {"gp": "Melbourne", "driver": "NOR", "lap": 2},
            },
        },
    )
    assert response.status_code == 200
    assert '"isError":true' in response.text.replace(" ", "")
    assert MARKER.split()[0] not in response.text
    assert MARKER in caplog.text


def test_simulation_setup_failure_safe(mounted_client, monkeypatch, caplog):
    def fail(*args, **kwargs):
        raise FileNotFoundError(MARKER)

    monkeypatch.setattr(simulator, "_load_laps_df", fail)
    response = mounted_client.post(
        "/api/v1/strategy/simulate",
        json={"gp": "Melbourne", "driver": "NOR", "team": "McLaren", "no_llm": True},
    )
    assert response.status_code == 200
    assert '"type": "error"' in response.text
    assert MARKER.split()[0] not in response.text
    assert MARKER in caplog.text


def test_agent_validation_failure_safe(mounted_client, monkeypatch, caplog):
    def fail(*args, **kwargs):
        raise ValueError(MARKER)

    pace_agent = ModuleType("src.agents.pace_agent")
    pace_agent.run_pace_agent_from_state = fail
    monkeypatch.setitem(sys.modules, "src.agents.pace_agent", pace_agent)
    response = mounted_client.post("/api/v1/strategy/pace", json={"lap_state": {}})
    assert response.status_code == 422
    assert response.json()["detail"]["error"] == "invalid_request"
    assert MARKER.split()[0] not in response.text
    assert MARKER in caplog.text


def test_per_lap_failure_on_real_replay(mounted_client, tmp_path, monkeypatch, caplog):
    """Read a real temporary parquet through replay, injecting only the failing agent."""
    monkeypatch.setenv("F1_STRAT_DATA_ROOT", str(tmp_path))
    race = tmp_path / "raw" / "2025" / "Melbourne"
    race.mkdir(parents=True)
    frame = pd.DataFrame(
        {
            "Driver": ["NOR", "NOR"],
            "LapNumber": [1, 2],
            "Position": [1, 1],
            "LapTime": pd.to_timedelta([90, 91], unit="s"),
            "Time": pd.to_timedelta([90, 181], unit="s"),
            "TyreLife": [1, 2],
            "Compound": ["MEDIUM", "MEDIUM"],
            "Stint": [1, 1],
            "TrackStatus": ["1", "1"],
            "DriverNumber": [4, 4],
            "IsAccurate": [True, True],
            "Deleted": [False, False],
            "Sector1Time": pd.to_timedelta([30, 30], unit="s"),
            "Sector2Time": pd.to_timedelta([30, 30], unit="s"),
            "Sector3Time": pd.to_timedelta([30, 31], unit="s"),
        }
    )
    frame.to_parquet(race / "laps.parquet")
    (race / "metadata.json").write_text(
        json.dumps({"gp_name": "Melbourne", "year": 2025}), encoding="utf-8"
    )
    processed = tmp_path / "processed"
    processed.mkdir()
    featured = frame.copy()
    featured["GP_Name"] = "Melbourne"
    featured.to_parquet(processed / "laps_featured_2025.parquet")
    from backend.utils import laps_cache

    monkeypatch.setattr(laps_cache, "_cache", {})
    monkeypatch.setattr(simulator, "_local_build_race_state", lambda *args, **kwargs: None)

    def fail(*args, **kwargs):
        raise RuntimeError(MARKER)

    monkeypatch.setattr(simulator, "_run_no_llm_path", fail)
    response = mounted_client.post(
        "/api/v1/strategy/simulate",
        json={"gp": "Melbourne", "driver": "NOR", "team": "McLaren", "no_llm": True},
    )
    events = [
        json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")
    ]
    assert [event["type"] for event in events] == ["start", "error", "error", "summary"], (
        response.text
    )
    assert [event["data"]["lap"] for event in events if event["type"] == "error"] == [1, 2]
    assert events[-1]["data"]["status"]["error_laps"] == 2
    assert MARKER.split()[0] not in response.text
    assert MARKER in caplog.text


@pytest.mark.parametrize("gp", BAD_GPS)
def test_mcp_gp_rejected_before_agent_or_data(gp, monkeypatch):
    from backend import mcp_tools

    entered = []

    @mcp_tools._catch_tool_input_error
    def caller(gp: str, year: int = 2025):
        entered.append(True)
        return strategy.get_lap_state(gp, "NOR", 1, year)

    assert caller(gp) == "Unknown or invalid Grand Prix"
    assert not entered


def test_recommend_rejects_gp_before_data_dependency(mounted_client, monkeypatch):
    entered = []

    def forbidden(*args, **kwargs):
        entered.append(True)
        raise AssertionError("Rejected GP entered featured loader")

    from backend.utils import laps_cache

    monkeypatch.setattr(laps_cache, "get_laps_df", forbidden)
    response = mounted_client.post(
        "/api/v1/strategy/recommend",
        json={"gp_name": "Melbourne", "lap_state": {"session_meta": {"gp_name": "../../escape"}}},
    )
    assert response.status_code == 400
    assert not entered


@pytest.mark.parametrize(
    "corpus,filename",
    [
        ("race_radios", "radios.parquet"),
        ("race_radios", "rcm.parquet"),
        ("radio_nlp", "transcripts.json"),
    ],
)
def test_radio_link_escape_before_any_loader(
    corpus, filename, mounted_client, tmp_path, monkeypatch
):
    data = tmp_path / "data"
    outside = tmp_path / "outside"
    outside.mkdir()
    monkeypatch.setenv("F1_STRAT_DATA_ROOT", str(data))
    link = data / "processed" / corpus / "2025" / "australia" / filename
    link.parent.mkdir(parents=True)
    if os.name == "nt":
        completed = subprocess.run(
            ["cmd", "/c", "mklink", "/J", str(link), str(outside)], capture_output=True, text=True
        )
        assert completed.returncode == 0, completed.stderr
    else:
        outside = outside / filename
        outside.touch()
        link.symlink_to(outside)
    entered = []

    def forbidden(*args, **kwargs):
        entered.append(True)
        raise AssertionError("Escaped radio path entered a loader")

    monkeypatch.setattr(strategy, "get_laps_df", forbidden)
    monkeypatch.setattr(strategy, "_get_radio_corpus", forbidden)
    response = mounted_client.get("/api/v1/strategy/radio-laps", params={"gp": "Australia"})
    assert response.status_code == 400
    with pytest.raises(InvalidGPError):
        strategy._get_radio_runner(2025, "Australia", pd.DataFrame())
    assert not entered


def test_radio_available_gps_rejects_escaped_year_directory(mounted_client, tmp_path, monkeypatch):
    data = tmp_path / "data"
    outside = tmp_path / "outside"
    (outside / "canada").mkdir(parents=True)
    monkeypatch.setenv("F1_STRAT_DATA_ROOT", str(data))
    year_dir = data / "processed" / "race_radios" / "2025"
    year_dir.parent.mkdir(parents=True)
    if os.name == "nt":
        completed = subprocess.run(
            ["cmd", "/c", "mklink", "/J", str(year_dir), str(outside)],
            capture_output=True,
            text=True,
        )
        assert completed.returncode == 0, completed.stderr
    else:
        year_dir.symlink_to(outside, target_is_directory=True)

    response = mounted_client.get("/api/v1/strategy/radio-available-gps", params={"year": 2025})

    assert response.status_code == 400
    assert "canada" not in response.text.casefold()
