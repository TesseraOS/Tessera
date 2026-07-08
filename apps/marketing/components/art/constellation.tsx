'use client';

import { useEffect, useRef } from 'react';
import {
  TELEMETRY_SEED,
  type ConstellationTelemetry,
} from '@/components/art/constellation-contract';
import { luminance, readToken, readTokenRgb, rgba, type Rgb } from '@/components/art/css-color';
import { useReducedMotion } from '@/lib/motion';

/**
 * Constellation (MARKETING-DESIGN §3.3, ADR-0045 v4.1) — the product's knowledge graph
 * as a living constellation on Canvas-2D, viewed by a fixed three-quarter camera: the
 * graph lies on an x/z ground plane with per-node height jitter, projected with a
 * constant pitch so depth reads as true perspective (no pointer tilt — the camera never
 * moves). Branching is randomized per visit within composed bounds: cluster fan-out,
 * nesting depth (up to symbols-of-files), and per-agent session sub-nodes all differ
 * between loads. Heavy randomized parallel traffic moves through the graph as glowing
 * packet dots on multi-hop routes; arrivals ease a node's glow up and back down —
 * never a flashing ring.
 *
 * Decorative-interactive (memory: decorative-interactive-canvas-pattern): aria-hidden +
 * keyboard-inert with a sibling text alternative; page scroll always wins (touch-pan-y,
 * no wheel handling); hover highlights a subtree, click toggles a node offline and the
 * traffic reroutes or fizzles; reduced motion renders the frozen layout with zero
 * packets. Colors resolve from CSS tokens at runtime and re-resolve on theme change
 * inside the paint path. The effect initializes once — reduced-motion arrives via a
 * live ref, never as an effect dependency.
 */

/* ------------------------------------------------------------------ model */

type Tone = 'ivory' | 'rose' | 'gold' | 'clay';
type NodeKind = 'hub' | 'cluster' | 'item' | 'leaf' | 'session' | 'agent';

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
  /** arrival glow 0..1, eased down smoothly in step() */
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
  speed: number;
  size: number;
  tone: PacketTone;
  fade: number;
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
  { label: 'docs · architecture', tone: 'clay', angle: 96, leafChance: 0.5 },
  { label: 'git history', tone: 'gold', angle: 132, leafChance: 0.25 },
  { label: 'repo · api', tone: 'clay', angle: 166, leafChance: 0.8 },
  { label: 'repo · web', tone: 'clay', angle: 198, leafChance: 0.8 },
  { label: 'decisions · ADRs', tone: 'rose', angle: 230, leafChance: 0.35 },
  { label: 'memory · lessons', tone: 'rose', angle: 264, leafChance: 0.45 },
];

const AGENT_SPECS = [
  { label: 'claude code', angle: -36 },
  { label: 'cursor', angle: -13 },
  { label: 'cline', angle: 13 },
  { label: 'codex', angle: 36 },
];

const RAD = Math.PI / 180;

