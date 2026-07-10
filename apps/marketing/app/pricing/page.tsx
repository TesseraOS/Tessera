import type { Metadata } from 'next';
import type { PlanId } from '@tessera/billing';
import { FaqList } from '@/components/faq-list';
import { CtaBand } from '@/components/home/cta-band';
import { PageHeader } from '@/components/page-header';
import { SiteFooter } from '@/components/site-footer';
import { SiteNav } from '@/components/site-nav';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { Panel } from '@/components/ui/panel';
import { SectionHeading } from '@/components/ui/section-heading';
import { Reveal } from '@/lib/motion';
import { planDisplays } from '@/lib/pricing';
import { siteConfig } from '@/lib/site';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Tessera pricing from the open-core plan catalog — a free local profile that runs forever, a Pro cloud tier, and enterprise plans without ceilings.',
  alternates: { canonical: '/pricing' },
};

/** Which plan the table recommends (§3.8: border-strong + Badge, never a rose fill). */
const RECOMMENDED: PlanId = 'pro';

const PLAN_CTAS: Record<PlanId, { label: string; href: string; primary: boolean }> = {
  free: { label: 'Start free', href: siteConfig.appUrl, primary: false },
  pro: { label: 'Start with Pro', href: siteConfig.appUrl, primary: true },
  enterprise: { label: 'Explore enterprise', href: '/enterprise', primary: false },
};

const FAQ = [
  {
    question: 'What does open core mean?',
    answer:
      'The engine — ingestion, memory, the knowledge graph, the compiler, and the MCP server — is open source and runs entirely on your machine. The managed cloud, with multi-tenant hosting and billing, is the paid layer on the same engine.',
  },
  {
    question: 'What happens when I hit a plan limit?',
    answer:
      'Compile budgets clamp to the plan ceiling — a request over the limit is capped, not failed. Agents keep working; they just receive a tighter package.',
  },
  {
    question: 'Can I move between cloud and self-hosted?',
    answer:
      'The engine is the same across profiles, and backup, restore, and migrations are built in — moving is configuration plus a data export, not a rewrite.',
  },
  {
    question: 'How does billing work?',
    answer:
      'Flat per-plan pricing, billed through Dodo Payments. There is no per-token metering — the token budget is an engineering control, not a meter.',
  },
] as const;

export default function PricingPage() {
  const plans = planDisplays();

  return (
    <>
      <SiteNav />
      <main>
        <PageHeader
          eyebrow="pricing"
          title={
            <>
              Free where your code <em className="text-rose">lives</em>.
            </>
          }
          lead="The local profile is open source and free forever. Paid plans add the managed cloud — same engine, same MCP tools, none of the infrastructure."
        />

        <section id="plans" aria-labelledby="plans-title" className="scroll-mt-16 py-24 md:py-32">
          <Container>
            <Reveal>
              <SectionHeading
                id="plans-title"
                title="Three plans, one engine"
                lead="Start free on your machine; upgrade when your team does."
              />
            </Reveal>
            <div className="mt-12 grid gap-5 md:mt-16 md:grid-cols-3 md:gap-6">
              {plans.map((plan, index) => {
                const recommended = plan.id === RECOMMENDED;
                const cta = PLAN_CTAS[plan.id];
                return (
                  <Reveal key={plan.id} delay={index * 90} className="h-full">
                    <Panel
                      className={cn(
                        'shadow-soft flex h-full flex-col p-7',
                        recommended && 'border-border-strong',
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-label text-foreground uppercase">{plan.name}</h3>
                        {recommended ? (
                          <Badge className="border-border-strong text-foreground">
                            recommended
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="text-title text-foreground tabular-nums">
                          {plan.price}
                        </span>
                        <span className="text-small text-muted-foreground whitespace-nowrap">
                          {plan.cadence}
                        </span>
                      </p>
                      <ul className="mt-7 flex-1">
                        {plan.entitlements.map((line) => (
                          <li
                            key={line}
                            className="text-body text-muted-foreground border-t py-3 tabular-nums"
                          >
                            {line}
                          </li>
                        ))}
                      </ul>
                      <ButtonLink
                        href={cta.href}
                        variant={cta.primary ? 'primary' : 'secondary'}
                        className="mt-8 w-full"
                      >
                        {cta.label}
                      </ButtonLink>
                    </Panel>
                  </Reveal>
                );
              })}
            </div>
            <Reveal delay={120}>
              <p className="text-small text-faint-foreground mt-8">
                Every number above renders from the open-core plan catalog — the same values the API
                enforces.
              </p>
            </Reveal>
          </Container>
        </section>

        <section
          id="faq"
          data-band="chapter"
          aria-labelledby="faq-title"
          className="bg-background text-foreground scroll-mt-16 border-t"
        >
          <Container className="py-24 md:py-32">
            <Reveal>
              <SectionHeading id="faq-title" title="Questions, answered" />
            </Reveal>
            <Reveal delay={90}>
              <FaqList items={FAQ} />
            </Reveal>
          </Container>
        </section>

        <CtaBand />
      </main>
      <SiteFooter />
    </>
  );
}
