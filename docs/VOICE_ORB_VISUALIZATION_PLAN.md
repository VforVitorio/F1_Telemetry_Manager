# Voice Orb Visualization Implementation Plan

Complete plan for implementing ChatGPT-style voice orb using React Audio Visualizers in Streamlit.

## 📋 Overview

**Goal:** Create an animated orb that visualizes audio in real-time during voice chat interactions.

**Technology Stack:**
- React 18.2.0 (frontend component)
- react-audio-visualizers 1.2.0 (visualization library)
- Streamlit Component API (bridge)
- TypeScript (type safety)
- Webpack 5 (bundling)

**Integration:** Custom Streamlit component with bidirectional Python ↔ React communication.

---

## 🎯 Phase 3: Voice Orb Visualization

### Milestone 3.1: Setup Component Structure

**Objective:** Create the base structure for the Streamlit React component.

#### Tasks:

1. **Install Python dependencies**
   ```bash
   cd frontend
   pip install streamlit-component-lib==1.0.0
   ```

2. **Create component directory structure**
   ```bash
   cd frontend/components
   mkdir -p streamlit_audio_viz/frontend
   cd streamlit_audio_viz
   ```

3. **Initialize React project**
   ```bash
   cd frontend
   npm init -y
   ```

4. **Install Node.js dependencies**
   ```bash
   # Core dependencies
   npm install react@18.2.0 react-dom@18.2.0
   npm install react-audio-visualizers@1.2.0
   npm install streamlit-component-lib@1.3.0

   # TypeScript
   npm install --save-dev typescript@5.0.4
   npm install --save-dev @types/react@18.2.0
   npm install --save-dev @types/react-dom@18.2.0

   # Build tools
   npm install --save-dev webpack@5.88.0
   npm install --save-dev webpack-cli@5.1.4
   npm install --save-dev ts-loader@9.4.3
   npm install --save-dev html-webpack-plugin@5.5.3
   npm install --save-dev copy-webpack-plugin@11.0.0
   ```

#### File Structure:
```
frontend/components/streamlit_audio_viz/
├── __init__.py                      # Python wrapper
├── frontend/
│   ├── package.json                 # Node dependencies
│   ├── tsconfig.json                # TypeScript config
│   ├── webpack.config.js            # Build config
│   ├── public/
│   │   └── index.html               # HTML template
│   ├── src/
│   │   ├── index.tsx                # Entry point
│   │   ├── AudioOrb.tsx             # Main orb component
│   │   ├── types.ts                 # TypeScript types
│   │   └── styles.css               # Styles
│   └── build/                       # Built files (generated)
└── README.md                        # Component docs
```

---

### Milestone 3.2: Implement React Component

**Objective:** Create the audio visualization orb using react-audio-visualizers.

#### Tasks:

1. **Create TypeScript types** (`src/types.ts`)
   ```typescript
   export interface ComponentProps {
     audioBlob?: Blob | null;
     isRecording: boolean;
     isProcessing: boolean;
     theme?: 'light' | 'dark';
   }

   export interface StreamlitProps {
     args: ComponentProps;
     theme?: {
       base: 'light' | 'dark';
       primaryColor: string;
       backgroundColor: string;
       secondaryBackgroundColor: string;
       textColor: string;
     };
   }
   ```

2. **Create AudioOrb component** (`src/AudioOrb.tsx`)
   ```typescript
   import React, { useEffect, useRef } from 'react';
   import { AudioVisualizer } from 'react-audio-visualizers';
   import { ComponentProps } from './types';

   export const AudioOrb: React.FC<ComponentProps> = ({
     audioBlob,
     isRecording,
     isProcessing,
     theme = 'light'
   }) => {
     const orbRef = useRef<HTMLDivElement>(null);

     return (
       <div className={`orb-container ${theme}`} ref={orbRef}>
         {isRecording && audioBlob && (
           <AudioVisualizer
             blob={audioBlob}
             width={300}
             height={300}
             barWidth={3}
             gap={2}
             barColor={theme === 'dark' ? '#3498db' : '#2980b9'}
             backgroundColor="transparent"
             barPlayedColor="#e74c3c"
           />
         )}

         {isProcessing && (
           <div className="processing-orb">
             <div className="pulse-ring"></div>
             <div className="pulse-ring-2"></div>
           </div>
         )}

         {!isRecording && !isProcessing && (
           <div className="idle-orb">
             <div className="gradient-orb"></div>
           </div>
         )}
       </div>
     );
   };
   ```

3. **Create main entry point** (`src/index.tsx`)
   ```typescript
   import React from 'react';
   import ReactDOM from 'react-dom';
   import {
     Streamlit,
     StreamlitComponentBase,
     withStreamlitConnection
   } from 'streamlit-component-lib';
   import { AudioOrb } from './AudioOrb';
   import { StreamlitProps } from './types';
   import './styles.css';

   class AudioOrbComponent extends StreamlitComponentBase<StreamlitProps> {
     public render(): React.ReactNode {
       const { audioBlob, isRecording, isProcessing, theme } = this.props.args;

       return (
         <AudioOrb
           audioBlob={audioBlob}
           isRecording={isRecording}
           isProcessing={isProcessing}
           theme={theme || this.props.theme?.base || 'light'}
         />
       );
     }
   }

   const ConnectedComponent = withStreamlitConnection(AudioOrbComponent);

   ReactDOM.render(
     <React.StrictMode>
       <ConnectedComponent />
     </React.StrictMode>,
     document.getElementById('root')
   );
   ```

