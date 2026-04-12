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

import pandas as pd  # noqa: E402
import streamlit as st  # noqa: E402
from components.race_analysis.gap_charts import render_gap_charts  # noqa: E402
from components.race_analysis.radio_panel import render_radio_panel  # noqa: E402
from components.race_analysis.tire_charts import render_tire_charts  # noqa: E402
from services.strategy_service import StrategyService  # noqa: E402
from services.telemetry_service import TelemetryService  # noqa: E402
from utils.race_processing import add_race_lap_column  # noqa: E402


def render_header() -> None:
    st.markdown(
        "<h1 style='text-align: center;'>Race analysis</h1>",
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
    """Year + GP + Driver selectors that auto-fetch featured race data."""
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        year = st.selectbox("Season", [2025, 2024, 2023], index=0, key="ra_year")

    with col2:
        ok, gp_list, err = StrategyService.get_available_gps(year)
        if ok and gp_list:
            gp = st.selectbox("Grand Prix", gp_list, key="ra_gp")
        else:
            st.warning(f"Could not load GPs: {err}")
            gp = None

    # Driver selector (populated after data is loaded)
    df = _load_race_data()
    driver_map = _build_driver_map(df)

    with col3:
        if driver_map:
            codes = ["All"] + [driver_map[d] for d in sorted(driver_map)]
            selected_code = st.selectbox("Driver", codes, key="ra_driver")
            if selected_code != "All":
                inv = {v: k for k, v in driver_map.items()}
                st.session_state["ra_driver_number"] = int(inv[selected_code])
            else:
                st.session_state["ra_driver_number"] = None
        else:
            st.selectbox("Driver", ["Load data first"], disabled=True, key="ra_driver_placeholder")
            st.session_state["ra_driver_number"] = None

    with col4:
        load_clicked = st.button(
            ":material/download: Load race data", key="ra_load", type="primary",
            use_container_width=True,
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

    # Persistent data banner
    if not df.empty:
        gp_name = st.session_state.get("ra_loaded_gp", "")
        yr = st.session_state.get("ra_loaded_year", "")
        n_drivers = df["DriverNumber"].nunique() if "DriverNumber" in df.columns else "?"
        max_lap = int(df["LapNumber"].max()) if "LapNumber" in df.columns else "?"
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

def _get_selected_driver() -> int | None:
    """Return the driver number selected in the page-level selector."""
    return st.session_state.get("ra_driver_number")


def _render_tyre_tab(df: pd.DataFrame) -> None:
    render_tire_charts(df, driver_number=_get_selected_driver())


def _render_gap_tab(df: pd.DataFrame) -> None:
    render_gap_charts(df, driver_number=_get_selected_driver())


def _render_radio_tab() -> None:
    """Radio tab with two modes: Race Radio Lookup (if GP loaded) and free input."""
    gp = st.session_state.get("ra_loaded_gp")
    year = st.session_state.get("ra_loaded_year", 2025)

    if gp:
        _render_radio_lookup(gp, year)
    else:
        _render_radio_free_input()


def _render_radio_lookup(gp: str, year: int) -> None:
    """Radio lookup using the loaded GP's radio corpus."""
    st.subheader("Radio intelligence")

    ok, data, err = StrategyService.get_radio_laps(gp, year)
    if not ok or not data:
        st.caption("No radio corpus available for this GP. Use free text input below.")
        _render_radio_free_input()
        return

    drivers_data = data.get("drivers", [])
    if not drivers_data:
        st.caption("No radio messages found for this GP.")
        _render_radio_free_input()
        return

    driver_names = [d["driver"] for d in drivers_data]
    driver_laps_map = {d["driver"]: d.get("laps", []) for d in drivers_data}

    col1, col2 = st.columns(2)
    with col1:
        driver = st.selectbox("Driver", driver_names, key="radio_lookup_driver")
    with col2:
        laps = driver_laps_map.get(driver, [])
        if laps:
            lap = st.selectbox("Lap", sorted(laps), key="radio_lookup_lap")
        else:
            st.selectbox("Lap", ["No laps available"], disabled=True, key="radio_lookup_lap_empty")
            lap = None

    # Transcript preview
    if driver and lap:
        ok_t, transcript_data, _ = StrategyService.get_radio_transcript(gp, driver, lap, year)
        if ok_t and transcript_data:
            messages = transcript_data if isinstance(transcript_data, list) else [transcript_data]
            with st.expander("Transcript preview", expanded=True, icon=":material/chat:"):
                for msg in messages[:5]:
                    text = msg.get("text", msg.get("transcription", str(msg)))
                    st.caption(text)

    if st.button(":material/play_arrow: Analyse radio", key="radio_lookup_run", type="primary"):
        if driver and lap:
            lap_state = {"driver": driver, "lap": int(lap)}
            render_radio_panel(lap_state)

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
        lap_state = {"driver": driver, "lap": int(lap)}
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
            st.markdown(data.get("answer", data.get("reasoning", str(data))))
            sources = data.get("sources", [])
            if sources:
                with st.expander("Sources", icon=":material/source:"):
                    for src in sources:
                        st.markdown(f"- {src}")
        else:
            st.error(f"RAG error: {err}")


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

    st.dataframe(df.head(50), use_container_width=True)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def render_race_analysis_page() -> None:
    """Called by the router in main.py."""
    render_header()

    _render_race_selectors()
    _render_data_upload()

    df = _load_race_data()

    no_data_msg = "Select a Grand Prix above and click **Load race data** to see charts."

    tabs = st.tabs([
        ":material/tire_repair: Tyre degradation",
        ":material/swap_vert: Gap analysis",
        ":material/radio: Radio intelligence",
        ":material/gavel: FIA regulations",
        ":material/dataset: Dataset overview",
    ])

    with tabs[0]:
        if df.empty:
            st.caption(no_data_msg)
        else:
            _render_tyre_tab(df)

    with tabs[1]:
        if df.empty:
            st.caption(no_data_msg)
        else:
            _render_gap_tab(df)

    with tabs[2]:
        _render_radio_tab()

    with tabs[3]:
        _render_rag_tab()

    with tabs[4]:
        _render_overview_tab(df)
