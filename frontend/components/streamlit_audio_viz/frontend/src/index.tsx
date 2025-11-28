/**
 * Streamlit Audio Orb Component - Entry Point
 *
 * Bridges React component with Streamlit's component API.
 */

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

/**
 * Streamlit Component Wrapper
 */
class AudioOrbComponent extends StreamlitComponentBase<StreamlitProps> {
  componentDidMount() {
    // Notify Streamlit that component is ready
    Streamlit.setFrameHeight();
  }

  componentDidUpdate() {
    // Update frame height when content changes
    Streamlit.setFrameHeight();
  }

  public render(): React.ReactNode {
    const { audioBlob, isRecording, isProcessing, isPlaying, theme } = this.props.args;

    // Determine theme from Streamlit or props
    const effectiveTheme = theme || this.props.theme?.base || 'light';

    // Callback to notify Streamlit when audio ends
    const onAudioEnded = () => {
      Streamlit.setComponentValue({ audio_ended: true });
    };

    return (
      <AudioOrb
        audioBlob={audioBlob}
        isRecording={isRecording}
        isProcessing={isProcessing}
        isPlaying={isPlaying}
        theme={effectiveTheme}
        onAudioEnded={onAudioEnded}
      />
    );
  }
}

// Connect component to Streamlit
const ConnectedComponent = withStreamlitConnection(AudioOrbComponent);

// Render to DOM
ReactDOM.render(
  <React.StrictMode>
    <ConnectedComponent />
  </React.StrictMode>,
  document.getElementById('root')
);
