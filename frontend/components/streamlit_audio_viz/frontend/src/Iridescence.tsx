/**
 * Iridescence Component
 *
 * WebGL-based iridescent shader effect using OGL.
 * Creates a flowing, organic animation that reacts to audio.
 */

import React, { useRef, useEffect } from 'react';
import { Color, Mesh, Program, Renderer, Triangle } from 'ogl';

// Vertex shader - basic passthrough
const vertexShader = `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0, 1);
}
`;

// Fragment shader - creates the iridescent effect (from Medium article)
const fragmentShader = `
precision highp float;
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uResolution;
uniform vec2 uMouse;
uniform float uAmplitude;
uniform float uSpeed;
varying vec2 vUv;

void main() {
  float mr = min(uResolution.x, uResolution.y);
  vec2 uv = (vUv * 2.0 - 1.0) * uResolution.xy / mr;
  float d = -uTime * 0.8 * uSpeed;
  float a = 0.0;

  // Create layered cosine patterns for iridescent effect
  // Increased iterations and complexity for more "swirly" movement
  for (float i = 0.0; i < 10.0; ++i) {
    a += cos(i - d - a * uv.x + uv.y * 0.5);
    d += sin(uv.y * i + a + uv.x * 0.5);
  }

  // Generate color with flowing patterns
  vec3 col = vec3(cos(uv * vec2(d, a)) * 0.6 + 0.4, cos(a + d) * 0.5 + 0.5);
  col = cos(col * cos(vec3(d, a, 2.5)) * 0.5 + 0.5) * uColor;

  gl_FragColor = vec4(col, 1.0);
}
`;

interface IridescenceProps {
  color?: [number, number, number];
  speed?: number;
  amplitude?: number;
  theme?: string;
}

export const Iridescence: React.FC<IridescenceProps> = ({
  color = [0.6, 0.3, 1.0], // Purple default
  speed = 0.1,
  amplitude = 0.1,
  theme = 'dark'
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const programRef = useRef<Program | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!containerRef.current) return;

    // Create renderer with transparency
    const renderer = new Renderer({
      alpha: true,
      premultipliedAlpha: false
    });
    rendererRef.current = renderer;
    const { gl } = renderer;

    // Enable blending for transparency
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Set clear color to match app background
    // Dark theme: #14132e = rgb(20, 19, 46) = (0.078, 0.075, 0.180)
    // Light theme: #ffffff = rgb(255, 255, 255) = (1.0, 1.0, 1.0)
    if (theme === 'dark') {
      gl.clearColor(0.078, 0.075, 0.180, 1.0);
      gl.canvas.style.backgroundColor = '#14132e';
    } else {
      gl.clearColor(1.0, 1.0, 1.0, 1.0);
      gl.canvas.style.backgroundColor = '#ffffff';
    }

    // Set canvas size (high resolution, CSS scales to 200x200)
    renderer.setSize(400, 400);

    // Create geometry (full-screen triangle)
    const geometry = new Triangle(gl);

    // Create shader program
    const program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new Color(...color) },
        uResolution: {
          value: new Color(
            gl.canvas.width,
            gl.canvas.height,
            gl.canvas.width / gl.canvas.height
          )
        },
        uMouse: { value: new Float32Array([0.5, 0.5]) },
        uAmplitude: { value: amplitude },
        uSpeed: { value: speed },
      },
    });
    programRef.current = program;

    // Create mesh
    const mesh = new Mesh(gl, { geometry, program });

    // Animation loop
    const animate = (t: number) => {
      // Clear with transparent color
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      program.uniforms.uTime.value = t * 0.001;
      renderer.render({ scene: mesh });
      rafRef.current = requestAnimationFrame(animate);
    };
    animate(0);

    // Append canvas to container
    containerRef.current.appendChild(gl.canvas);

    // Cleanup
    return () => {
      cancelAnimationFrame(rafRef.current);
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) {
        ext.loseContext();
      }
      if (containerRef.current && gl.canvas.parentNode === containerRef.current) {
        containerRef.current.removeChild(gl.canvas);
      }
    };
  }, []);

  // Update uniforms when props change
  useEffect(() => {
    if (programRef.current) {
      programRef.current.uniforms.uAmplitude.value = amplitude;
      programRef.current.uniforms.uSpeed.value = speed;
      programRef.current.uniforms.uColor.value = new Color(...color);
    }
  }, [amplitude, speed, color]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    />
  );
};

export default Iridescence;
