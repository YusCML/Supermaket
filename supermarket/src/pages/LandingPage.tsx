import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Check, Package, ShoppingCart, Star, Tag } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import BrandLogo from '../components/BrandLogo';
import { cn } from '@/lib/utils';

// Shared look for the green "Sign in" / "Go to dashboard" buttons on this page.
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-full bg-brand font-semibold text-white shadow-sm transition-colors hover:bg-brand-hover';

// One feature card: a coloured icon tile, a title and a short description.
function FeatureCard({ icon, tileClass, title, children }: { icon: ReactNode; tileClass: string; title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-xs transition-shadow hover:shadow-md">
      <div className={cn('mb-4 inline-flex size-11 items-center justify-center rounded-md [&>svg]:size-5', tileClass)} aria-hidden="true">
        {icon}
      </div>
      <h3 className="text-base font-bold text-ink">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{children}</p>
    </div>
  );
}

// A small made-up till receipt shown next to the headline. It's only an
// illustration, but it shows what each palette colour means in the app:
// green = total, yellow = deal, amber = warning, red = problem.
function ReceiptPreview() {
  return (
    <div className="relative mx-auto w-full max-w-sm" aria-hidden="true">
      {/* Soft coloured shapes behind the card */}
      <div className="absolute -top-6 -right-4 size-28 rounded-full bg-sun/70 blur-2xl" />
      <div className="absolute -bottom-6 -left-6 size-32 rounded-full bg-brand/40 blur-2xl" />

      <div className="relative rotate-1 rounded-lg border border-gray-200 bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between border-b border-dashed border-gray-200 pb-3">
          <BrandLogo size="sm" />
          <span className="text-xs text-ink-muted">Till 1</span>
        </div>

        <ul className="space-y-3 py-4 text-sm">
          <li className="flex justify-between">
            <span>Fresh milk 1L × 2</span>
            <span className="tabular-nums">₱190.00</span>
          </li>
          <li className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              Wheat bread
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-warning-strong">
                <Tag className="size-3" /> 15% off
              </span>
            </span>
            <span className="tabular-nums">₱55.25</span>
          </li>
          <li className="flex justify-between">
            <span>Red apples × 4</span>
            <span className="tabular-nums">₱120.00</span>
          </li>
        </ul>

        <div className="flex items-baseline justify-between border-t border-dashed border-gray-200 pt-3">
          <span className="font-semibold">Total</span>
          <span className="text-2xl font-extrabold text-brand-strong tabular-nums">₱365.25</span>
        </div>

        <div className="mt-4 space-y-1.5 text-xs font-semibold">
          <p className="flex items-center gap-1.5 text-warning-strong">
            <AlertTriangle className="size-3.5" /> Wheat bread: low stock (4 left)
          </p>
          <p className="flex items-center gap-1.5 text-brand-strong">
            <Star className="size-3.5" /> +3 loyalty points earned
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { user, loading } = useAuth();
  const isSignedIn = !loading && !!user;
  const primaryCtaTo = isSignedIn ? '/app' : '/login';
  const primaryCtaLabel = isSignedIn ? 'Go to dashboard' : 'Sign in';

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <nav className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <BrandLogo />
          <div className="flex items-center gap-6">
            <a href="#features" className="hidden text-sm font-medium text-ink-muted transition-colors hover:text-ink sm:inline">
              Features
            </a>
            <Link to={primaryCtaTo} className={cn(primaryButtonClass, 'px-4 py-2 text-sm')}>
              {primaryCtaLabel}
            </Link>
          </div>
        </div>
      </nav>

      <main>
        {/* ── Hero ── */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pt-16 pb-20 lg:grid-cols-[1.1fr_1fr] lg:pt-24">
          <div className="text-center lg:text-left">
            <p className="mb-5 text-xs font-bold tracking-wider text-brand-strong uppercase">Simplified Store Management</p>
            <h1 className="text-4xl leading-tight font-extrabold tracking-tight text-balance text-ink sm:text-5xl">
              Run your store.{' '}
              {/* Yellow highlighter stroke behind the second line */}
              <span className="relative whitespace-nowrap">
                <span className="absolute inset-x-0 bottom-1 -z-0 h-3 rounded-sm bg-sun sm:h-4" aria-hidden="true" />
                <span className="relative">Not your spreadsheet.</span>
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-ink-muted lg:mx-0">
              Point of sale, inventory tracking, and customer loyalty — streamlined into one intuitive platform built
              for independent grocery stores.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              <Link to={primaryCtaTo} className={cn(primaryButtonClass, 'px-6 py-3 text-sm')}>
                {primaryCtaLabel}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <a
                href="#features"
                className="rounded-full border border-gray-300 bg-white px-5 py-3 text-sm font-medium text-ink shadow-xs transition-colors hover:bg-subtle"
              >
                Learn more
              </a>
            </div>
            <ul className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-ink-muted lg:justify-start">
              {['Barcode scanning', 'Near-expiry discounts', 'Loyalty points'].map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <Check className="size-4 text-brand-strong" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <ReceiptPreview />
        </section>

        {/* ── Features ── */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-12">
          <div className="grid gap-6 md:grid-cols-3">
            <FeatureCard icon={<ShoppingCart />} tileClass="bg-brand text-white" title="Point of Sale">
              Scan items, manage live carts, and apply loyalty discounts smoothly during checkout.
            </FeatureCard>
            <FeatureCard icon={<Package />} tileClass="bg-warning text-brand-ink" title="Inventory Control">
              Real-time stock updates with automated low-stock indicators to keep your shelves ready.
            </FeatureCard>
            <FeatureCard icon={<Star />} tileClass="bg-sun text-brand-ink" title="Customer Rewards">
              Automatic points system to keep customers returning. Clear, simple point calculations.
            </FeatureCard>
          </div>
        </section>

        {/* ── Numbers, on a green band ── */}
        <section className="mx-auto max-w-6xl px-6 py-12">
          <div className="grid grid-cols-1 gap-6 rounded-lg bg-brand p-8 text-center text-white shadow-sm sm:grid-cols-3">
            <div>
              <div className="text-3xl font-extrabold">3</div>
              <div className="mt-1 text-xs font-semibold tracking-wider uppercase">Core Tools</div>
            </div>
            <div>
              <div className="text-3xl font-extrabold">₱100</div>
              <div className="mt-1 text-xs font-semibold tracking-wider uppercase">Per Point Earned</div>
            </div>
            <div>
              <div className="text-3xl font-extrabold">100%</div>
              <div className="mt-1 text-xs font-semibold tracking-wider uppercase">Cloud Sync</div>
            </div>
          </div>
        </section>

        {/* ── Call to action, on yellow ── */}
        <section className="mx-auto max-w-6xl px-6 pt-4 pb-20">
          <div className="rounded-lg bg-sun px-6 py-12 text-center">
            <h2 className="text-2xl font-bold text-brand-ink">Get started in seconds</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-brand-ink/80">
              {isSignedIn
                ? "You're signed in — head to your dashboard to pick up where you left off."
                : 'Sign in with your Google account to access your store’s dashboard.'}
            </p>
            <div className="mt-6">
              {/* Dark button so it stands out on the yellow */}
              <Link
                to={primaryCtaTo}
                className="inline-flex items-center gap-2 rounded-full bg-brand-ink px-6 py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-brand-ink/90"
              >
                {primaryCtaLabel}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-xs text-ink-muted">
          <BrandLogo size="sm" />
          <div className="flex items-center gap-6">
            <span>© 2026 SuperMarket Express</span>
            <a href="#features" className="transition-colors hover:text-ink">
              Features
            </a>
            <Link to={primaryCtaTo} className="transition-colors hover:text-ink">
              {primaryCtaLabel}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
