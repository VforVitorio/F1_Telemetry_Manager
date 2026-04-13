"""
Race Analysis Page

Year/GP selectors at top auto-fetch featured race data from the backend
parquet cache.  Five tabs: Tyre Degradation, Gap Analysis, Radio Intel,
Regulations, Overview.  Manual CSV/parquet upload kept as fallback.
"""

# Path setup - MUST be first, linter will try to reorder without these comments
import sys  # noqa: E402  # isort: skip
import os  # noqa: E402  # isort: skip
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # noqa: E402  # isort: skip

import json  # noqa: E402

import pandas as pd  # noqa: E402
import streamlit as st  # noqa: E402
from components.common.chart_styles import apply_telemetry_chart_styles  # noqa: E402
from components.common.driver_colors import get_driver_color  # noqa: E402
from components.dashboard.css_styles import apply_driver_pill_colors, render_custom_css  # noqa: E402
from components.race_analysis.gap_charts import render_gap_charts  # noqa: E402
from components.race_analysis.radio_panel import render_radio_panel  # noqa: E402
from components.race_analysis.tire_charts import render_tire_charts  # noqa: E402
from services.strategy_service import StrategyService  # noqa: E402
from services.telemetry_service import TelemetryService  # noqa: E402
from utils.race_processing import add_race_lap_column  # noqa: E402


def render_header() -> None:
    st.markdown(
        "<h1 style='text-align: center;'>Race Analysis</h1>",
        unsafe_allow_html=True,
    )


# ---------------------------------------------------------------------------
# Race selectors (auto-fetch from backend parquet)
# ---------------------------------------------------------------------------

def _build_driver_map(df: pd.DataFrame) -> dict:
    """Return {DriverNumber: DriverCode} from the loaded DataFrame."""
    if df.empty:
        return {}
    if "Driver" in df.columns and "DriverNumber" in df.columns:
        pairs = df[["DriverNumber", "Driver"]].drop_duplicates()
        return dict(zip(pairs["DriverNumber"], pairs["Driver"]))
    if "DriverNumber" in df.columns:
        return {d: str(d) for d in sorted(df["DriverNumber"].unique())}
    return {}


def _render_race_selectors() -> None:
    """GP selector + Load button on row 1, driver multiselect on row 2.

    Season is hardcoded to 2025 — only 2025 data is available.
    """
    # Apply pill CSS once — transparent backgrounds, bold text, no X buttons
    render_custom_css()

    year = 2025
    st.warning(":material/info: Only 2025 season data is currently available.", icon=None)

    c1, c2 = st.columns([3, 1], vertical_alignment="bottom")

    with c1:
        ok, gp_list, err = StrategyService.get_available_gps(year)
        gp_options = ([None] + gp_list) if ok and gp_list else [None]
        gp = st.selectbox(
            "Grand Prix",
            gp_options,
            format_func=lambda x: "-- Select GP --" if x is None else x,
            key="ra_gp",
        )

    with c2:
        load_clicked = st.button(
            ":material/download: Load race data",
            key="ra_load",
            type="primary",
            use_container_width=True,
            disabled=gp is None,
        )

    if load_clicked and gp:
        with st.spinner(f"Loading {year} {gp} race data..."):
            ok, data, err = TelemetryService.get_race_data(year, gp)
        if ok and data:
            loaded_df = pd.DataFrame(data["race_data"])
            if "LapNumber" not in loaded_df.columns and "TyreAge" in loaded_df.columns and "Stint" in loaded_df.columns:
                loaded_df = add_race_lap_column(loaded_df)
            st.session_state["race_analysis_df"] = loaded_df
            st.session_state["ra_loaded_gp"] = gp
            st.session_state["ra_loaded_year"] = year
            st.rerun()
        else:
            st.error(f"Failed to load race data: {err}")

    # Driver multiselect (populated after data is loaded)
    df = _load_race_data()
    driver_map = _build_driver_map(df)

    if driver_map:
        codes = [driver_map[d] for d in sorted(driver_map)]
        selected_codes = st.multiselect(
            "Drivers (select up to 3)",
            options=codes,
            default=[],
            max_selections=3,
            key="ra_drivers",
        )
        # Map codes back to driver numbers
        inv = {v: k for k, v in driver_map.items()}
        selected_numbers = [int(inv[c]) for c in selected_codes if c in inv]
        st.session_state["ra_driver_numbers"] = selected_numbers

        # Apply driver team colors to pills (Dashboard pattern)
        if selected_codes:
            year = st.session_state.get("ra_loaded_year", 2025)
            apply_driver_pill_colors(selected_codes, year=year)
    else:
        st.session_state["ra_driver_numbers"] = []

    # Persistent data banner
    if not df.empty:
        gp_name = st.session_state.get("ra_loaded_gp", "")
        yr = st.session_state.get("ra_loaded_year", "")
        max_lap = int(df["LapNumber"].max()) if "LapNumber" in df.columns else "?"
        selected = st.session_state.get("ra_driver_numbers", [])
        if selected and driver_map:
            labels = [driver_map.get(d, str(d)) for d in selected]
            st.caption(f"Viewing: {gp_name} {yr} \u00b7 {', '.join(labels)} \u00b7 {max_lap} laps")
        else:
            n_drivers = df["DriverNumber"].nunique() if "DriverNumber" in df.columns else "?"
            st.caption(f"Viewing: {gp_name} {yr} \u00b7 {n_drivers} drivers \u00b7 {max_lap} laps")