function buildScene(seed: number): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const rand = mulberry32(seed);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const push = (node: Omit<GraphNode, 'id' | 'enabled' | 'active' | 'flash' | 'phase'>) => {
    const id = nodes.length;
    nodes.push({ ...node, id, enabled: true, active: true, flash: 0, phase: rand() * Math.PI * 2 });
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
    size: 30,
  });

  for (const spec of CLUSTER_SPECS) {
    const cr = 235 + rand() * 60;
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
      size: 12.5,
    });
    edges.push({ a: hub, b: cluster, kind: 'tree', bend: (rand() - 0.5) * 44 });

    /* randomized fan-out per visit: 3–6 items, leaves 0–2, occasional 4th level */
    const itemCount = 3 + Math.floor(rand() * 4);
    for (let i = 0; i < itemCount; i += 1) {
      const spread = ((i - (itemCount - 1) / 2) / Math.max(1, itemCount - 1)) * 110 * RAD;
      const ia = ca + spread + (rand() - 0.5) * 0.3;
      const ir = 70 + rand() * 50;
      const item = push({
        label: null,
        kind: 'item',
        parent: cluster,
        tone: spec.tone,
        x: cx + Math.cos(ia) * ir,
        y: cy + (rand() - 0.5) * 60,
        z: cz + Math.sin(ia) * ir,
        size: 7,
      });
      edges.push({ a: cluster, b: item, kind: 'tree', bend: (rand() - 0.5) * 26 });

      const leafCount = rand() < spec.leafChance ? 1 + Math.round(rand()) : 0;
      for (let l = 0; l < leafCount; l += 1) {
        const la = ia + (rand() - 0.5) * 1.6;
        const lr = 32 + rand() * 22;
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
          size: 4.4,
        });
        edges.push({ a: item, b: leaf, kind: 'tree', bend: (rand() - 0.5) * 14 });

        /* the occasional 4th level — a symbol hanging off a file */
        if (rand() < 0.25) {
          const parentLeaf = nodes[leaf];
          if (!parentLeaf) continue;
          const sa = la + (rand() - 0.5) * 1.8;
          const sub = push({
            label: null,
            kind: 'leaf',
            parent: leaf,
            tone: spec.tone,
            x: parentLeaf.x + Math.cos(sa) * (20 + rand() * 14),
            y: parentLeaf.y + (rand() - 0.5) * 30,
            z: parentLeaf.z + Math.sin(sa) * (20 + rand() * 14),
            size: 3.2,
          });
          edges.push({ a: leaf, b: sub, kind: 'tree', bend: (rand() - 0.5) * 10 });
        }
      }
    }
  }

  for (const spec of AGENT_SPECS) {
    const ar = 280 + rand() * 45;
    const aa = spec.angle * RAD;
    const ax = Math.cos(aa) * ar;
    const az = Math.sin(aa) * ar;
    const agent = push({
      label: spec.label,
      kind: 'agent',
      parent: -1,
      tone: 'rose',
      x: ax,
      y: (rand() - 0.5) * 50,
      z: az,
      size: 11,
    });
    edges.push({ a: hub, b: agent, kind: 'serve', bend: (rand() - 0.5) * 36 });

    /* live sessions per agent — 1–3, randomized: the same agent, many conversations */
    const sessionCount = 1 + Math.floor(rand() * 3);
    for (let s = 0; s < sessionCount; s += 1) {
      const sa = aa + (rand() - 0.5) * 0.9;
      const sr = 46 + rand() * 34;
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
        size: 4.2,
      });
      edges.push({ a: agent, b: session, kind: 'serve', bend: (rand() - 0.5) * 14 });
    }
  }

  /* Cross-links — the knowledge-graph tell: an ADR knows a symbol, a lesson knows a file. */
  const items = nodes.filter((n) => n.kind === 'item');
  for (let i = 0; i < 8; i += 1) {
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

/* -------------------------------------------------------------- engine */

/** Fixed three-quarter camera: constant pitch, long lens — depth without vertigo. */
const PITCH = 0.62;
const SIN_P = Math.sin(PITCH);
const COS_P = Math.cos(PITCH);
const FOV = 1400;
const SPAWN_RATE = 13;
const MAX_PACKETS = 40;
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

    const spawnPacket = () => {
      const roll = rand();
      if (roll < 0.6) {
        /* serve: source → … → hub → agent (→ often one of its live sessions) */
        const source = pickActive(sources);
        const agent = pickActive(agents);
        if (!source || !agent) return;
        const path = [...chainToHub(source.id), agent.id];
        const sessions = (children.get(agent.id) ?? [])
          .map((id) => nodes[id])
          .filter((n): n is GraphNode => Boolean(n && n.kind === 'session' && n.active));
        if (sessions.length > 0 && rand() < 0.65) {
          const session = sessions[Math.floor(rand() * sessions.length)];
          if (session) path.push(session.id);
        }
        packets.push({
          path,
          seg: 0,
          t: 0,
          speed: 130 + rand() * 80,
          size: 1.7 + rand() * 0.9,
          tone: rand() < 0.02 ? 'gold' : 'rose',
          fade: 0,
        });
      } else if (roll < 0.88) {
        /* index: leaf/item → parent (short local hop) */
        const source = pickActive(sources);
        if (!source || source.parent < 0) return;
        packets.push({
          path: [source.id, source.parent],
          seg: 0,
          t: 0,
          speed: 90 + rand() * 60,
          size: 1.4 + rand() * 0.6,
          tone: 'clay',
          fade: 0,
        });
      } else {
        /* query: a session asks, through its agent, up to the hub */
        const agent = pickActive(agents);
        if (!agent) return;
        const sessions = (children.get(agent.id) ?? [])
          .map((id) => nodes[id])
          .filter((n): n is GraphNode => Boolean(n && n.kind === 'session' && n.active));
        const start = sessions.length > 0 && rand() < 0.5 ? sessions[0] : agent;
        if (!start) return;
        const path = start.kind === 'session' ? [start.id, agent.id, hub.id] : [agent.id, hub.id];
        packets.push({
          path,
          seg: 0,
          t: 0,
          speed: 150 + rand() * 70,
          size: 1.5 + rand() * 0.6,
          tone: 'rose',
          fade: 0,
        });
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
    const projected: Projected[] = nodes.map(() => ({ x: 0, y: 0, scale: 1, fog: 1 }));
    const drawOrder = nodes.map((n) => n.id);

    let pointerX: number | null = null;
    let pointerY: number | null = null;
    let hovered = -1;

    const worldScale = () => Math.min(width / 980, height / 600);

    const projectPoint = (x: number, y: number, z: number) => {
      const ws = worldScale();
      const yc = y * COS_P - z * SIN_P;
      const zc = y * SIN_P + z * COS_P;
      const scale = FOV / (FOV + zc);
      return {
        x: width * 0.5 + x * ws * scale,
        y: height * 0.45 + yc * ws * scale,
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
      if (!control) {
        return { x: from.x * u + to.x * t, y: from.y * u + to.y * t, z: from.z * u + to.z * t };
      }
      return {
        x: u * u * from.x + 2 * u * t * control.mx + t * t * to.x,
        y: u * u * from.y + 2 * u * t * control.my + t * t * to.y,
        z: u * u * from.z + 2 * u * t * control.mz + t * t * to.z,
      };
    };

    /* -------------------------------------------------------- drawing */

    const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
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

      const highlight = hovered >= 0 ? subtreeOf(hovered) : null;
      const dimmed = (id: number) => (highlight !== null && !highlight.has(id) ? 0.3 : 1);

      /* edges */
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
        if (control) {
          const c = projectPoint(control.mx, control.my, control.mz);
          ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
        } else {
          ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);

      /* packets under nodes, so dots slide beneath tiles at junctions */
      for (const packet of packets) {
        const world = packetWorldPos(packet);
        if (!world) continue;
        const p = projectPoint(world.x, world.y, world.z);
        const alive = packet.fade > 0 ? Math.max(0, 1 - packet.fade * 5) : 1;
        if (alive <= 0) continue;
        const color = toneRgb(inks, packet.tone);
        const glowSize = packet.size * 11 * p.scale;
        ctx.globalAlpha = 0.85 * alive;
        ctx.drawImage(
          inks.glow[packet.tone],
          p.x - glowSize / 2,
          p.y - glowSize / 2,
          glowSize,
          glowSize,
        );
        ctx.globalAlpha = 0.95 * alive;
        ctx.fillStyle = rgba(color, 1);
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1, packet.size * p.scale), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.9 * alive;
        ctx.fillStyle = rgba(inks.foreground, 0.95);
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, packet.size * 0.4 * p.scale), 0, Math.PI * 2);
        ctx.fill();
      }

      /* nodes far → near */
      for (const id of drawOrder) {
        const node = nodes[id];
        const p = projected[id];
        if (!node || !p) continue;
        const emphasis = dimmed(id);
        const side = node.size * 2.1 * p.scale;
        const x = p.x - side / 2;
        const y = p.y - side / 2;
        const radius = Math.max(2, side * 0.28);

        if (node.active) {
          /* arrival = the glow swells and settles — smooth, never a ring */
          const swell = node.flash * node.flash * (3 - 2 * node.flash); /* smoothstep */
          const glowSize = side * (3 + swell * 1.1);
          ctx.globalAlpha = (0.4 + swell * 0.5) * p.fog * emphasis;
          ctx.drawImage(
            inks.glow[node.tone],
            p.x - glowSize / 2,
            p.y - glowSize / 2,
            glowSize,
            glowSize,
          );
        }

        roundRect(x, y, side, side, radius);
        if (node.active) {
          ctx.globalAlpha = p.fog * emphasis;
          ctx.fillStyle =
            node.kind === 'hub'
              ? rgba(inks.card, 0.98)
              : node.kind === 'agent'
                ? rgba(inks.card, 0.94)
                : rgba(inks.foreground, inks.darkGround ? 0.88 : 0.08);
          ctx.fill();
          if (!inks.darkGround) {
            /* noon: every tile takes an inked hairline so white cards hold on paper */
            ctx.globalAlpha = p.fog * emphasis * 0.9;
            ctx.strokeStyle = rgba(inks.foreground, node.kind === 'hub' ? 0.4 : 0.5);
            ctx.lineWidth = 1;
            ctx.stroke();
          }
          /* top-light bevel */
          ctx.globalAlpha = p.fog * emphasis * 0.5;
          ctx.strokeStyle = rgba(inks.foreground, node.kind === 'hub' ? 0.4 : 0.25);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + radius, y + 0.5);
          ctx.lineTo(x + side - radius, y + 0.5);
          ctx.stroke();
        } else {
          ctx.globalAlpha = p.fog * emphasis * 0.5;
          ctx.strokeStyle = rgba(inks.foreground, 0.5);
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        /* tone accents */
        if (node.active && (node.kind === 'cluster' || node.kind === 'agent')) {
          ctx.globalAlpha = p.fog * emphasis;
          ctx.fillStyle = rgba(toneRgb(inks, node.tone), 1);
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(1.4, side * 0.1), 0, Math.PI * 2);
          ctx.fill();
        }

        if (node.kind === 'hub' && node.active) {
          /* the mark echoed: a 3×3 mini-mosaic with the gilded arrival */
          const cell = side * 0.2;
          const gap = side * 0.06;
          const originX = p.x - (cell * 3 + gap * 2) / 2;
          const originY = p.y - (cell * 3 + gap * 2) / 2;
          const alphas = [0.55, 0.8, 0, 0.8, 1, 0.9, 0.45, 0.9, 0.7];
          for (let i = 0; i < 9; i += 1) {
            const col = i % 3;
            const row = Math.floor(i / 3);
            const gx = originX + col * (cell + gap);
            const gy = originY + row * (cell + gap);
            roundRect(gx, gy, cell, cell, cell * 0.3);
            if (i === 2) {
              ctx.globalAlpha = p.fog * emphasis;
              ctx.fillStyle = rgba(inks.gold, 1);
              ctx.fill();
            } else {
              ctx.globalAlpha = p.fog * emphasis * (alphas[i] ?? 0.8);
              ctx.fillStyle = rgba(inks.foreground, 1);
              ctx.fill();
            }
          }
        }

        /* hover ring */
        if (id === hovered) {
          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = rgba(inks.rose, 1);
          ctx.lineWidth = 1.4;
          roundRect(x - 4, y - 4, side + 8, side + 8, radius + 3);
          ctx.stroke();
        }

        /* labels: hub serif, clusters/agents sans — never below legible scale */
        if (node.label) {
          const labelAlpha = p.fog * emphasis * (node.active ? 1 : 0.55);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          if (node.kind === 'hub') {
            ctx.globalAlpha = labelAlpha;
            ctx.fillStyle = rgba(inks.foreground, 0.95);
            ctx.font = `400 ${Math.max(14, 15 * p.scale)}px ${inks.serif}`;
            ctx.fillText(node.label, p.x, y + side + 8);
          } else {
            ctx.globalAlpha = labelAlpha * 0.95;
            ctx.fillStyle = inks.mutedText;
            ctx.font = `500 ${Math.max(10.5, 11.5 * Math.min(1, p.scale))}px ${inks.sans}`;
            ctx.fillText(node.label, p.x, y + side + 7);
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
          to.flash = 1;
          if (packet.seg >= packet.path.length - 1) {
            if (to.kind === 'agent' || to.kind === 'session') {
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

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === width && h === height && canvas.width > 1) return;
      width = w;
      height = h;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const hitTest = (px: number, py: number): number => {
      for (let i = drawOrder.length - 1; i >= 0; i -= 1) {
        const id = drawOrder[i];
        if (id === undefined) continue;
        const node = nodes[id];
        const p = projected[id];
        if (!node || !p) continue;
        const reach = Math.max(10, node.size * 1.3 * p.scale + 6);
        if (Math.hypot(px - p.x, py - p.y) <= reach) return id;
      }
      return -1;
    };

    const syncHover = () => {
      const next = pointerX === null || pointerY === null ? -1 : hitTest(pointerX, pointerY);
      if (next === hovered) return;
      hovered = next;
      const node = hovered >= 0 ? nodes[hovered] : undefined;
      if (node) {
        const label =
          node.label ??
          (node.kind === 'leaf'
            ? 'symbol · indexed'
            : node.kind === 'session'
              ? 'session · live'
              : node.kind === 'item'
                ? 'fragment · cited'
                : 'node');
        const hint =
          node.kind === 'hub'
            ? 'the context hub'
            : node.enabled
              ? 'click to take offline'
              : 'offline · click to restore';
        const labelEl = tooltip.querySelector('[data-role="label"]');
        const hintEl = tooltip.querySelector('[data-role="hint"]');
        if (labelEl) labelEl.textContent = label;
        if (hintEl) hintEl.textContent = hint;
        const p = projected[hovered];
        if (p) {
          /* clamp inside the canvas region — flip to the left/top side near edges */
          const tw = tooltip.offsetWidth || 140;
          const th = tooltip.offsetHeight || 44;
          let tx = p.x + 14;
          if (tx + tw > width - 8) tx = p.x - 14 - tw;
          let ty = p.y - 10;
          if (ty + th > height - 8) ty = height - 8 - th;
          tx = Math.max(8, Math.min(tx, width - tw - 8));
          ty = Math.max(8, ty);
          tooltip.style.transform = `translate(${Math.round(tx)}px, ${Math.round(ty)}px)`;
        }
        tooltip.style.opacity = '1';
        canvas.style.cursor = node.kind === 'hub' ? 'default' : 'pointer';
      } else {
        tooltip.style.opacity = '0';
        canvas.style.cursor = 'default';
      }
    };

    /*
     * One permanent rAF loop for every mode — resilient by construction. Reduced
     * motion freezes simulated time and spawns nothing; the scene redraws identically.
     */
    let raf = 0;
    let inView = true;
    let last = performance.now();

    const frame = (nowMs: number) => {
      raf = requestAnimationFrame(frame);
      if (!inView || document.hidden) {
        last = nowMs;
        return;
      }
      const dt = Math.min(0.05, (nowMs - last) / 1000);
      last = nowMs;
      resize();
      if (reducedRef.current) {
        drawScene(0);
      } else {
        const time = nowMs / 1000;
        step(dt, time);
        drawScene(time);
      }
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
      /* the hovered node just changed state — rebuild the tooltip from scratch */
      hovered = -1;
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
      <canvas ref={canvasRef} className="absolute inset-0 size-full touch-pan-y" />
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
