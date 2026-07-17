'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { KeyRound, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { Constellation } from '@/components/art';
import { Logo } from '@tessera/brand';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TesseraApiError } from '@/lib/api/client';
import { useSession } from '@/lib/auth/use-session';

/** Only same-origin, absolute-path returns are honored (no open redirect). */
function safeReturn(value: string | null): string {
  return value !== null && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

/** Theme-tinted brand ground (mirrors the overview hero band; DESIGN-SYSTEM §11). */
const BRAND_TINT = {
  backgroundImage:
    'linear-gradient(150deg, var(--card), color-mix(in oklab, var(--primary) 9%, var(--card)))',
};

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { signIn } = useSession();
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const returnTo = safeReturn(params.get('return'));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const value = token.trim();
    if (value.length === 0) {
      setError('Enter your API token to continue.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await signIn(value);
      router.replace(returnTo);
    } catch (cause) {
      setError(
        cause instanceof TesseraApiError
          ? cause.message
          : 'Could not sign in. Is the Tessera API reachable?',
      );
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-svh lg:grid-cols-[1.05fr_minmax(30rem,0.95fr)]">
      {/* Brand panel — onboarding art (DESIGN-SYSTEM §11 budget). Decorative; hidden on small screens. */}
      <aside className="relative hidden overflow-hidden border-r lg:block" style={BRAND_TINT}>
        <Constellation className="absolute top-10 left-1/2 w-[120%] max-w-none -translate-x-1/2 opacity-50" />
        <div className="from-card via-card/75 absolute inset-0 bg-gradient-to-t to-transparent" />
        <div className="relative flex h-full flex-col justify-between p-12 xl:p-16">
          <Logo emberId="ember-signin-brand" iconClassName="size-7" textClassName="text-xl" />

          <div className="max-w-md space-y-5">
            <span className="text-muted-foreground bg-background/40 inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] tracking-wide backdrop-blur">
              <Sparkles className="size-3" aria-hidden="true" />
              Context &amp; Memory OS
            </span>
            <p className="text-3xl leading-tight font-semibold tracking-tight text-balance xl:text-4xl">
              Your agents forget.
              <br />
              Tessera remembers.
            </p>
            <p className="text-muted-foreground max-w-sm leading-relaxed text-pretty">
              Sign in to the context engine that ingests your code and history, links it into a
              knowledge graph, and compiles token-lean, provenance-tagged context on demand.
            </p>
          </div>

          <ul className="text-muted-foreground flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[11px]">
            {['Local-first', 'Zero-auth by default', 'Yours to self-host'].map((label) => (
              <li key={label} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full"
                  style={{ background: 'var(--mascot-heart)' }}
                />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Form panel */}
      <div className="flex flex-col items-center justify-center gap-10 overflow-y-auto px-6 py-16 sm:px-10">
        {/* A distinct emberId: this page renders two marks, and SVG gradient ids are
            document-global — sharing one would silently retarget the other's gradient. */}
        <Logo emberId="ember-signin-mobile" className="lg:hidden" textClassName="text-xl" />

        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
            <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
              Enter your API token to access this workspace. Tokens are issued by an administrator
              with <code className="text-foreground font-mono text-xs">tessera-token</code>.
            </p>
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
            <div className="flex flex-col gap-2">
              <label htmlFor="token" className="text-sm font-medium">
                API token
              </label>
              <Input
                id="token"
                type="password"
                autoComplete="off"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="tessera_…"
                aria-invalid={error !== null}
                aria-describedby={error !== null ? 'token-error' : undefined}
                disabled={submitting}
                className="h-11"
              />
              {error !== null && (
                <p id="token-error" role="alert" className="text-destructive text-sm">
                  {error}
                </p>
              )}
            </div>
            <Button type="submit" disabled={submitting} className="h-11 w-full">
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Signing in…
                </>
              ) : (
                <>
                  <KeyRound className="size-4" aria-hidden="true" />
                  Sign in
                </>
              )}
            </Button>
          </form>

          <div className="border-border/70 border-t pt-6">
            <p className="text-muted-foreground flex items-start gap-2.5 text-xs leading-relaxed">
              <ShieldCheck className="mt-px size-4 shrink-0" aria-hidden="true" />
              <span>
                Running locally with zero-auth? No token is needed — you&rsquo;re signed in
                automatically as the local profile.
              </span>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}