# ---------------------------------------------------------------------------
# Data loader
# ---------------------------------------------------------------------------

def _load_race_data() -> pd.DataFrame:
    """Return a race DataFrame from session state."""
    if "race_analysis_df" in st.session_state:
        return st.session_state["race_analysis_df"]
    return pd.DataFrame()


def _render_data_upload() -> None:
    """Fallback CSV/parquet upload inside an expander."""
    with st.expander("Upload data manually", icon=":material/upload:"):
        uploaded = st.file_uploader(
            "Upload race data (CSV or Parquet)",
            type=["csv", "parquet"],
            key="race_analysis_upload",
        )
        if uploaded is not None:
            if uploaded.name.endswith(".parquet"):
                df = pd.read_parquet(uploaded)
            else:
                df = pd.read_csv(uploaded)
            if "LapNumber" not in df.columns and "TyreAge" in df.columns and "Stint" in df.columns:
                df = add_race_lap_column(df)
            st.session_state["race_analysis_df"] = df
            st.rerun()


# ---------------------------------------------------------------------------
# Tab renderers
# ---------------------------------------------------------------------------

def _filter_by_selected_drivers(df: pd.DataFrame) -> pd.DataFrame:
    """Filter DataFrame to only the selected drivers (if any)."""
    selected = st.session_state.get("ra_driver_numbers", [])
    if selected and "DriverNumber" in df.columns:
        return df[df["DriverNumber"].isin(selected)]
    return df


def _build_driver_colors(df: pd.DataFrame) -> dict:
    """Build {DriverNumber: hex_color} from selected drivers using team colors."""
    selected = st.session_state.get("ra_driver_numbers", [])
    driver_map = _build_driver_map(df)
    year = st.session_state.get("ra_loaded_year", 2025)
    return {num: get_driver_color(driver_map.get(num, str(num)), year=year) for num in selected}


def _build_driver_code_map(df: pd.DataFrame) -> dict:
    """Build {DriverNumber: driver_code} from selected drivers (e.g. {63: 'RUS'})."""
    selected = st.session_state.get("ra_driver_numbers", [])
    driver_map = _build_driver_map(df)
    return {num: driver_map.get(num, str(num)) for num in selected}


def _render_tyre_tab(df: pd.DataFrame) -> None:
    filtered = _filter_by_selected_drivers(df)
    if filtered.empty:
        st.caption("Select drivers above to see tyre charts.")
        return
    driver_colors = _build_driver_colors(df)
    driver_code_map = _build_driver_code_map(df)
    render_tire_charts(filtered, driver_number=None, driver_colors=driver_colors, driver_code_map=driver_code_map)


