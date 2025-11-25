/**
 * TypeScript Type Definitions for Audio Orb Component
 */

export interface ComponentProps {
  audioBlob?: Blob | null;
  isRecording: boolean;
  isProcessing: boolean;
  theme?: 'light' | 'dark';
}

export interface StreamlitTheme {
  base: 'light' | 'dark';
  primaryColor: string;
  backgroundColor: string;
  secondaryBackgroundColor: string;
  textColor: string;
  font: string;
}

export interface StreamlitProps {
  args: ComponentProps;
  theme?: StreamlitTheme;
  disabled: boolean;
}

export type OrbState = 'idle' | 'recording' | 'processing';
