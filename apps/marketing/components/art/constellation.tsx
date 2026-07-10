'use client';

import { useEffect, useRef } from 'react';
import {
  TELEMETRY_SEED,
  type ConstellationTelemetry,
} from '@/components/art/constellation-contract';
import { luminance, readToken, readTokenRgb, rgba, type Rgb } from '@/components/art/css-color';
import { useReducedMotion } from '@/lib/motion';

/**
 * Constellation (MARKETING-DESIGN §3.3, ADR-0045 v4.2) — the product's knowledge graph
 * drawn as an isometric constellation on Canvas-2D: a fixed yaw+pitch camera projects
 * every node as a three-face cube (top lit, front mid, side shaded, ground shadow), so
 * the scene reads as 3D without a 3D engine. Portrait viewports rotate the ground plane
 * a quarter turn: sources above, agents below.
 *
 * The scene is randomized per visit within composed bounds — source clusters fan into
 * items → files → symbols, and each agent carries live sessions whose tool calls nest
 * further. Traffic is weighted: heavier packets are larger, slower, sag the edge they
 * ride (rope physics — the LINKS move, the nodes hold their ground), and carry an
 * identity shown on hover (the hovered packet holds still to be read). Arrivals
 * illuminate the receiving cube itself — faces warm toward the packet tone and the rim
 * brightens, easing back down. No halos, no rings, no flicker.
 *
 * Decorative-interactive (memory: decorative-interactive-canvas-pattern): aria-hidden +
 * keyboard-inert with a sibling text alternative; page scroll always wins; hover
 * highlights a subtree (or identifies a packet), click toggles a node offline and the
 * traffic reroutes or fizzles; reduced motion renders the frozen layout with zero
 * packets. Colors resolve from CSS tokens in the paint path (theme-safe); the effect
 * initializes once (reduced-motion arrives via a live ref).
 */

/* ------------------------------------------------------------------ model */

type Tone = 'ivory' | 'rose' | 'gold' | 'clay';
type NodeKind = 'hub' | 'cluster' | 'item' | 'leaf' | 'agent' | 'session' | 'tool';

interface GraphNode {
  id: number;
  label: string | null;
  kind: NodeKind;
  parent: number;
  tone: Tone;
  /** world coords: x across, z into the plane, y height above it */
  x: number;
  y: number;
  z: number;
  size: number;
  phase: number;
  enabled: boolean;
  active: boolean;
  /** arrival illumination 0..1 (eased down) */
  flash: number;
}

interface GraphEdge {
  a: number;
  b: number;
  kind: 'tree' | 'serve' | 'cross';
  bend: number;
}

type PacketTone = 'rose' | 'gold' | 'clay';

interface Packet {
  path: number[];
  seg: number;
  t: number;
  /** physical weight — size, speed, and rope sag all derive from it */
  weight: number;
  speed: number;
  size: number;
  tone: PacketTone;
  fade: number;
  kindLabel: string;
  fromLabel: string;
  toLabel: string;
}

/* ---------------------------------------------------------------- scene */

/** mulberry32 — seeded per visit: every load composes a fresh constellation. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ClusterSpec {
  label: string;
  tone: Tone;
  angle: number;
  leafChance: number;
}

/* Sources fan across the left hemisphere; agents ring the right. Product-honest. */
const CLUSTER_SPECS: ClusterSpec[] = [
  { label: 'docs · architecture', tone: 'clay', angle: 96, leafChance: 0.6 },
  { label: 'git history', tone: 'gold', angle: 132, leafChance: 0.35 },
  { label: 'repo · api', tone: 'clay', angle: 166, leafChance: 0.9 },
  { label: 'repo · web', tone: 'clay', angle: 198, leafChance: 0.9 },
  { label: 'decisions · ADRs', tone: 'rose', angle: 230, leafChance: 0.45 },
  { label: 'memory · lessons', tone: 'rose', angle: 264, leafChance: 0.55 },
];

const AGENT_SPECS = [
  { label: 'claude code', angle: -40 },
  { label: 'cursor', angle: -20 },
  { label: 'gemini', angle: 0 },
  { label: 'cline', angle: 20 },
  { label: 'codex', angle: 40 },
];

const RAD = Math.PI / 180;