4. **Create styles** (`src/styles.css`)
   ```css
   .orb-container {
     display: flex;
     justify-content: center;
     align-items: center;
     width: 100%;
     height: 350px;
     position: relative;
   }

   /* Processing state - pulsing rings */
   .processing-orb {
     position: relative;
     width: 200px;
     height: 200px;
   }

   .pulse-ring {
     position: absolute;
     width: 100%;
     height: 100%;
     border: 3px solid #3498db;
     border-radius: 50%;
     animation: pulse 1.5s ease-out infinite;
   }

   .pulse-ring-2 {
     position: absolute;
     width: 100%;
     height: 100%;
     border: 3px solid #3498db;
     border-radius: 50%;
     animation: pulse 1.5s ease-out 0.5s infinite;
   }

   @keyframes pulse {
     0% {
       transform: scale(0.5);
       opacity: 1;
     }
     100% {
       transform: scale(1.2);
       opacity: 0;
     }
   }

   /* Idle state - gradient orb */
   .idle-orb {
     width: 150px;
     height: 150px;
   }

   .gradient-orb {
     width: 100%;
     height: 100%;
     border-radius: 50%;
     background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
     box-shadow: 0 10px 40px rgba(102, 126, 234, 0.3);
     animation: float 3s ease-in-out infinite;
   }

   @keyframes float {
     0%, 100% {
       transform: translateY(0px);
     }
     50% {
       transform: translateY(-10px);
     }
   }

   /* Dark theme */
   .orb-container.dark .gradient-orb {
     background: linear-gradient(135deg, #3498db 0%, #2c3e50 100%);
     box-shadow: 0 10px 40px rgba(52, 152, 219, 0.4);
   }
   ```

5. **Create build configuration** (`webpack.config.js`)
   ```javascript
   const path = require('path');
   const HtmlWebpackPlugin = require('html-webpack-plugin');
   const CopyPlugin = require('copy-webpack-plugin');

   module.exports = {
     entry: './src/index.tsx',
     output: {
       path: path.resolve(__dirname, 'build'),
       filename: 'bundle.js',
     },
     resolve: {
       extensions: ['.ts', '.tsx', '.js', '.jsx'],
     },
     module: {
       rules: [
         {
           test: /\.tsx?$/,
           use: 'ts-loader',
           exclude: /node_modules/,
         },
         {
           test: /\.css$/,
           use: ['style-loader', 'css-loader'],
         },
       ],
     },
     plugins: [
       new HtmlWebpackPlugin({
         template: './public/index.html',
       }),
     ],
     devtool: 'source-map',
   };
   ```

6. **Create TypeScript config** (`tsconfig.json`)
   ```json
   {
     "compilerOptions": {
       "target": "ES2020",
       "module": "ESNext",
       "lib": ["ES2020", "DOM"],
       "jsx": "react",
       "strict": true,
       "esModuleInterop": true,
       "skipLibCheck": true,
       "forceConsistentCasingInFileNames": true,
       "moduleResolution": "node",
       "resolveJsonModule": true,
       "isolatedModules": true,
       "outDir": "./build"
     },
     "include": ["src/**/*"],
     "exclude": ["node_modules", "build"]
   }
   ```

7. **Update package.json scripts**
   ```json
   {
     "scripts": {
       "start": "webpack serve --mode development --port 3001",
       "build": "webpack --mode production"
     }
   }
   ```

---

### Milestone 3.3: Create Python Wrapper

**Objective:** Create Python interface to use the React component in Streamlit.

#### Tasks:

1. **Create Python wrapper** (`__init__.py`)
   ```python
   """
   Audio Orb Visualization Component

   Custom Streamlit component for visualizing audio with an animated orb.
   """

   import os
   import streamlit.components.v1 as components
   from typing import Optional

   # Create component
   _RELEASE = True  # Set to False during development

   if not _RELEASE:
       _component_func = components.declare_component(
           "audio_orb",
           url="http://localhost:3001",  # Dev server
       )
   else:
       parent_dir = os.path.dirname(os.path.abspath(__file__))
       build_dir = os.path.join(parent_dir, "frontend/build")
       _component_func = components.declare_component(
           "audio_orb",
           path=build_dir
       )


   def audio_orb(
       audio_blob: Optional[bytes] = None,
       is_recording: bool = False,
       is_processing: bool = False,
       theme: str = "light",
       key: Optional[str] = None
   ):
       """
       Display an animated audio orb visualization.

       Args:
           audio_blob: Raw audio bytes for visualization
           is_recording: True if currently recording audio
           is_processing: True if processing (transcription/TTS)
           theme: Color theme ('light' or 'dark')
           key: Unique key for the component

       Returns:
           Component value (None in this case)
       """
       return _component_func(
           audioBlob=audio_blob,
           isRecording=is_recording,
           isProcessing=is_processing,
           theme=theme,
           key=key,
           default=None
       )
   ```