def _render_gap_tab(df: pd.DataFrame) -> None:
    filtered = _filter_by_selected_drivers(df)
    if filtered.empty:
        st.caption("Select drivers above to see gap charts.")
        return
    driver_colors = _build_driver_colors(df)
    driver_code_map = _build_driver_code_map(df)
    render_gap_charts(filtered, driver_number=None, driver_colors=driver_colors, driver_code_map=driver_code_map)


def _render_radio_tab() -> None:
    """Radio tab with two modes: Race Radio Lookup (if GP loaded) and free input.

    When a GP is loaded, shows an empty placeholder until the user activates radio.
    This avoids triggering the corpus fetch on every tab switch.
    """
    gp = st.session_state.get("ra_loaded_gp")
    year = st.session_state.get("ra_loaded_year", 2025)

    # Reset activation flag when the GP changes
    last_radio_gp = st.session_state.get("ra_radio_last_gp")
    if last_radio_gp != gp:
        st.session_state["ra_radio_active"] = False
        st.session_state["ra_radio_last_gp"] = gp

    if gp and not st.session_state.get("ra_radio_active", False):
        st.caption("Select a driver and lap to run the full radio NLP pipeline.")
        if st.button(":material/radio: Load radio data", key="ra_radio_activate", type="primary"):
            st.session_state["ra_radio_active"] = True
            st.rerun()
        st.caption("Or use the free text input below.")
        with st.expander("Enter radio text manually", icon=":material/edit:"):
            _render_radio_free_input(nested=True)
        return

    if gp:
        _render_radio_lookup(gp, year)
    else:
        _render_radio_free_input()


def _render_radio_lookup(gp: str, year: int) -> None:
    """Radio lookup using the loaded GP's radio corpus."""
    st.subheader("Radio intelligence")
    st.caption("Select a driver and lap to run the full NLP pipeline (transcription + sentiment + intent + NER).")

    ok, drivers_data, err = StrategyService.get_radio_laps(gp, year)
    if not ok or not drivers_data:
        st.caption("No radio corpus available for this GP. Use free text input below.")
        _render_radio_free_input()
        return

    if not isinstance(drivers_data, list) or not drivers_data:
        st.caption("No radio messages found for this GP.")
        _render_radio_free_input()
        return

    driver_names = [d["driver"] for d in drivers_data]
    # Backend returns list of dicts {"lap": N, "text": "...", ...} — extract only the lap numbers
    driver_laps_map = {
        d["driver"]: [l["lap"] for l in d.get("laps", []) if l.get("has_transcript", False)]
        for d in drivers_data
    }

    col1, col2, col3 = st.columns([2, 2, 1])
    with col1:
        driver = st.selectbox("Driver", driver_names, key="radio_lookup_driver")
    with col2:
        laps = driver_laps_map.get(driver, [])
        if laps:
            lap = st.selectbox("Lap", sorted(laps), key="radio_lookup_lap")
        else:
            st.selectbox("Lap", ["No laps available"], disabled=True, key="radio_lookup_lap_empty")
            lap = None
    with col3:
        run = st.button(
            ":material/play_arrow: Analyse radio",
            key="radio_lookup_run",
            type="primary",
            use_container_width=True,
        )

    # Run pipeline and cache result
    cache_key = f"radio_result_{gp}_{driver}_{lap}"
    if run and driver and lap:
        lap_state = {"driver": {"driver": driver}, "lap_number": int(lap)}
        render_radio_panel(lap_state)
        # Store last result for download
        if "radio_last_result" in st.session_state:
            st.session_state[cache_key] = st.session_state["radio_last_result"]

    # Download button for cached result
    cached = st.session_state.get(cache_key)
    if cached:
        st.download_button(
            ":material/download: Download results (JSON)",
            data=json.dumps(cached, indent=2, default=str),
            file_name=f"radio_{gp}_{driver}_lap{lap}.json",
            mime="application/json",
            key=f"radio_dl_{cache_key}",
        )

    # Fallback free text below
    with st.expander("Or enter radio text manually", icon=":material/edit:"):
        _render_radio_free_input(nested=True)


