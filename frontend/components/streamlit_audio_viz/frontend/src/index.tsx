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
    const { audioBlob, isRecording, isProcessing, theme } = this.props.args;

    // Determine theme from Streamlit or props
    const effectiveTheme = theme || this.props.theme?.base || 'light';

    return (
      <AudioOrb
        audioBlob={audioBlob}
        isRecording={isRecording}
        isProcessing={isProcessing}
        theme={effectiveTheme}
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
