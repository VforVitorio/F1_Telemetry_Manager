"""
Loading Components

This module provides reusable loading and spinner components for the dashboard.
"""

import streamlit as st


def render_loading_spinner() -> None:
    """
    Renders a purple loading spinner (ScaleLoader style) inside a container
    that matches Plotly chart dimensions.

    This spinner is inspired by the react-spinners ScaleLoader component,
    featuring 5 vertical bars that animate in sequence with a purple color (#a78bfa).
    The container has the same dimensions as Plotly charts (width: 100%, height: 400px).

    Usage:
        from components.common.loading import render_loading_spinner

        if data is None:
            render_loading_spinner()
            return
    """
    st.markdown(
        """
        <div class="spinner-container">
            <div class="spinner-content">
                <p class="spinner-text">Waiting for telemetry data...</p>
                <div class="scale-loader">
                    <div></div>
                    <div></div>
                    <div></div>
                    <div></div>
                    <div></div>
                </div>
            </div>
        </div>
        <style>
        .spinner-container {
            width: 100%;
            height: 400px;
            display: flex;
            justify-content: center;
            align-items: center;
            border: 2px solid #a78bfa;
            border-radius: 12px;
            padding: 40px;
            background-color: #181633;
            margin: 20px 0;
            box-shadow: 0 4px 12px rgba(167, 139, 250, 0.2);
        }
        .spinner-content {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 20px;
        }
        .spinner-text {
            color: #d1d5db;
            font-family: 'Inter', sans-serif;
            font-size: 18px;
            font-weight: 400;
            margin: 0;
            letter-spacing: 0.5px;
        }
        .scale-loader {
            display: flex;
            gap: 8px;
            align-items: flex-end;
        }
        .scale-loader div {
            width: 4px;
            height: 35px;
            background-color: #a78bfa;
            border-radius: 2px;
            animation: scale-loader 1s ease-in-out infinite;
        }
        .scale-loader div:nth-child(1) {
            animation-delay: 0s;
        }
        .scale-loader div:nth-child(2) {
            animation-delay: 0.1s;
        }
        .scale-loader div:nth-child(3) {
            animation-delay: 0.2s;
        }
        .scale-loader div:nth-child(4) {
            animation-delay: 0.3s;
        }
        .scale-loader div:nth-child(5) {
            animation-delay: 0.4s;
        }
        @keyframes scale-loader {
            0%, 40%, 100% {
                transform: scaleY(0.4);
            }
            20% {
                transform: scaleY(1);
            }
        }
        </style>
        """,
        unsafe_allow_html=True
    )