def _render_radio_free_input(nested: bool = False) -> None:
    """Free text radio input (fallback when no corpus)."""
    if not nested:
        st.subheader("Radio intelligence")
        st.caption("Enter a lap state below to query the Radio Agent.")

    col1, col2 = st.columns(2)
    suffix = "_nested" if nested else ""
    with col1:
        driver = st.text_input("Driver code", value="VER", key=f"radio_driver_input{suffix}")
    with col2:
        lap = st.number_input("Lap", min_value=1, max_value=78, value=25, key=f"radio_lap_input{suffix}")

    if st.button(":material/play_arrow: Analyse radio", key=f"radio_run{suffix}"):
        lap_state = {"driver": {"driver": driver}, "lap_number": int(lap)}
        render_radio_panel(lap_state)


def _render_rag_tab() -> None:
    st.subheader("FIA regulation query")
    question = st.text_area(
        "Ask about FIA regulations",
        placeholder="e.g. What are the tyre allocation rules for a standard race weekend?",
        key="rag_question",
    )
    if st.button(":material/search: Query regulations", key="rag_run") and question:
        with st.spinner("Querying RAG..."):
            ok, data, err = StrategyService.get_rag(question)
        if ok:
            st.session_state["rag_last_result"] = data
            st.markdown(data.get("answer", data.get("reasoning", str(data))))
            sources = data.get("sources", [])
            if sources:
                with st.expander("Sources", icon=":material/source:"):
                    for src in sources:
                        st.markdown(f"- {src}")
        else:
            st.error(f"RAG error: {err}")

    # Download last RAG result
    rag_result = st.session_state.get("rag_last_result")
    if rag_result:
        st.download_button(
            ":material/download: Download answer (JSON)",
            data=json.dumps(rag_result, indent=2, default=str),
            file_name="rag_result.json",
            mime="application/json",
            key="rag_dl",
        )


def _render_overview_tab(df: pd.DataFrame) -> None:
    st.subheader("Dataset overview")
    if df.empty:
        st.caption("Load race data using the selectors above to see the overview.")
        return

    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric("Rows", len(df))
    with col2:
        st.metric("Drivers", df["DriverNumber"].nunique() if "DriverNumber" in df.columns else "?")
    with col3:
        st.metric("Laps", int(df["LapNumber"].max()) if "LapNumber" in df.columns else "?")

    with st.expander("Columns", icon=":material/view_column:"):
        st.write(list(df.columns))

    st.dataframe(df.head(50), width="stretch")

    # Export race data
    gp_name = st.session_state.get("ra_loaded_gp", "race")
    yr = st.session_state.get("ra_loaded_year", "")
    st.download_button(
        ":material/download: Export race data (CSV)",
        data=df.to_csv(index=False),
        file_name=f"race_data_{gp_name}_{yr}.csv",
        mime="text/csv",
        key="ra_export_csv",
    )


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def render_race_analysis_page() -> None:
    """Called by the router in main.py."""
    render_header()

    _render_race_selectors()
    _render_data_upload()

    # Apply purple-border chart CSS (same as Dashboard)
    st.markdown(apply_telemetry_chart_styles(), unsafe_allow_html=True)

    df = _load_race_data()

    tabs = st.tabs([
        ":material/tire_repair: Tyre degradation",
        ":material/swap_vert: Gap analysis",
        ":material/radio: Radio intelligence",
        ":material/gavel: FIA regulations",
        ":material/dataset: Dataset overview",
    ])

    with tabs[0]:
        if df.empty:
            st.caption("Load race data to see tyre analysis.")
        elif not st.session_state.get("ra_driver_numbers"):
            st.caption("Select up to 3 drivers above to see charts.")
        else:
            _render_tyre_tab(df)

    with tabs[1]:
        if df.empty:
            st.caption("Load race data to see gap analysis.")
        elif not st.session_state.get("ra_driver_numbers"):
            st.caption("Select up to 3 drivers above to see charts.")
        else:
            _render_gap_tab(df)

    with tabs[2]:
        _render_radio_tab()

    with tabs[3]:
        _render_rag_tab()

    with tabs[4]:
        _render_overview_tab(df)
