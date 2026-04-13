"""
Race Data Processing Utilities

Pure pandas functions ported from legacy/app_streamlit_v1/utils/processing.py.
No Streamlit calls, no file I/O — callers supply the DataFrame.
"""

import pandas as pd


def add_race_lap_column(df: pd.DataFrame) -> pd.DataFrame:
    """Calculate the real race LapNumber from TyreAge + cumulative stint lengths.

    Each driver's stints are numbered sequentially. LapNumber for a row is the
    sum of all previous stint lengths plus the current TyreAge.
    """
    max_age = (
        df.groupby(["DriverNumber", "Stint"])["TyreAge"]
        .max()
        .reset_index()
        .rename(columns={"TyreAge": "StintLength"})
    )

    stint_offsets: dict = {}
    for driver in df["DriverNumber"].unique():
        driver_stints = max_age[max_age["DriverNumber"] == driver]
        acc = 0
        stint_offsets[driver] = {}
        for _, row in driver_stints.iterrows():
            stint_offsets[driver][row["Stint"]] = acc
            acc += row["StintLength"]

    def _calc_lap(row):
        return stint_offsets.get(row["DriverNumber"], {}).get(row["Stint"], 0) + row["TyreAge"]

    df["LapNumber"] = df.apply(_calc_lap, axis=1)
    return df


def calculate_gap_consistency(gap_df: pd.DataFrame) -> pd.DataFrame:
    """Count consecutive laps a driver stays in the same gap window.

    Adds two columns:
    - consistent_gap_ahead_laps: consecutive laps in the same ahead-gap window
    - consistent_gap_behind_laps: consecutive laps in the same behind-gap window

    Windows:
    - Ahead: undercut (<2s), overcut (2-3.5s), out_of_range (>3.5s)
    - Behind: defensive (<2s), safe (>=2s)
    """

    def _ahead_window(gap):
        if gap is None or pd.isna(gap):
            return "unknown"
        if gap < 2.0:
            return "undercut_window"
        if gap < 3.5:
            return "overcut_window"
        return "out_of_range"

    def _behind_window(gap):
        if gap is None or pd.isna(gap):
            return "unknown"
        if gap < 2.0:
            return "defensive_window"
        return "safe_window"

    result = gap_df.copy()
    result["ahead_window"] = result["GapToCarAhead"].apply(_ahead_window)
    result["behind_window"] = result["GapToCarBehind"].apply(_behind_window)
    result["consistent_gap_ahead_laps"] = 1
    result["consistent_gap_behind_laps"] = 1

    for driver in result["DriverNumber"].unique():
        driver_data = result[result["DriverNumber"] == driver].sort_values("LapNumber")
        if len(driver_data) < 2:
            continue
        for i in range(1, len(driver_data)):
            cur_idx = driver_data.iloc[i].name
            prev_idx = driver_data.iloc[i - 1].name
            if driver_data.iloc[i]["ahead_window"] == driver_data.iloc[i - 1]["ahead_window"]:
                result.loc[cur_idx, "consistent_gap_ahead_laps"] = (
                    result.loc[prev_idx, "consistent_gap_ahead_laps"] + 1
                )
            if driver_data.iloc[i]["behind_window"] == driver_data.iloc[i - 1]["behind_window"]:
                result.loc[cur_idx, "consistent_gap_behind_laps"] = (
                    result.loc[prev_idx, "consistent_gap_behind_laps"] + 1
                )

    return result


def calculate_strategic_windows(gap_data: pd.DataFrame) -> pd.DataFrame:
    """Flag undercut, overcut, and defensive opportunities per lap.

    Requires gap consistency columns from calculate_gap_consistency().
    Adds boolean columns: undercut_opportunity, overcut_opportunity,
    defensive_needed, and stint-phase flags (early/mid/late).
    """
    result = gap_data.copy()

    undercut_threshold = 2.0
    overcut_min = 2.0
    overcut_max = 3.5
    defensive_threshold = 2.0
    consistency_threshold = 3

    result["undercut_opportunity"] = (
        (result["GapToCarAhead"] < undercut_threshold)
        & (result["consistent_gap_ahead_laps"] >= consistency_threshold)
    )
    result["overcut_opportunity"] = (
        (result["GapToCarAhead"] >= overcut_min)
        & (result["GapToCarAhead"] < overcut_max)
        & (result["consistent_gap_ahead_laps"] >= consistency_threshold)
    )
    result["defensive_needed"] = (
        (result["GapToCarBehind"] < defensive_threshold)
        & (result["consistent_gap_behind_laps"] >= consistency_threshold)
    )

    if "LapNumber" in result.columns:
        early = result["LapNumber"].max() // 3
        mid = early * 2
        result["early_stint"] = result["LapNumber"] <= early
        result["mid_stint"] = (result["LapNumber"] > early) & (result["LapNumber"] <= mid)
        result["late_stint"] = result["LapNumber"] > mid

    return result
