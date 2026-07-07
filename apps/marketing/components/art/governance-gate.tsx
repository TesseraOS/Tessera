'use client';

import { m, thermalEase } from '@/lib/motion';

/**
 * GovernanceGate (MARKETING-DESIGN §3.6): context requests approach the policy gate —
 * two pass and take the gilded edge, one is turned away, everything is written down.
 * Plays once in view; brand art, not UI chrome.
 */
export function GovernanceGate() {
  return (
    <m.div
      role="img"
      aria-label="Three requests approach a policy gate: two pass and continue gilded, one is denied and set aside — all of it audited"
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.4 }}
      className="w-full"
    >
      <svg viewBox="0 0 520 240" className="h-auto w-full" aria-hidden="true" focusable="false">
        {/* the path */}
        <path d="M20 130 H 500" stroke="var(--border)" strokeWidth="1.5" fill="none" />

        {/* the gate */}
        <g>
          <rect
            x="248"
            y="78"
            width="10"
            height="74"
            rx="4"
            fill="var(--foreground)"
            fillOpacity="0.55"
          />
          <rect
            x="284"
            y="78"
            width="10"
            height="74"
            rx="4"
            fill="var(--foreground)"
            fillOpacity="0.55"
          />
          <rect
            x="240"
            y="66"
            width="62"
            height="10"
            rx="4"
            fill="var(--foreground)"
            fillOpacity="0.75"
          />
          <text
            x="271"
            y="52"
            fill="var(--faint-foreground)"
            fontSize="11"
            textAnchor="middle"
            className="font-mono"
          >
            policy · rbac + quotas
          </text>
        </g>

        {/* passing tiles — gilded on the far side */}
        <m.rect
          className="tf-box"
          variants={{
            hidden: { x: 0, opacity: 0.85, strokeOpacity: 0 },
            show: {
              x: [0, 180, 400],
              strokeOpacity: [0, 0, 1],
              opacity: 0.95,
              transition: { duration: 2.1, times: [0, 0.5, 1], ease: 'easeInOut' },
            },
          }}
          x={36}
          y={106}
          width={30}
          height={30}
          rx={7}
          fill="var(--foreground)"
          fillOpacity={0.8}
          stroke="var(--gold)"
          strokeWidth={2}
        />
        <m.rect
          className="tf-box"
          variants={{
            hidden: { x: 0, opacity: 0.85, strokeOpacity: 0 },
            show: {
              x: [0, 150, 330],
              strokeOpacity: [0, 0, 1],
              opacity: 0.95,
              transition: { duration: 2.1, delay: 0.55, times: [0, 0.5, 1], ease: 'easeInOut' },
            },
          }}
          x={36}
          y={106}
          width={30}
          height={30}
          rx={7}
          fill="var(--foreground)"
          fillOpacity={0.65}
          stroke="var(--gold)"
          strokeWidth={2}
        />

        {/* the denied tile — stopped, set aside */}
        <m.rect
          className="tf-box"
          variants={{
            hidden: { x: 0, y: 0, opacity: 0.85 },
            show: {
              x: [0, 168, 168],
              y: [0, 0, 52],
              opacity: [0.85, 0.85, 0.4],
              transition: { duration: 2.4, delay: 1.1, times: [0, 0.55, 1], ease: 'easeInOut' },
            },
          }}
          x={36}
          y={106}
          width={30}
          height={30}
          rx={7}
          fill="var(--rose)"
        />
        <m.path
          variants={{
            hidden: { pathLength: 0, opacity: 0 },
            show: {
              pathLength: 1,
              opacity: 1,
              transition: { duration: 0.45, delay: 3.3, ease: thermalEase },
            },
          }}
          d="M244 196 l 14 14 M258 196 l -14 14"
          stroke="var(--rose)"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />

        {/* the record */}
        <m.text
          variants={{
            hidden: { opacity: 0 },
            show: { opacity: 1, transition: { duration: 0.6, delay: 3.5 } },
          }}
          x={500}
          y={218}
          fill="var(--faint-foreground)"
          fontSize="11"
          textAnchor="end"
          className="font-mono"
        >
          2 allowed · 1 denied · all of it logged
        </m.text>
      </svg>
    </m.div>
  );
}
