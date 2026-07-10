import type { Metadata } from 'next';
import { TenantPerimeter } from '@/components/art/tenant-perimeter';
import { FaqList } from '@/components/faq-list';
import { CtaBand } from '@/components/home/cta-band';
import { PageHeader } from '@/components/page-header';
import { SiteFooter } from '@/components/site-footer';
import { SiteNav } from '@/components/site-nav';
import { Container } from '@/components/ui/container';
import { SectionHeading } from '@/components/ui/section-heading';
import { TextLink } from '@/components/ui/text-link';
import { Reveal } from '@/lib/motion';

export const metadata: Metadata = {
  title: 'Enterprise',
  description:
    'Tessera for teams with a security bar — tenant isolation, role-based access, OIDC single sign-on, quotas, and a full audit trail, enforced at the API boundary.',
  alternates: { canonical: '/enterprise' },
};

/**
 * Every claim below traces to a shipped subsystem (ADR-0045 v4.4 traceability rule):
 * isolation F-037 · RBAC F-025 · SSO F-036 · quotas F-026/F-035 · audit F-027 ·
 * redaction F-006 · logging F-016. Roadmap items are labeled as in development.
 */
const CONTROLS = [
  {
    title: 'Tenant isolation',
    body: 'Every row in the data plane is scoped to a tenant. Workspaces cannot read each other — by construction, not by convention.',
  },
  {
    title: 'Role-based access',
    body: 'Organization roles gate who can read, write, and administer context; agents authenticate with scoped tokens issued per workspace.',
  },
  {
    title: 'Single sign-on',
    body: 'Bring your identity provider over OIDC. Hosted login is a configuration change, not an integration project.',
  },
  {
    title: 'Quotas and budgets',
    body: 'Per-tenant quotas are enforced at the MCP gateway, and compile budgets clamp to plan ceilings — spend has a shape before the invoice.',
  },
  {
    title: 'A full audit trail',
    body: 'Who read or wrote which context, and when — recorded at the API boundary and browsable in the governance UI.',
  },
  {
    title: 'Secrets stay out',
    body: 'Ingestion scrubs secrets before anything persists, and logs never carry credentials or raw ingested content.',
  },
] as const;

const RESIDENCY = [
  {
    name: 'local',
    body: 'One process on a developer machine. Embeddings compute in-process; nothing leaves the box unless you explicitly configure a remote source.',
  },
  {
    name: 'self-hosted',
    body: 'Docker Compose with Postgres + pgvector inside your perimeter. Backup, restore, and migrations are first-class, not an afterthought.',
  },
  {
    name: 'cloud',
    body: 'Managed and multi-tenant with the same isolation, RBAC, and audit trail — for teams that want the engine without the infrastructure.',
  },
] as const;

const FAQ = [
  {
    question: 'Where does our code live?',
    answer:
      'In your deployment, for the local and self-hosted profiles. The engine reaches the network only when you explicitly configure a remote source — offline is the default, not a mode.',
  },
  {
    question: 'Is our code used to train models?',
    answer:
      'No. Tessera trains nothing. Embeddings are computed by local models inside your deployment, or by a provider you explicitly configure.',
  },
  {
    question: 'How do agents authenticate?',
    answer:
      'Through the MCP gateway with scoped tokens; humans sign in over OIDC. The same identity and quota checks apply to both.',
  },
  {
    question: 'What about SOC 2 or ISO 27001?',
    answer:
      'We do not claim certifications we do not hold. The enforcement code is open to your review today, and the compliance program — retention policies, data-subject tooling — is in active development.',
  },
] as const;

export default function EnterprisePage() {
  return (
    <>
      <SiteNav />
      <main>
        <PageHeader
          eyebrow="enterprise"
          title={
            <>
              Context your security team can <em className="text-rose">audit</em>.
            </>
          }
          lead="Tenant isolation, role-based access, OIDC single sign-on, quotas, and a full audit trail — enforced at the API boundary, not promised in a deck."
          art={<TenantPerimeter />}
        />

        <section
          id="controls"
          data-band="chapter"
          aria-labelledby="controls-title"
          className="bg-background text-foreground scroll-mt-16 border-b"
        >
          <Container className="py-24 md:py-32">
            <Reveal>
              <SectionHeading
                id="controls-title"
                title="The controls, as shipped"
                lead="Six mechanisms your review can point at — each one lives in the engine, not in a policy document."
              />
            </Reveal>
            <ul className="mt-12 grid gap-5 md:mt-16 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
              {CONTROLS.map((control, index) => (
                <li key={control.title} className="h-full">
                  <Reveal
                    delay={(index % 3) * 90}
                    className="bg-card shadow-soft h-full rounded-lg border p-6"
                  >
                    <h3 className="text-heading text-foreground">{control.title}</h3>
                    <p className="text-body text-muted-foreground mt-3">{control.body}</p>
                  </Reveal>
                </li>
              ))}
            </ul>
          </Container>
        </section>

        <section
          id="residency"
          aria-labelledby="residency-title"
          className="bg-surface/60 scroll-mt-16"
        >
          <Container className="py-24 md:py-32">
            <Reveal>
              <SectionHeading
                id="residency-title"
                title="Your data, your perimeter"
                lead="Run Tessera where your compliance posture needs it — the profile is configuration, the engine is the same."
              />
            </Reveal>
            <div className="mt-12 grid gap-10 md:mt-16 md:grid-cols-3 md:gap-8">
              {RESIDENCY.map((mode, index) => (
                <Reveal key={mode.name} delay={index * 90} className="border-t pt-5">
                  <h3 className="text-label text-foreground">{mode.name}</h3>
                  <p className="text-body text-muted-foreground mt-3">{mode.body}</p>
                </Reveal>
              ))}
            </div>
          </Container>
        </section>

        {/* seam policy (v4.5): ground changes separate these bands — no hairline needed */}
        <section id="posture" aria-labelledby="posture-title" className="scroll-mt-16">
          <Container className="grid gap-10 py-24 md:grid-cols-12 md:gap-12 md:py-32">
            <Reveal className="md:col-span-5">
              <SectionHeading id="posture-title" title="Verification over promises" />
            </Reveal>
            <Reveal delay={90} className="md:col-span-7">
              <p className="text-lead text-muted-foreground">
                Tessera is open core: your security team can read the isolation, access, and audit
                code — not just a whitepaper about it. We publish what is shipped, and only that.
              </p>
              <p className="text-body text-muted-foreground mt-5">
                The same discipline runs through this site: pricing renders from the plan catalog
                the API enforces, and the machine-readable index at{' '}
                <TextLink href="/llms.txt">/llms.txt</TextLink> tells your agents the same story we
                tell you.
              </p>
            </Reveal>
          </Container>
        </section>

        <section id="faq" aria-labelledby="faq-title" className="bg-surface/60 scroll-mt-16">
          <Container className="grid gap-10 py-24 md:grid-cols-12 md:gap-12 md:py-32">
            <Reveal className="md:col-span-4">
              <div className="md:sticky md:top-24">
                <SectionHeading
                  id="faq-title"
                  title="The questions reviews ask"
                  lead="Straight answers your security team can verify against the code."
                />
              </div>
            </Reveal>
            <Reveal delay={90} className="md:col-span-8">
              <FaqList items={FAQ} name="enterprise-faq" />
            </Reveal>
          </Container>
        </section>

        <CtaBand />
      </main>
      <SiteFooter />
    </>
  );
}