function buildScene(seed: number): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const rand = mulberry32(seed);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const push = (node: Omit<GraphNode, 'id' | 'enabled' | 'active' | 'flash' | 'phase'>) => {
    const id = nodes.length;
    nodes.push({
      ...node,
      id,
      enabled: true,
      active: true,
      flash: 0,
      phase: rand() * Math.PI * 2,
    });
    return id;
  };

  const hub = push({
    label: 'tessera',
    kind: 'hub',
    parent: -1,
    tone: 'gold',
    x: 0,
    y: 0,
    z: 0,
    size: 26,
  });

  for (const spec of CLUSTER_SPECS) {
    const cr = 250 + rand() * 70;
    const ca = spec.angle * RAD;
    const cx = Math.cos(ca) * cr;
    const cz = Math.sin(ca) * cr;
    const cy = (rand() - 0.5) * 70;
    const cluster = push({
      label: spec.label,
      kind: 'cluster',
      parent: hub,
      tone: spec.tone,
      x: cx,
      y: cy,
      z: cz,
      size: 11.5,
    });
    edges.push({ a: hub, b: cluster, kind: 'tree', bend: (rand() - 0.5) * 44 });

    /* randomized fan-out per visit: 4–7 items, leaves, and 4th-level symbols */
    const itemCount = 4 + Math.floor(rand() * 4);
    for (let i = 0; i < itemCount; i += 1) {
      const spread = ((i - (itemCount - 1) / 2) / Math.max(1, itemCount - 1)) * 112 * RAD;
      const ia = ca + spread + (rand() - 0.5) * 0.3;
      const ir = 74 + rand() * 54;
      const item = push({
        label: null,
        kind: 'item',
        parent: cluster,
        tone: spec.tone,
        x: cx + Math.cos(ia) * ir,
        y: cy + (rand() - 0.5) * 60,
        z: cz + Math.sin(ia) * ir,
        size: 6.5,
      });
      edges.push({ a: cluster, b: item, kind: 'tree', bend: (rand() - 0.5) * 26 });

      const leafCount = rand() < spec.leafChance ? 1 + Math.round(rand()) : 0;
      for (let l = 0; l < leafCount; l += 1) {
        const la = ia + (rand() - 0.5) * 1.6;
        const lr = 34 + rand() * 24;
        const parentItem = nodes[item];
        if (!parentItem) continue;
        const leaf = push({
          label: null,
          kind: 'leaf',
          parent: item,
          tone: spec.tone,
          x: parentItem.x + Math.cos(la) * lr,
          y: parentItem.y + (rand() - 0.5) * 44,
          z: parentItem.z + Math.sin(la) * lr,
          size: 4.2,
        });
        edges.push({ a: item, b: leaf, kind: 'tree', bend: (rand() - 0.5) * 14 });

        if (rand() < 0.32) {
          const parentLeaf = nodes[leaf];
          if (!parentLeaf) continue;
          const sa = la + (rand() - 0.5) * 1.8;
          const sub = push({
            label: null,
            kind: 'leaf',
            parent: leaf,
            tone: spec.tone,
            x: parentLeaf.x + Math.cos(sa) * (22 + rand() * 16),
            y: parentLeaf.y + (rand() - 0.5) * 30,
            z: parentLeaf.z + Math.sin(sa) * (22 + rand() * 16),
            size: 3,
          });
          edges.push({ a: leaf, b: sub, kind: 'tree', bend: (rand() - 0.5) * 10 });
        }
      }
    }
  }

  for (const spec of AGENT_SPECS) {
    const ar = 300 + rand() * 50;
    const aa = spec.angle * RAD;
    const agent = push({
      label: spec.label,
      kind: 'agent',
      parent: -1,
      tone: 'rose',
      x: Math.cos(aa) * ar,
      y: (rand() - 0.5) * 50,
      z: Math.sin(aa) * ar,
      size: 10,
    });
    edges.push({ a: hub, b: agent, kind: 'serve', bend: (rand() - 0.5) * 36 });

    /* live sessions per agent, and the tool calls nesting inside them — randomized */
    const sessionCount = 1 + Math.floor(rand() * 3);
    for (let s = 0; s < sessionCount; s += 1) {
      const sa = aa + (rand() - 0.5) * 0.9;
      const sr = 52 + rand() * 36;
      const agentNode = nodes[agent];
      if (!agentNode) continue;
      const session = push({
        label: null,
        kind: 'session',
        parent: agent,
        tone: 'rose',
        x: agentNode.x + Math.cos(sa) * sr,
        y: agentNode.y + (rand() - 0.5) * 36,
        z: agentNode.z + Math.sin(sa) * sr,
        size: 4,
      });
      edges.push({ a: agent, b: session, kind: 'serve', bend: (rand() - 0.5) * 14 });

      const toolCount = rand() < 0.6 ? 1 + Math.floor(rand() * 2) : 0;
      for (let t = 0; t < toolCount; t += 1) {
        const ta = sa + (rand() - 0.5) * 1.4;
        const sessionNode = nodes[session];
        if (!sessionNode) continue;
        const tool = push({
          label: null,
          kind: 'tool',
          parent: session,
          tone: 'rose',
          x: sessionNode.x + Math.cos(ta) * (26 + rand() * 18),
          y: sessionNode.y + (rand() - 0.5) * 26,
          z: sessionNode.z + Math.sin(ta) * (26 + rand() * 18),
          size: 3.1,
        });
        edges.push({ a: session, b: tool, kind: 'serve', bend: (rand() - 0.5) * 10 });

        if (rand() < 0.35) {
          const toolNode = nodes[tool];
          if (!toolNode) continue;
          const na = ta + (rand() - 0.5) * 1.6;
          const nested = push({
            label: null,
            kind: 'tool',
            parent: tool,
            tone: 'rose',
            x: toolNode.x + Math.cos(na) * (18 + rand() * 12),
            y: toolNode.y + (rand() - 0.5) * 20,
            z: toolNode.z + Math.sin(na) * (18 + rand() * 12),
            size: 2.5,
          });
          edges.push({ a: tool, b: nested, kind: 'serve', bend: (rand() - 0.5) * 8 });
        }
      }
    }
  }

  /* Cross-links — the knowledge-graph tell: an ADR knows a symbol, a lesson knows a file. */
  const items = nodes.filter((n) => n.kind === 'item');
  for (let i = 0; i < 9; i += 1) {
    const a = items[Math.floor(rand() * items.length)];
    const b = items[Math.floor(rand() * items.length)];
    if (!a || !b || a.id === b.id || a.parent === b.parent) continue;
    edges.push({ a: a.id, b: b.id, kind: 'cross', bend: (rand() - 0.5) * 70 });
  }

  return { nodes, edges };
}

/* ---------------------------------------------------------------- inks */

interface Inks {
  darkGround: boolean;
  background: Rgb;
  foreground: Rgb;
  card: Rgb;
  rose: Rgb;
  gold: Rgb;
  clay: Rgb;
  mutedText: string;
  sans: string;
  serif: string;
  glow: Record<Tone, HTMLCanvasElement>;
}

function makeGlowSprite(color: Rgb, alpha: number): HTMLCanvasElement {
  const sprite = document.createElement('canvas');
  sprite.width = 64;
  sprite.height = 64;
  const ctx = sprite.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, rgba(color, alpha));
    gradient.addColorStop(0.55, rgba(color, alpha * 0.28));
    gradient.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  }
  return sprite;
}

function resolveInks(): Inks {
  const background = readTokenRgb('--background', [0.086, 0.063, 0.075]);
  const dark = luminance(background) < 0.5;
  const foreground = readTokenRgb('--foreground', [0.957, 0.929, 0.906]);
  const rose = readTokenRgb('--rose', [0.886, 0.639, 0.659]);
  const gold = readTokenRgb('--gold', [0.894, 0.714, 0.353]);
  const clay = readTokenRgb('--clay', [0.784, 0.514, 0.424]);
  const glowAlpha = dark ? 0.5 : 0.34;
  return {
    darkGround: dark,
    background,
    foreground,
    card: readTokenRgb('--card', [0.145, 0.102, 0.125]),
    rose,
    gold,
    clay,
    mutedText: readToken('--muted-foreground') || rgba(foreground, 0.72),
    sans: readToken('--font-sans') || 'ui-sans-serif, system-ui, sans-serif',
    serif: readToken('--font-serif') || 'Georgia, serif',
    glow: {
      ivory: makeGlowSprite(foreground, glowAlpha * 0.7),
      rose: makeGlowSprite(rose, glowAlpha),
      gold: makeGlowSprite(gold, glowAlpha),
      clay: makeGlowSprite(clay, glowAlpha),
    },
  };
}

