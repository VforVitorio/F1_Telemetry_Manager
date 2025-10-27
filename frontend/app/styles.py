# frontend/app/styles.py

class Color:
    ACCENT = "#a78bfa"           # Purple accent
    PRIMARY_BG = "#121127"       # Dark blue-black
    SECONDARY_BG = "#1e1b4b"     # Dark indigo
    CONTENT_BG = "#181633"       # Dark violet-blue
    BORDER = "#2d2d3a"           # Dark gray


class TextColor:
    PRIMARY = "#ffffff"          # White
    SECONDARY = "#d1d5db"        # Light gray
    TERTIARY = "#9ca3af"         # Medium gray
    ACCENT = "#a78bfa"           # Purple
    AGAINST_ACCENT = "#ffffff"   # White on accent


class StatusColor:
    SUCCESS = "#10b981"          # Green
    WARNING = "#f59e0b"          # Orange
    ERROR = "#ef4444"            # Red
    INFO = "#3b82f6"             # Blue


class Font:
    DEFAULT = "'Inter', sans-serif"
    TITLE = "'Exo 2', sans-serif"
    LOGO = "'Exo 2', sans-serif"


class FontSize:
    SMALL = "0.875rem"
    MEDIUM = "1rem"
    LARGE = "1.25rem"
    XLARGE = "1.75rem"
    XXLARGE = "2rem"
    LOGO = "28px"


# Font stylesheet
FONT_STYLESHEET = "https://fonts.googleapis.com/css2?family=Exo+2:wght@400;700&family=Inter:wght@400;500;700&display=swap"

# Global CSS
GLOBAL_CSS = f"""
<style>
    @import url('{FONT_STYLESHEET}');
    
    * {{
        font-family: {Font.DEFAULT};
    }}
    
    .stApp {{
        background: linear-gradient(135deg, {Color.PRIMARY_BG} 0%, {Color.SECONDARY_BG} 100%);
    }}
    
    h1, h2, h3, h4, h5, h6 {{
        font-family: {Font.TITLE};
        color: {TextColor.ACCENT};
    }}
    
    .stButton button {{
        background-color: {Color.ACCENT};
        color: {TextColor.AGAINST_ACCENT};
        font-weight: 600;
        border-radius: 8px;
        border: none;
        transition: all 0.3s;
        font-family: {Font.DEFAULT};
    }}
    
    .stButton button:hover {{
        opacity: 0.9;
        box-shadow: 0 4px 12px rgba(167, 139, 250, 0.3);
    }}
    
    .auth-container {{
        max-width: 400px;
        margin: 0 auto;
        padding: 2rem;
        background: {Color.CONTENT_BG};
        border-radius: 12px;
        border: 1px solid {Color.BORDER};
    }}
    
    .stTextInput input {{
        background-color: {Color.SECONDARY_BG};
        border: 1px solid {Color.BORDER};
        color: {TextColor.PRIMARY};
    }}
    
    .stTextInput input:focus {{
        border-color: {Color.ACCENT};
        box-shadow: 0 0 0 1px {Color.ACCENT};
    }}
</style>
"""