2. **Create component README** (`README.md`)
   ```markdown
   # Audio Orb Visualization Component

   Custom Streamlit component for voice chat audio visualization.

   ## Development

   ```bash
   # Install dependencies
   cd frontend
   npm install

   # Start dev server
   npm start

   # Build for production
   npm run build
   ```

   ## Usage

   ```python
   from components.streamlit_audio_viz import audio_orb

   # Show orb while recording
   audio_orb(
       audio_blob=audio_bytes,
       is_recording=True,
       theme="dark"
   )

   # Show orb while processing
   audio_orb(is_processing=True)
   ```
   ```

---

### Milestone 3.4: Integrate with Voice Chat

**Objective:** Integrate the orb component into the voice chat interface.

#### Tasks:

1. **Update voice_chat.py**
   ```python
   # Add import
   from components.streamlit_audio_viz import audio_orb

   # In render_voice_input():
   def render_voice_input():
       # Show orb visualization
       col1, col2, col3 = st.columns([1, 2, 1])
       with col2:
           audio_orb(
               audio_blob=st.session_state.get('current_audio'),
               is_recording=st.session_state.get('is_recording', False),
               is_processing=st.session_state.get('voice_processing', False),
               theme="dark" if st.get_option("theme.base") == "dark" else "light",
               key="voice_orb"
           )

       # ... rest of input logic
   ```

2. **Update voice state management**
   ```python
   def initialize_voice_state():
       if 'current_audio' not in st.session_state:
           st.session_state.current_audio = None
       if 'is_recording' not in st.session_state:
           st.session_state.is_recording = False
   ```

3. **Update recording callbacks**
   ```python
   def on_recording_start():
       st.session_state.is_recording = True

   def on_recording_stop(audio_bytes):
       st.session_state.is_recording = False
       st.session_state.current_audio = audio_bytes
   ```

---

### Milestone 3.5: Build and Deploy

**Objective:** Build the component for production use.

#### Tasks:

1. **Build React component**
   ```bash
   cd frontend/components/streamlit_audio_viz/frontend
   npm run build
   ```

2. **Test in production mode**
   ```python
   # In __init__.py, set:
   _RELEASE = True
   ```

3. **Verify component loads**
   ```bash
   streamlit run frontend/app/main.py
   ```

4. **Update requirements.txt**
   ```txt
   # Add to frontend/requirements.txt
   streamlit-component-lib==1.0.0
   ```

---

## 📊 Testing Checklist

- [ ] Component builds without errors
- [ ] Orb displays in idle state
- [ ] Orb animates during recording
- [ ] Orb shows processing state
- [ ] Audio visualization reacts to audio input
- [ ] Theme switches work (light/dark)
- [ ] Component works in both dev and production mode
- [ ] No console errors in browser
- [ ] Component doesn't slow down Streamlit
- [ ] Works across different browsers

---

## 🎨 Customization Options

After basic implementation, these features can be added:

1. **Color schemes**
   - Match F1 team colors
   - Custom gradient options
   - Animated color transitions

2. **Visualization styles**
   - Different visualizer types (bars, waveform, circular)
   - Particle effects
   - Smooth transitions between states

3. **Interactions**
   - Click to start/stop recording
   - Volume control
   - Playback controls

4. **Animations**
   - More sophisticated idle animations
   - Processing state variations
   - Success/error state indicators

---

## 🐛 Troubleshooting

### Build Issues

**Issue:** `npm install` fails
```bash
# Clear cache and retry
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

**Issue:** TypeScript errors
```bash
# Verify TypeScript version
npm list typescript
# Should be 5.0.4
```

### Component Not Loading

**Issue:** Component not showing in Streamlit
- Check `_RELEASE` flag in `__init__.py`
- Verify build directory exists: `frontend/build/`
- Check browser console for errors

**Issue:** "AudioVisualizer is not defined"
- Verify react-audio-visualizers is installed
- Check import statement in AudioOrb.tsx

### Performance Issues

**Issue:** UI lag during recording
- Reduce visualizer complexity (fewer bars)
- Lower update frequency
- Use requestAnimationFrame for smooth rendering

---

## 📚 Documentation

- [Streamlit Components API](https://docs.streamlit.io/library/components/components-api)
- [React Audio Visualizers](https://docs-react-audio-visualizers.vercel.app/)
- [Webpack Documentation](https://webpack.js.org/concepts/)

---

## ✅ Completion Criteria

Phase 3 is complete when:
1. ✅ Component builds and runs without errors
2. ✅ Orb visualizes audio in real-time
3. ✅ All three states work (idle, recording, processing)
4. ✅ Component integrates seamlessly with voice chat
5. ✅ Performance is acceptable (no lag)
6. ✅ Works in production mode
7. ✅ Documentation is complete

---

## 🎯 Next Steps After Phase 3

1. Polish animations and transitions
2. Add more visualization styles
3. Optimize performance
4. Add accessibility features
5. Create user preferences for orb appearance