/** Per-face lightness — multiply toward black (f<1) or mix toward white (f>1). */
function shade(color: Rgb, f: number): Rgb {
  if (f <= 1) return [color[0] * f, color[1] * f, color[2] * f];
  const k = f - 1;
  return [
    color[0] + (1 - color[0]) * k,
    color[1] + (1 - color[1]) * k,
    color[2] + (1 - color[2]) * k,
  ];
}

/** Linear mix a→b — solid opaque face colors on light grounds. */
function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/* -------------------------------------------------------------- engine */

/** Fixed isometric-style camera: yaw turns the plane, pitch looks down onto it. */
const YAW = 0.6;
const SIN_Y = Math.sin(YAW);
const COS_Y = Math.cos(YAW);
const PITCH = 0.62;
const SIN_P = Math.sin(PITCH);
const COS_P = Math.cos(PITCH);
const FOV = 1400;
const SPAWN_RATE = 15;
const MAX_PACKETS = 44;
const CLICK_SLOP_PX = 6;

interface Projected {
  x: number;
  y: number;
  scale: number;
  fog: number;
}

function toneRgb(inks: Inks, tone: Tone | PacketTone): Rgb {
  if (tone === 'rose') return inks.rose;
  if (tone === 'gold') return inks.gold;
  if (tone === 'clay') return inks.clay;
  return inks.foreground;
}

