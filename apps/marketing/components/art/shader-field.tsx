'use client';

import { useEffect, useRef } from 'react';
import { luminance, readTokenRgb, type Rgb } from '@/components/art/css-color';
import { useReducedMotion } from '@/lib/motion';

/**
 * ShaderField (MARKETING-DESIGN §2.3, ADR-0045) — the hero stage's living ground: one
 * hand-written WebGL fragment shader flowing domain-warped brand color across the band,
 * plus a few drifting ember sparks. No 3D engine (design-lint bans three/@react-three).
 *
 * Reliability rules learned the hard way: the effect initializes ONCE (reduced-motion
 * arrives via a live ref, never as an effect dependency — re-inits on a shared WebGL
 * context are how canvases die); the loop always reschedules and paints every visible
 * frame (resize + theme checked in the loop, no observer state machine); the context is
 * created with alpha:true so a non-painting canvas degrades to the `.atmosphere`
 * gradient behind it instead of compositing black.
 */

const VERT = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;

uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_base;
uniform vec3 u_deep;
uniform vec3 u_rose;
uniform vec3 u_gold;
uniform float u_intensity;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float hash11(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    v += amp * vnoise(p);
    p = p * 2.03 + vec2(11.7, 5.3);
    amp *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  float aspect = u_res.x / u_res.y;
  vec2 p = uv * vec2(aspect, 1.0) * 1.55;
  float t = u_time * 0.02;

  vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
  vec2 r = vec2(
    fbm(p + 2.3 * q + vec2(1.7, 9.2) + 0.32 * t),
    fbm(p + 2.3 * q + vec2(8.3, 2.8) - 0.26 * t)
  );
  float f = fbm(p + 2.0 * r);

  /*
   * Legibility is sculpted into the field itself (no veil overlay, v4.3): a soft
   * elliptical CALM POCKET sits under the hero statement, and the field blooms at
   * full strength everywhere else.
   *
   * Tuning knobs (debug here):
   *  - POCKET center/size: the vec2(0.24, 0.62) center and vec2(2.4, 1.7) squash —
   *    grow the squash numbers to SHRINK the pocket.
   *  - POCKET depth: the 0.18 floor — raise toward 1.0 to let the field show
   *    through the pocket; lower toward 0.0 for a quieter text zone.
   *  - Overall strength: u_intensity (set from theme luminance in resolvePalette).
   */
  vec2 pocketDelta = (uv - vec2(0.24, 0.52)) * vec2(2.4, 1.7);
  float pocket = smoothstep(0.35, 1.0, length(pocketDelta));
  float calm = mix(0.18, 1.0, pocket);
  float vig = smoothstep(1.38, 0.28, distance(uv, vec2(0.56, 0.46)));
  float k = u_intensity * calm * vig;

  vec3 col = u_base;
  col = mix(col, u_deep, smoothstep(0.26, 0.84, f) * 0.78 * k);
  col = mix(col, u_rose, smoothstep(0.5, 0.96, f * length(q) * 1.7) * 0.42 * k);
  col = mix(col, u_gold, smoothstep(0.78, 0.99, length(r) * f * 1.25) * 0.18 * k);

  /* Ember sparks — a dozen slow drifters, twinkling; the hero's hint of the traffic below. */
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float speed = 0.016 + 0.014 * hash11(fi * 7.3);
    vec2 dir = normalize(vec2(hash11(fi * 3.1) - 0.5, hash11(fi * 5.7) - 0.5) + vec2(0.001));
    vec2 pos = fract(vec2(hash11(fi * 1.7), hash11(fi * 9.2)) + dir * u_time * speed);
    vec2 d = fract(uv - pos + 0.5) - 0.5;
    d *= vec2(aspect, 1.0);
    float glow = exp(-dot(d, d) * 5600.0);
    float twinkle = 0.55 + 0.45 * sin(u_time * (0.9 + hash11(fi * 4.4)) + fi * 2.1);
    vec3 ember = mix(u_rose, u_gold, step(0.78, hash11(fi * 2.9)));
    /* sparks respect the calm pocket too — nothing twinkles under the statement */
    col = mix(col, ember, clamp(glow, 0.0, 1.0) * 0.5 * twinkle * u_intensity * (0.3 + 0.7 * pocket));
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

interface ShaderPalette {
  base: Rgb;
  deep: Rgb;
  rose: Rgb;
  gold: Rgb;
  intensity: number;
}

function resolvePalette(): ShaderPalette {
  const base = readTokenRgb('--background', [0.086, 0.063, 0.075]);
  return {
    base,
    deep: readTokenRgb('--burgundy', [0.365, 0.18, 0.275]),
    rose: readTokenRgb('--rose', [0.886, 0.639, 0.659]),
    gold: readTokenRgb('--gold', [0.894, 0.714, 0.353]),
    /* The noon theme wants a whisper, not embers at full heat. */
    intensity: luminance(base) < 0.5 ? 1 : 0.42,
  };
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function ShaderField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
    });
    if (!gl) return; /* no WebGL: the .atmosphere layer behind stays the ground */

    const vert = compile(gl, gl.VERTEX_SHADER, VERT);
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const program = gl.createProgram();
    if (!vert || !frag || !program) return;
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    /* One fullscreen triangle. */
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, 'u_res');
    const uTime = gl.getUniformLocation(program, 'u_time');
    const uBase = gl.getUniformLocation(program, 'u_base');
    const uDeep = gl.getUniformLocation(program, 'u_deep');
    const uRose = gl.getUniformLocation(program, 'u_rose');
    const uGold = gl.getUniformLocation(program, 'u_gold');
    const uIntensity = gl.getUniformLocation(program, 'u_intensity');

    const applyPalette = () => {
      const palette = resolvePalette();
      gl.uniform3fv(uBase, palette.base);
      gl.uniform3fv(uDeep, palette.deep);
      gl.uniform3fv(uRose, palette.rose);
      gl.uniform3fv(uGold, palette.gold);
      gl.uniform1f(uIntensity, palette.intensity);
    };
    applyPalette();

    /* The field is smooth — render below device resolution and let CSS upscale. */
    const renderScale = Math.min(Math.max(window.devicePixelRatio * 0.6, 0.6), 1.25);
    const resize = () => {
      const w = Math.max(1, Math.round(canvas.clientWidth * renderScale));
      const h = Math.max(1, Math.round(canvas.clientHeight * renderScale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
        gl.uniform2f(uRes, w, h);
      }
    };

    let raf = 0;
    let inView = true;
    let revealed = false;
    let themeClass = '';
    const started = performance.now();

    /* Paints every visible frame — resize and theme are checked here, not in observers. */
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden || !inView) return;
      if (document.documentElement.className !== themeClass) {
        themeClass = document.documentElement.className;
        applyPalette();
      }
      resize();
      gl.uniform1f(uTime, reducedRef.current ? 40 : (now - started) / 1000 + 40);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!revealed) {
        revealed = true;
        canvas.style.opacity = '1';
      }
    };
    raf = requestAnimationFrame(frame);

    /* Skip GPU work while scrolled far past the stage (the last composite persists). */
    const intersection = new IntersectionObserver((entries) => {
      inView = entries.some((entry) => entry.isIntersecting);
    });
    intersection.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      intersection.disconnect();
      /*
       * Deliberately no WEBGL_lose_context here: the canvas element owns the context,
       * and losing it breaks the next effect run on the same element (React StrictMode
       * re-runs effects against the same DOM node). GPU resources are freed explicitly.
       */
      gl.deleteProgram(program);
      gl.deleteShader(vert);
      gl.deleteShader(frag);
      gl.deleteBuffer(buffer);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="size-full opacity-0 transition-opacity duration-700"
    />
  );
}
