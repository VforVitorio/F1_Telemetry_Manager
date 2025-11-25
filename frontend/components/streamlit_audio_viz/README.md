# Audio Orb Visualization Component

Custom Streamlit component for voice chat audio visualization using React Audio Visualizers.

## 🎨 Features

- **Three states:**
  - Idle: Gradient orb with floating animation
  - Recording: Real-time audio visualization
  - Processing: Pulsing rings animation
- **Theme support:** Light and dark modes
- **Smooth transitions** between states
- **Real-time audio visualization** with react-audio-visualizers

## 📦 Installation

### Prerequisites

- Node.js v16+ and npm v8+
- Python 3.10+

### Setup

```bash
# Install Python dependencies (from frontend root)
cd frontend
pip install -r requirements.txt

# Install Node dependencies
cd components/streamlit_audio_viz/frontend
npm install
```

## 🚀 Development

### Start Development Server

```bash
cd frontend/components/streamlit_audio_viz/frontend
npm start
```

This starts a dev server on `http://localhost:3001`.

### Enable Development Mode

In `__init__.py`, set:
```python
_RELEASE = False
```

Then run your Streamlit app:
```bash
cd frontend
streamlit run app/main.py
```

### Build for Production

```bash
cd frontend/components/streamlit_audio_viz/frontend
npm run build
```

Set in `__init__.py`:
```python
_RELEASE = True
```

## 📖 Usage

### Basic Usage

```python
from components.streamlit_audio_viz import audio_orb

# Show idle orb
audio_orb()
```

### Recording with Audio Visualization

```python
# While recording
audio_orb(
    audio_blob=audio_bytes,  # Raw audio bytes
    is_recording=True,
    theme="dark"
)
```

### Processing State

```python
# While transcribing or synthesizing
audio_orb(
    is_processing=True,
    theme="light"
)
```

### Complete Example

```python
import streamlit as st
from components.streamlit_audio_viz import audio_orb
from audio_recorder_streamlit import audio_recorder

st.title("Voice Chat with Audio Orb")

# Initialize state
if 'is_recording' not in st.session_state:
    st.session_state.is_recording = False
if 'is_processing' not in st.session_state:
    st.session_state.is_processing = False

# Show orb based on state
audio_orb(
    is_recording=st.session_state.is_recording,
    is_processing=st.session_state.is_processing,
    theme="dark"
)

# Record audio
audio_bytes = audio_recorder()
if audio_bytes:
    st.session_state.is_recording = True
    # Process audio...
```

## 🎨 Customization

### Themes

The component supports two themes:
- `"light"`: Blue/purple gradient
- `"dark"`: Blue gradient with darker tones

The theme automatically adapts to Streamlit's theme if not specified.

### Modifying Styles

Edit `frontend/src/styles.css` to customize:
- Orb colors and gradients
- Animation speeds and effects
- Size and positioning
- Pulsing ring colors

### Modifying Visualizer

Edit `frontend/src/AudioOrb.tsx` to customize:
- Bar width and gap
- Bar colors
- Background color
- Visualizer size

## 🏗️ Architecture

```
streamlit_audio_viz/
├── __init__.py                    # Python wrapper
├── frontend/
│   ├── package.json               # Node dependencies
│   ├── tsconfig.json              # TypeScript config
│   ├── webpack.config.js          # Build config
│   ├── public/
│   │   └── index.html             # HTML template
│   ├── src/
│   │   ├── index.tsx              # Entry point
│   │   ├── AudioOrb.tsx           # Main component
│   │   ├── types.ts               # TypeScript types
│   │   └── styles.css             # Styles
│   └── build/                     # Built files (generated)
└── README.md                      # This file
```

## 🐛 Troubleshooting

### Component not showing

1. Check `_RELEASE` flag in `__init__.py`
2. If `_RELEASE = False`, ensure dev server is running
3. If `_RELEASE = True`, ensure `npm run build` was executed
4. Check browser console for errors

### "Module not found" errors

```bash
cd frontend/components/streamlit_audio_viz/frontend
rm -rf node_modules package-lock.json
npm install
```

### Build fails

```bash
# Clear cache
npm cache clean --force
rm -rf node_modules build
npm install
npm run build
```

### Audio visualization not showing

- Verify audio_blob is valid bytes
- Check that react-audio-visualizers is installed
- Ensure is_recording is set to True

## 📚 Dependencies

### JavaScript
- react@18.2.0
- react-dom@18.2.0
- react-audio-visualizers@1.2.0
- streamlit-component-lib@1.3.0
- typescript@5.0.4
- webpack@5.88.0

### Python
- streamlit-component-lib==1.0.0

## 📄 License

MIT

## 🤝 Contributing

Feel free to customize and extend this component for your needs!
