import { Link } from 'react-router-dom';
import { ShoppingCart, Package, Star } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function LandingPage() {
  const { user, loading } = useAuth();
  const isSignedIn = !loading && !!user;
  const primaryCtaTo = isSignedIn ? '/app' : '/login';
  const primaryCtaLabel = isSignedIn ? 'Go to dashboard' : 'Sign in';

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-[#333333] font-sans antialiased">
      <nav className="sticky top-0 z-20 border-b border-gray-200 bg-[#FFFFFF]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2.5 text-base font-bold tracking-tight text-[#333333]">
            <img src="/sp%20logo.jpg" alt="SuperMarket Express Logo" className="h-8 w-auto object-contain" />
            <span>SuperMarket Express</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#features" className="text-sm font-medium text-[#333333]/70 hover:text-[#333333] transition-colors">
              Features
            </a>
            <Link
              to={primaryCtaTo}
              className="rounded-lg bg-[#2E7D32] px-4 py-2 text-xs font-semibold text-[#FFFFFF] hover:bg-[#246628] transition-colors shadow-sm"
            >
              {primaryCtaLabel}
            </Link>
          </div>
        </div>
      </nav>

      <main>
        {/* Hero Section */}
        <section className="mx-auto max-w-3xl px-6 pt-20 pb-16 text-center">
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#2E7D32] mb-6">
            Simplified Store Management
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight text-[#333333]">
            Run your store. <br />
            <span className="text-[#333333]/60 font-semibold">Not your spreadsheet.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-lg text-base text-[#333333]/80 leading-relaxed">
            Point of sale, inventory tracking, and customer loyalty — streamlined into one intuitive platform built for independent grocery stores.
          </p>
          <div className="mt-8 flex flex-wrap justify-center items-center gap-3">
            <Link
              to={primaryCtaTo}
              className="rounded-lg bg-[#2E7D32] px-6 py-3 text-sm font-semibold text-[#FFFFFF] shadow-md hover:bg-[#246628] transition-all"
            >
              {primaryCtaLabel}
            </Link>
            <a
              href="#features"
              className="rounded-lg border border-gray-300 bg-[#FFFFFF] px-5 py-3 text-sm font-medium text-[#333333] hover:bg-gray-50 transition-colors shadow-sm"
            >
              Learn more →
            </a>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="mx-auto max-w-5xl px-6 py-12">
          <div className="grid gap-6 md:grid-cols-3">
            {/* POS */}
            <div className="rounded-2xl bg-[#FFFFFF] p-6 border border-gray-200/80 shadow-sm transition-all hover:shadow-md">
              <div className="mb-4 text-[#2E7D32]">
                <ShoppingCart className="size-6" strokeWidth={2} />
              </div>
              <h3 className="text-base font-bold text-[#333333]">Point of Sale</h3>
              <p className="mt-2 text-xs leading-relaxed text-[#333333]/70">
                Scan items, manage live carts, and apply loyalty discounts smoothly during checkout.
              </p>
            </div>

            {/* Inventory */}
            <div className="rounded-2xl bg-[#FFFFFF] p-6 border border-gray-200/80 shadow-sm transition-all hover:shadow-md">
              <div className="mb-4 text-[#2E7D32]">
                <Package className="size-6" strokeWidth={2} />
              </div>
              <h3 className="text-base font-bold text-[#333333]">Inventory Control</h3>
              <p className="mt-2 text-xs leading-relaxed text-[#333333]/70">
                Real-time stock updates with automated low-stock indicators to keep your shelves ready.
              </p>
            </div>

            {/* Loyalty */}
            <div className="rounded-2xl bg-[#FFFFFF] p-6 border border-gray-200/80 shadow-sm transition-all hover:shadow-md">
              <div className="mb-4 text-[#2E7D32]">
                <Star className="size-6" strokeWidth={2} />
              </div>
              <h3 className="text-base font-bold text-[#333333]">Customer Rewards</h3>
              <p className="mt-2 text-xs leading-relaxed text-[#333333]/70">
                Automatic points system to keep customers returning. Clear, simple point calculations.
              </p>
            </div>
          </div>
        </section>

        {/* Minimal Stats */}
        <section className="mx-auto max-w-4xl px-6 py-12 my-6">
          <div className="rounded-2xl bg-[#FFFFFF] border border-gray-200/80 p-8 shadow-sm grid grid-cols-3 gap-6 text-center">
            <div>
              <div className="text-3xl font-extrabold text-[#2E7D32]">3</div>
              <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-[#333333]/60">Core Tools</div>
            </div>
            <div>
              <div className="text-3xl font-extrabold text-[#2E7D32]">₱100</div>
              <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-[#333333]/60">Per Point Earned</div>
            </div>
            <div>
              <div className="text-3xl font-extrabold text-[#2E7D32]">100%</div>
              <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-[#333333]/60">Cloud Sync</div>
            </div>
          </div>
        </section>

        {/* Call to Action */}
        <section className="mx-auto max-w-xl px-6 py-16 text-center">
          <h2 className="text-2xl font-bold text-[#333333]">Get started in seconds</h2>
          <p className="mt-2 text-sm text-[#333333]/70">
            {isSignedIn
              ? "You're signed in — head to your dashboard to pick up where you left off."
              : 'Sign in with your Google account to access your store\u2019s dashboard.'}
          </p>
          <div className="mt-6">
            <Link
              to={primaryCtaTo}
              className="inline-block rounded-lg bg-[#2E7D32] px-6 py-3 text-sm font-semibold text-[#FFFFFF] shadow-md hover:bg-[#246628] transition-colors"
            >
              {primaryCtaLabel}
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-[#FFFFFF]">
        <div className="mx-auto max-w-5xl px-6 py-8 flex flex-wrap items-center justify-between gap-4 text-xs text-[#333333]/60">
          <div>© 2026 SuperMarket Express</div>
          <div className="flex gap-6">
            <a href="#features" className="hover:text-[#333333] transition-colors">
              Features
            </a>
            <Link to={primaryCtaTo} className="hover:text-[#333333] transition-colors">
              {primaryCtaLabel}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}