export function Constellation({
  onTelemetry,
}: {
  onTelemetry?: (telemetry: ConstellationTelemetry) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const telemetryRef = useRef(onTelemetry);
  telemetryRef.current = onTelemetry;
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const tooltip = tooltipRef.current;
    if (!container || !canvas || !tooltip) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { nodes, edges } = buildScene(Date.now() >>> 0);
    const hub = nodes[0];
    if (!hub) return;
    let inks = resolveInks();

    /* Adjacency for routes, subtrees, and toggling. */
    const children = new Map<number, number[]>();
    for (const node of nodes) {
      if (node.parent >= 0) {
        const list = children.get(node.parent) ?? [];
        list.push(node.id);
        children.set(node.parent, list);
      }
    }
    const agents = nodes.filter((n) => n.kind === 'agent');
    const sources = nodes.filter((n) => n.kind === 'item' || n.kind === 'leaf');

    const refreshActive = () => {
      for (const node of nodes) {
        let active = node.enabled;
        let cursor = node.parent;
        while (active && cursor >= 0) {
          const parent = nodes[cursor];
          if (!parent) break;
          active = parent.enabled;
          cursor = parent.parent;
        }
        node.active = active;
      }
    };

    const chainToHub = (id: number): number[] => {
      const path = [id];
      let cursor = nodes[id]?.parent ?? -1;
      while (cursor >= 0) {
        path.push(cursor);
        const parent = nodes[cursor];
        cursor = parent ? parent.parent : -1;
      }
      if (path[path.length - 1] !== hub.id) path.push(hub.id);
      return path;
    };

    const subtreeOf = (id: number): Set<number> => {
      const seen = new Set<number>([id]);
      const queue = [id];
      while (queue.length > 0) {
        const current = queue.pop();
        if (current === undefined) break;
        for (const child of children.get(current) ?? []) {
          if (!seen.has(child)) {
            seen.add(child);
            queue.push(child);
          }
        }
      }
      for (const ancestor of chainToHub(id)) seen.add(ancestor);
      return seen;
    };

    /** Nearest labeled ancestor — packet identities name real places. */
    const placeName = (id: number): string => {
      let cursor = id;
      while (cursor >= 0) {
        const node: GraphNode | undefined = nodes[cursor];
        if (!node) break;
        if (node.label) return node.label;
        cursor = node.parent;
      }
      return 'source';
    };

    /* ------------------------------------------------------ traffic */

    const rand = mulberry32((Date.now() ^ 0x9e3779b9) >>> 0);
    const packets: Packet[] = [];
    let spawnBank = 0;
    let tokens = TELEMETRY_SEED.tokens;
    const arrivals: number[] = [];

    const pickActive = <T extends GraphNode>(pool: T[]): T | null => {
      const active = pool.filter((n) => n.active);
      if (active.length === 0) return null;
      return active[Math.floor(rand() * active.length)] ?? null;
    };

    /** Walk down from an agent into a random live session / tool-call chain. */
    const descend = (from: number, firstChance: number): number[] => {
      const tail: number[] = [];
      let cursor = from;
      let chance = firstChance;
      for (;;) {
        const kids = (children.get(cursor) ?? [])
          .map((id) => nodes[id])
          .filter((n): n is GraphNode => Boolean(n && n.active));
        if (kids.length === 0 || rand() > chance) break;
        const next = kids[Math.floor(rand() * kids.length)];
        if (!next) break;
        tail.push(next.id);
        cursor = next.id;
        chance *= 0.72;
      }
      return tail;
    };

    const makePacket = (path: number[], tone: PacketTone, kindLabel: string, baseSpeed: number) => {
      const weight = 0.7 + rand() ** 1.5 * 1.8;
      const first = path[0];
      const last = path[path.length - 1];
      packets.push({
        path,
        seg: 0,
        t: 0,
        weight,
        speed: baseSpeed / (0.7 + weight * 0.45),
        size: 1.2 + weight * 0.9,
        tone,
        fade: 0,
        kindLabel,
        fromLabel: first === undefined ? 'source' : placeName(first),
        toLabel: last === undefined ? 'agent' : placeName(last),
      });
    };

    const spawnPacket = () => {
      const roll = rand();
      if (roll < 0.6) {
        /* serve: source → … → hub → agent → (session → tool …) */
        const source = pickActive(sources);
        const agent = pickActive(agents);
        if (!source || !agent) return;
        const path = [...chainToHub(source.id), agent.id, ...descend(agent.id, 0.65)];
        makePacket(path, rand() < 0.02 ? 'gold' : 'rose', 'context packet', 190);
      } else if (roll < 0.88) {
        /* index: leaf/item → parent (short local hop) */
        const source = pickActive(sources);
        if (!source || source.parent < 0) return;
        makePacket([source.id, source.parent], 'clay', 'index delta', 130);
      } else {
        /* query: a session (or deeper tool call) asks, up through its agent, to the hub */
        const agent = pickActive(agents);
        if (!agent) return;
        const down = descend(agent.id, 0.7);
        const start = down.length > 0 ? down[down.length - 1] : agent.id;
        if (start === undefined) return;
        const up = [...down].reverse();
        makePacket([...up, agent.id, hub.id].slice(up.length > 0 ? 0 : 1), 'rose', 'query', 210);
      }
    };

    const fizzleBrokenRoutes = () => {
      for (const packet of packets) {
        if (packet.fade > 0) continue;
        for (let i = packet.seg; i < packet.path.length; i += 1) {
          const nodeId = packet.path[i];
          const node = nodeId === undefined ? undefined : nodes[nodeId];
          if (node && !node.active) {
            packet.fade = 0.0001;
            break;
          }
        }
      }
    };

    /* ---------------------------------------------------- projection */

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;
    let portrait = false;
    const projected: Projected[] = nodes.map(() => ({ x: 0, y: 0, scale: 1, fog: 1 }));
    const drawOrder = nodes.map((n) => n.id);

    let pointerX: number | null = null;
    let pointerY: number | null = null;
    let hovered = -1;
    let hoveredPacket: Packet | null = null;

    /*
     * Portrait keeps the graph LARGE and lets it overflow horizontally — the canvas
     * edge-fades instead of clipping (overflow is composition, never a scrollbar).
     */
    const worldScale = () => (portrait ? height / 860 : Math.min(width / 1080, height / 560));

    const projectPoint = (wx: number, wy: number, wz: number) => {
      /* portrait: quarter-turn the ground plane — sources above, agents below */
      const px = portrait ? wz : wx;
      const pz = portrait ? -wx : wz;
      const ws = worldScale();
      const x1 = px * COS_Y + pz * SIN_Y;
      const z1 = -px * SIN_Y + pz * COS_Y;
      const yc = wy * COS_P - z1 * SIN_P;
      const zc = wy * SIN_P + z1 * COS_P;
      const scale = FOV / (FOV + zc);
      return {
        x: width * 0.5 + x1 * ws * scale,
        y: height * (portrait ? 0.5 : 0.44) + yc * ws * scale,
        scale: scale * ws,
        raw: scale,
      };
    };

    const project = (time: number) => {
      for (const node of nodes) {
        const floatY = node.y + Math.sin(time * 0.4 + node.phase) * 3;
        const p = projectPoint(node.x, floatY, node.z);
        const target = projected[node.id];
        if (!target) continue;
        target.x = p.x;
        target.y = p.y;
        target.scale = p.scale;
        target.fog = Math.min(1, Math.max(0.35, (p.raw - 0.8) * 1.9 + 0.45));
      }
      drawOrder.sort((a, b) => (projected[a]?.scale ?? 0) - (projected[b]?.scale ?? 0));
    };

    /*
     * Cube geometry: which of the six faces the fixed camera sees is computed from a
     * probe cube (a face is visible when its center projects nearer than the cube
     * center) — recomputed on resize because portrait swaps the plane.
     */
    type FaceAxis = 'top' | 'x-' | 'x+' | 'z-' | 'z+';
    const FACE_CORNERS: Record<FaceAxis, Array<[number, number, number]>> = {
      top: [
        [-1, -1, -1],
        [1, -1, -1],
        [1, -1, 1],
        [-1, -1, 1],
      ],
      'x-': [
        [-1, -1, -1],
        [-1, -1, 1],
        [-1, 1, 1],
        [-1, 1, -1],
      ],
      'x+': [
        [1, -1, -1],
        [1, -1, 1],
        [1, 1, 1],
        [1, 1, -1],
      ],
      'z-': [
        [-1, -1, -1],
        [1, -1, -1],
        [1, 1, -1],
        [-1, 1, -1],
      ],
      'z+': [
        [-1, -1, 1],
        [1, -1, 1],
        [1, 1, 1],
        [-1, 1, 1],
      ],
    };
    const FACE_CENTER: Record<FaceAxis, [number, number, number]> = {
      top: [0, -1, 0],
      'x-': [-1, 0, 0],
      'x+': [1, 0, 0],
      'z-': [0, 0, -1],
      'z+': [0, 0, 1],
    };
    /** visible side faces in draw order (top always visible under a downward pitch) */
    let visibleSides: FaceAxis[] = ['z-', 'x+'];

    const computeVisibleFaces = () => {
      const sides: FaceAxis[] = [];
      const centerScale = projectPoint(0, 0, 0).raw;
      for (const axis of ['x-', 'x+', 'z-', 'z+'] as FaceAxis[]) {
        const c = FACE_CENTER[axis];
        if (projectPoint(c[0] * 10, c[1] * 10, c[2] * 10).raw > centerScale) sides.push(axis);
      }
      visibleSides = sides;
    };

    /** World-space quadratic bezier per edge — packets and strokes share it. */
    const edgeCurve = new Map<string, { mx: number; my: number; mz: number }>();
    for (const edge of edges) {
      const a = nodes[edge.a];
      const b = nodes[edge.b];
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      edgeCurve.set(`${edge.a}:${edge.b}`, {
        mx: (a.x + b.x) / 2 + (-dz / len) * edge.bend,
        my: (a.y + b.y) / 2,
        mz: (a.z + b.z) / 2 + (dx / len) * edge.bend,
      });
    }
    const curveFor = (a: number, b: number) =>
      edgeCurve.get(`${a}:${b}`) ?? edgeCurve.get(`${b}:${a}`) ?? null;

    /* Rope physics: packets in flight pull their edge downward this frame. */
    const edgeSag = new Map<string, number>();
    const sagKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
    const collectSag = () => {
      edgeSag.clear();
      for (const packet of packets) {
        if (packet.fade > 0) continue;
        const a = packet.path[packet.seg];
        const b = packet.path[packet.seg + 1];
        if (a === undefined || b === undefined) continue;
        const key = sagKey(a, b);
        const pull = packet.weight * 5 * Math.sin(Math.PI * packet.t);
        edgeSag.set(key, Math.min(10, (edgeSag.get(key) ?? 0) + pull));
      }
    };

    const packetWorldPos = (packet: Packet): { x: number; y: number; z: number } | null => {
      const fromId = packet.path[packet.seg];
      const toId = packet.path[packet.seg + 1];
      if (fromId === undefined || toId === undefined) return null;
      const from = nodes[fromId];
      const to = nodes[toId];
      if (!from || !to) return null;
      const control = curveFor(fromId, toId);
      const t = packet.t;
      const u = 1 - t;
      /* the packet rides the rope it is sagging */
      const ownSag = packet.weight * 5 * Math.sin(Math.PI * t) * 0.55;
      if (!control) {
        return {
          x: from.x * u + to.x * t,
          y: from.y * u + to.y * t + ownSag,
          z: from.z * u + to.z * t,
        };
      }
      return {
        x: u * u * from.x + 2 * u * t * control.mx + t * t * to.x,
        y: u * u * from.y + 2 * u * t * control.my + t * t * to.y + ownSag,
        z: u * u * from.z + 2 * u * t * control.mz + t * t * to.z,
      };
    };

    /* -------------------------------------------------------- drawing */

    /** A quad with rounded corners (the brand's tile language, kept in 3D). */
    const quad = (pts: Array<{ x: number; y: number }>, radius = 0) => {
      const [p0, p1, p2, p3] = pts;
      if (!p0 || !p1 || !p2 || !p3) return;
      ctx.beginPath();
      if (radius <= 0.5) {
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.closePath();
        return;
      }
      const corners = [p0, p1, p2, p3];
      for (let i = 0; i < 4; i += 1) {
        const prev = corners[(i + 3) % 4];
        const cur = corners[i];
        const next = corners[(i + 1) % 4];
        if (!prev || !cur || !next) continue;
        const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y) || 1;
        const outLen = Math.hypot(next.x - cur.x, next.y - cur.y) || 1;
        const r = Math.min(radius, inLen / 2.4, outLen / 2.4);
        const entry = {
          x: cur.x - ((cur.x - prev.x) / inLen) * r,
          y: cur.y - ((cur.y - prev.y) / inLen) * r,
        };
        const exit = {
          x: cur.x + ((next.x - cur.x) / outLen) * r,
          y: cur.y + ((next.y - cur.y) / outLen) * r,
        };
        if (i === 0) ctx.moveTo(entry.x, entry.y);
        else ctx.lineTo(entry.x, entry.y);
        ctx.quadraticCurveTo(cur.x, cur.y, exit.x, exit.y);
      }
      ctx.closePath();
    };

    /** bilinear point inside a projected quad — used to draw the hub's mosaic. */
    const lerpQuad = (
      corners: Array<{ x: number; y: number }>,
      u: number,
      v: number,
    ): { x: number; y: number } => {
      const [c0, c1, c2, c3] = corners;
      if (!c0 || !c1 || !c2 || !c3) return { x: 0, y: 0 };
      const topX = c0.x + (c1.x - c0.x) * u;
      const topY = c0.y + (c1.y - c0.y) * u;
      const botX = c3.x + (c2.x - c3.x) * u;
      const botY = c3.y + (c2.y - c3.y) * u;
      return { x: topX + (botX - topX) * v, y: topY + (botY - topY) * v };
    };

    const drawCube = (node: GraphNode, p: Projected, emphasis: number, time: number) => {
      const s = node.size * 1.15;
      const floatY = node.y + Math.sin(time * 0.4 + node.phase) * 3;
      /* corner radius = half the self-colored stroke that rounds the silhouette */
      const cornerR = Math.max(1.5, Math.min(4.5, s * 0.16 * p.scale));
      const cornersOf = (axis: FaceAxis) =>
        FACE_CORNERS[axis].map((c) =>
          projectPoint(node.x + c[0] * s, floatY + c[1] * s, node.z + c[2] * s),
        );

      /* ground shadow — anchored to the plane beneath the cube */
      const ground = projectPoint(node.x, node.y + s + 3, node.z);
      const shadowW = s * 2.9 * p.scale;
      ctx.globalAlpha = (inks.darkGround ? 0.6 : 0.14) * p.fog * emphasis;
      ctx.fillStyle = inks.darkGround ? 'rgba(0, 0, 0, 1)' : rgba(inks.foreground, 1);
      ctx.beginPath();
      ctx.ellipse(
        ground.x,
        ground.y,
        Math.max(1, shadowW / 2),
        Math.max(1, shadowW / 5.2),
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      if (!node.active) {
        /* offline: a dashed wire cube, no faces */
        ctx.globalAlpha = p.fog * emphasis * 0.5;
        ctx.strokeStyle = rgba(inks.foreground, 0.5);
        ctx.lineWidth = 1;
        ctx.lineJoin = 'round';
        ctx.setLineDash([3, 4]);
        quad(cornersOf('top'));
        ctx.stroke();
        for (const axis of visibleSides) {
          quad(cornersOf(axis));
          ctx.stroke();
        }
        ctx.setLineDash([]);
        return;
      }

      /*
       * Arrival illumination lives ON the object (no outer halo): the faces warm
       * toward the packet tone and the rim brightens, then it all eases back down.
       */
      const swell = node.flash * node.flash * (3 - 2 * node.flash);
      const isCard = node.kind === 'hub' || node.kind === 'agent';
      const darkBase = isCard ? inks.card : inks.foreground;
      const warm = toneRgb(inks, node.tone === 'ivory' ? 'rose' : node.tone);
      ctx.lineJoin = 'round';

      /*
       * Gap-free rounded corners, by construction: every face is a SHARP quad (faces
       * meet exactly — rounding the paths is what opened seams), and the rounding
       * comes from strokes with round joins. Per face, three passes on the same path:
       *   1. keyline stroke (width 2·r + 2) — a 1px line hugging the ROUNDED
       *      silhouette (noon ink / dark top rim / arrival warm edge),
       *   2. fill-colored stroke (width 2·r) — expands the face outward by r with
       *      rounded corners, overlapping the neighbor so no seam can open,
       *   3. the fill itself.
       */
      const hoveredNode = node.id === hovered;
      if (hoveredNode) {
        /* hover underlay: a rose rim around the whole silhouette, under the faces */
        ctx.strokeStyle = rgba(inks.rose, 1);
        ctx.lineWidth = cornerR * 2 + 3;
        ctx.globalAlpha = 0.9 * p.fog;
        quad(cornersOf('top'));
        ctx.stroke();
        for (const axis of visibleSides) {
          quad(cornersOf(axis));
          ctx.stroke();
        }
      }

      const paintFace = (
        axis: FaceAxis | 'top',
        factor: number,
        lightT: number,
        keyline?: { color: Rgb; alpha: number; extra: number },
      ) => {
        const corners = cornersOf(axis as FaceAxis);
        /* solid, opaque blocks on both grounds */
        let fill: Rgb;
        if (inks.darkGround) {
          fill = shade(darkBase, factor + swell * 0.28);
        } else if (isCard) {
          fill = shade(inks.card, factor + swell * 0.1);
        } else {
          fill = mixRgb(inks.background, inks.foreground, lightT);
        }
        if (swell > 0.01) fill = mixRgb(fill, warm, swell * (inks.darkGround ? 0.28 : 0.2));
        /*
         * TRULY opaque: depth fog and hover-dim mix the color toward the ground
         * instead of lowering alpha — nothing ever shows through a face.
         */
        const visibility = p.fog * emphasis;
        const solid = mixRgb(inks.background, fill, visibility);
        quad(corners);
        if (keyline) {
          ctx.globalAlpha = visibility * keyline.alpha;
          ctx.strokeStyle = rgba(keyline.color, 1);
          ctx.lineWidth = cornerR * 2 + keyline.extra;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = rgba(solid, 1);
        ctx.lineWidth = cornerR * 2;
        ctx.stroke();
        ctx.fillStyle = rgba(solid, 1);
        ctx.fill();
        return corners;
      };

      /* noon keeps its ink keyline on every face; dark rims only the lit top */
      const noonKey = inks.darkGround
        ? undefined
        : { color: shade(inks.foreground, 1), alpha: 0.5, extra: 2 };
      for (const axis of visibleSides) {
        paintFace(
          axis,
          axis.startsWith('x') ? 0.68 : 0.86,
          axis.startsWith('x') ? 0.3 : 0.19,
          noonKey,
        );
      }
      const topKey = inks.darkGround
        ? {
            color: inks.foreground,
            alpha: (isCard ? 0.5 : 0.9) * (0.55 + swell * 0.4),
            extra: 1.6 + swell,
          }
        : swell > 0.01
          ? { color: warm, alpha: swell * 0.8, extra: 2.4 }
          : noonKey;
      const topCorners = paintFace('top', inks.darkGround ? 1.08 : 1.12, 0.1, topKey);

      /* tone accent — a small inlay on the top face */
      if (node.kind === 'cluster' || node.kind === 'agent') {
        const c = lerpQuad(topCorners, 0.5, 0.5);
        ctx.globalAlpha = p.fog * emphasis;
        ctx.fillStyle = rgba(toneRgb(inks, node.tone), 1);
        ctx.beginPath();
        ctx.arc(c.x, c.y, Math.max(1.4, s * 0.34 * p.scale), 0, Math.PI * 2);
        ctx.fill();
      }

      /* the hub carries the mark — a 3×3 mosaic set into its top face */
      if (node.kind === 'hub') {
        const alphas = [0.55, 0.8, 0, 0.8, 1, 0.9, 0.45, 0.9, 0.7];
        for (let i = 0; i < 9; i += 1) {
          const col = i % 3;
          const row = Math.floor(i / 3);
          const u0 = 0.14 + col * 0.26;
          const v0 = 0.14 + row * 0.26;
          const cellCorners = [
            lerpQuad(topCorners, u0, v0),
            lerpQuad(topCorners, u0 + 0.2, v0),
            lerpQuad(topCorners, u0 + 0.2, v0 + 0.2),
            lerpQuad(topCorners, u0, v0 + 0.2),
          ];
          quad(cellCorners, cornerR * 0.4);
          if (i === 2) {
            ctx.globalAlpha = p.fog * emphasis;
            ctx.fillStyle = rgba(inks.gold, 1);
          } else {
            ctx.globalAlpha = p.fog * emphasis * (alphas[i] ?? 0.8) * (inks.darkGround ? 1 : 0.85);
            ctx.fillStyle = inks.darkGround ? rgba(inks.foreground, 1) : rgba(inks.card, 1);
            if (!inks.darkGround) {
              ctx.fillStyle = rgba(shade(inks.foreground, 1), (alphas[i] ?? 0.8) * 0.8);
            }
          }
          ctx.fill();
        }
      }

      /* (hover rim is the underlay drawn before the faces — see hoveredNode above) */
    };

    let themeClass = '';

    const drawScene = (time: number) => {
      /* theme flips re-resolve inks — checked in the paint path (observer-free) */
      if (document.documentElement.className !== themeClass) {
        themeClass = document.documentElement.className;
        inks = resolveInks();
      }
      ctx.clearRect(0, 0, width, height);
      project(time);
      collectSag();

      const highlight = hovered >= 0 ? subtreeOf(hovered) : null;
      const dimmed = (id: number) => (highlight !== null && !highlight.has(id) ? 0.3 : 1);

      /* edges — sagging under the packets that ride them */
      for (const edge of edges) {
        const a = projected[edge.a];
        const b = projected[edge.b];
        const nodeA = nodes[edge.a];
        const nodeB = nodes[edge.b];
        if (!a || !b || !nodeA || !nodeB) continue;
        const control = curveFor(edge.a, edge.b);
        const broken = !nodeA.active || !nodeB.active;
        const fog = Math.min(a.fog, b.fog);
        const emphasis = Math.min(dimmed(edge.a), dimmed(edge.b));
        const base = edge.kind === 'serve' ? 0.5 : edge.kind === 'cross' ? 0.2 : 0.34;
        ctx.globalAlpha = base * fog * emphasis * (broken ? 0.35 : 1);
        ctx.strokeStyle =
          edge.kind === 'serve'
            ? rgba(inks.rose, 0.9)
            : rgba(inks.foreground, inks.darkGround ? 0.5 : 0.42);
        ctx.lineWidth = edge.kind === 'serve' ? 1.1 : 0.8;
        ctx.setLineDash(broken || edge.kind === 'cross' ? [3, 5] : []);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        const sag = edgeSag.get(sagKey(edge.a, edge.b)) ?? 0;
        if (control) {
          const c = projectPoint(control.mx, control.my + sag, control.mz);
          ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
        } else if (sag > 0) {
          const c = projectPoint(
            (nodeA.x + nodeB.x) / 2,
            (nodeA.y + nodeB.y) / 2 + sag,
            (nodeA.z + nodeB.z) / 2,
          );
          ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
        } else {
          ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);

      /* packets under nodes, so dots slide beneath cubes at junctions */
      for (const packet of packets) {
        const world = packetWorldPos(packet);
        if (!world) continue;
        const p = projectPoint(world.x, world.y, world.z);
        const alive = packet.fade > 0 ? Math.max(0, 1 - packet.fade * 5) : 1;
        if (alive <= 0) continue;
        const emphasis = packet === hoveredPacket ? 1 : highlight !== null ? 0.45 : 1;
        const color = toneRgb(inks, packet.tone);
        const glowSize = packet.size * 11 * p.scale;
        ctx.globalAlpha = 0.85 * alive * emphasis;
        ctx.drawImage(
          inks.glow[packet.tone],
          p.x - glowSize / 2,
          p.y - glowSize / 2,
          glowSize,
          glowSize,
        );
        ctx.globalAlpha = 0.95 * alive * emphasis;
        ctx.fillStyle = rgba(color, 1);
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1, packet.size * p.scale), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.9 * alive * emphasis;
        ctx.fillStyle = rgba(inks.foreground, 0.95);
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, packet.size * 0.4 * p.scale), 0, Math.PI * 2);
        ctx.fill();
      }

      /* cubes far → near */
      for (const id of drawOrder) {
        const node = nodes[id];
        const p = projected[id];
        if (!node || !p) continue;
        drawCube(node, p, dimmed(id), time);

        /* labels: hub serif, clusters/agents sans — never below legible scale */
        if (node.label) {
          const labelAlpha = p.fog * dimmed(id) * (node.active ? 1 : 0.55);
          const bottom = projectPoint(node.x, node.y + node.size * 1.15 + 6, node.z);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          if (node.kind === 'hub') {
            ctx.globalAlpha = labelAlpha;
            ctx.fillStyle = rgba(inks.foreground, 0.95);
            ctx.font = `400 ${Math.max(14, 15 * Math.min(1.2, p.scale))}px ${inks.serif}`;
            ctx.fillText(node.label, bottom.x, bottom.y + 6);
          } else {
            ctx.globalAlpha = labelAlpha * 0.95;
            ctx.fillStyle = inks.mutedText;
            ctx.font = `500 ${Math.max(10.5, 11.5 * Math.min(1, p.scale))}px ${inks.sans}`;
            ctx.fillText(node.label, bottom.x, bottom.y + 4);
          }
        }
      }
      ctx.globalAlpha = 1;
    };

    /* ------------------------------------------------------ simulation */

    const step = (dt: number, time: number) => {
      for (const node of nodes) {
        if (node.flash > 0) node.flash = Math.max(0, node.flash - dt * 2.4);
      }

      spawnBank += dt * SPAWN_RATE;
      while (spawnBank >= 1) {
        spawnBank -= 1;
        if (packets.length < MAX_PACKETS) spawnPacket();
      }

      const now = time;
      for (let i = packets.length - 1; i >= 0; i -= 1) {
        const packet = packets[i];
        if (!packet) continue;
        /* a hovered packet holds still so its identity can actually be read */
        if (packet === hoveredPacket && packet.fade === 0) continue;
        if (packet.fade > 0) {
          packet.fade += dt;
          if (packet.fade > 0.25) packets.splice(i, 1);
          continue;
        }
        const fromId = packet.path[packet.seg];
        const toId = packet.path[packet.seg + 1];
        const from = fromId === undefined ? undefined : nodes[fromId];
        const to = toId === undefined ? undefined : nodes[toId];
        if (!from || !to) {
          packets.splice(i, 1);
          continue;
        }
        const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) || 1;
        packet.t += (dt * packet.speed) / length;
        if (packet.t >= 1) {
          packet.t = 0;
          packet.seg += 1;
          to.flash = Math.min(1, to.flash + 0.85);
          if (packet.seg >= packet.path.length - 1) {
            if (to.kind === 'agent' || to.kind === 'session' || to.kind === 'tool') {
              tokens += 380 + Math.floor(rand() * 2400);
              arrivals.push(now);
            }
            packets.splice(i, 1);
          }
        }
      }
      while (arrivals.length > 0 && (arrivals[0] ?? 0) < now - 8) arrivals.shift();
    };

    /* --------------------------------------------------------- wiring */

    const resize = (): boolean => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === width && h === height && canvas.width > 1) return false;
      width = w;
      height = h;
      portrait = height > width * 1.15;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      computeVisibleFaces();
      return true;
    };

    const hitTest = (px: number, py: number): number => {
      for (let i = drawOrder.length - 1; i >= 0; i -= 1) {
        const id = drawOrder[i];
        if (id === undefined) continue;
        const node = nodes[id];
        const p = projected[id];
        if (!node || !p) continue;
        const reach = Math.max(10, node.size * 1.5 * p.scale + 6);
        if (Math.hypot(px - p.x, py - p.y) <= reach) return id;
      }
      return -1;
    };

    const hitTestPacket = (px: number, py: number): Packet | null => {
      let best: Packet | null = null;
      let bestDist = 11;
      for (const packet of packets) {
        if (packet.fade > 0) continue;
        const world = packetWorldPos(packet);
        if (!world) continue;
        const p = projectPoint(world.x, world.y, world.z);
        const d = Math.hypot(px - p.x, py - p.y);
        if (d < bestDist) {
          bestDist = d;
          best = packet;
        }
      }
      return best;
    };

    const setTooltip = (label: string, hint: string, x: number, y: number) => {
      const labelEl = tooltip.querySelector('[data-role="label"]');
      const hintEl = tooltip.querySelector('[data-role="hint"]');
      if (labelEl) labelEl.textContent = label;
      if (hintEl) hintEl.textContent = hint;
      const tw = tooltip.offsetWidth || 140;
      const th = tooltip.offsetHeight || 44;
      let tx = x + 14;
      if (tx + tw > width - 8) tx = x - 14 - tw;
      let ty = y - 10;
      if (ty + th > height - 8) ty = height - 8 - th;
      tx = Math.max(8, Math.min(tx, width - tw - 8));
      ty = Math.max(8, ty);
      tooltip.style.transform = `translate(${Math.round(tx)}px, ${Math.round(ty)}px)`;
      tooltip.style.opacity = '1';
    };

    const syncHover = (): boolean => {
      const next = pointerX === null || pointerY === null ? -1 : hitTest(pointerX, pointerY);
      const nextPacket =
        next >= 0 || pointerX === null || pointerY === null
          ? null
          : hitTestPacket(pointerX, pointerY);
      if (next === hovered && nextPacket === hoveredPacket) {
        return false;
      }
      hovered = next;
      hoveredPacket = nextPacket;
      const node = hovered >= 0 ? nodes[hovered] : undefined;
      if (node) {
        const label =
          node.label ??
          (node.kind === 'leaf'
            ? 'symbol · indexed'
            : node.kind === 'session'
              ? 'session · live'
              : node.kind === 'tool'
                ? 'tool call · running'
                : node.kind === 'item'
                  ? 'fragment · cited'
                  : 'node');
        const hint =
          node.kind === 'hub'
            ? 'the context hub'
            : node.enabled
              ? 'click to take offline'
              : 'offline · click to restore';
        const p = projected[hovered];
        if (p) setTooltip(label, hint, p.x, p.y);
        canvas.style.cursor = node.kind === 'hub' ? 'default' : 'pointer';
      } else if (nextPacket) {
        /* packet identity — weight as payload size, route as provenance */
        const world = packetWorldPos(nextPacket);
        if (world) {
          const p = projectPoint(world.x, world.y, world.z);
          setTooltip(
            `${nextPacket.kindLabel} · ${(nextPacket.weight * 2.1).toFixed(1)}KB`,
            `${nextPacket.fromLabel} → ${nextPacket.toLabel}`,
            p.x,
            p.y,
          );
        }
        canvas.style.cursor = 'default';
      } else {
        tooltip.style.opacity = '0';
        canvas.style.cursor = 'default';
      }
      return true;
    };

    /*
     * One permanent rAF loop for every mode — resilient by construction. Reduced
     * motion freezes simulated time and spawns nothing; the frozen frame paints once
     * and repaints only on resize/theme/hover/toggle (idle cost must stay near zero —
     * headless/software-GL environments run axe scans against this page).
     */
    let raf = 0;
    let inView = true;
    let last = performance.now();
    let staticDirty = true;

    const frame = (nowMs: number) => {
      raf = requestAnimationFrame(frame);
      if (!inView || document.hidden) {
        last = nowMs;
        return;
      }
      const dt = Math.min(0.05, (nowMs - last) / 1000);
      last = nowMs;
      if (resize()) staticDirty = true;
      if (reducedRef.current) {
        if (syncHover()) staticDirty = true;
        if (document.documentElement.className !== themeClass) staticDirty = true;
        if (staticDirty) {
          drawScene(0);
          staticDirty = false;
        }
        return;
      }
      const time = nowMs / 1000;
      step(dt, time);
      drawScene(time);
      syncHover();
    };
    raf = requestAnimationFrame(frame);

    let downX = 0;
    let downY = 0;
    let downAt = 0;

    const localPoint = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const onPointerMove = (event: PointerEvent) => {
      const point = localPoint(event);
      pointerX = point.x;
      pointerY = point.y;
    };
    const onPointerLeave = () => {
      pointerX = null;
      pointerY = null;
    };
    const onPointerDown = (event: PointerEvent) => {
      const point = localPoint(event);
      downX = point.x;
      downY = point.y;
      downAt = performance.now();
    };
    const onPointerUp = (event: PointerEvent) => {
      const point = localPoint(event);
      if (
        Math.hypot(point.x - downX, point.y - downY) > CLICK_SLOP_PX ||
        performance.now() - downAt > 500
      ) {
        return;
      }
      const id = hitTest(point.x, point.y);
      const node = id >= 0 ? nodes[id] : undefined;
      if (!node || node.kind === 'hub') return;
      node.enabled = !node.enabled;
      refreshActive();
      fizzleBrokenRoutes();
      pushTelemetry();
      staticDirty = true;
      /* the hovered node just changed state — rebuild the tooltip from scratch */
      hovered = -1;
      hoveredPacket = null;
      syncHover();
    };

    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);

    const intersection = new IntersectionObserver((entries) => {
      inView = entries.some((entry) => entry.isIntersecting);
    });
    intersection.observe(container);

    const pushTelemetry = () => {
      const callback = telemetryRef.current;
      if (!callback) return;
      const activeAgents = agents.filter((a) => a.active).length;
      if (reducedRef.current) {
        callback({ ...TELEMETRY_SEED, agents: activeAgents });
        return;
      }
      const rpm = Math.round(Math.min(320, Math.max(90, (arrivals.length / 8) * 60)));
      callback({ tokens, rpm, agents: activeAgents });
    };

    pushTelemetry();
    const telemetryTimer = window.setInterval(() => {
      if (!reducedRef.current) pushTelemetry();
    }, 1600);

    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(telemetryTimer);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      intersection.disconnect();
    };
  }, []);

  return (
    /* absolute against the band's reserved region: immune to indefinite flex heights */
    <div ref={containerRef} className="absolute inset-0" aria-hidden="true">
      {/* overflow dissolves at every edge — never a hard cut, never a scrollbar */}
      <canvas ref={canvasRef} className="fade-frame absolute inset-0 size-full touch-pan-y" />
      <div
        ref={tooltipRef}
        className="bg-card/90 pointer-events-none absolute top-0 left-0 rounded-md border px-2.5 py-1.5 opacity-0 transition-opacity duration-150"
      >
        <p className="text-label text-foreground" data-role="label" />
        <p className="text-label text-faint-foreground" data-role="hint" />
      </div>
    </div>
  );
}
