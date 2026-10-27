import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LandingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate('/app', { replace: true });
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-[#333333] font-sans antialiased selection:bg-[#2E7D32]/15 selection:text-[#2E7D32]">
      {/* Navigation */}
      <nav className="sticky top-0 z-20 border-b border-gray-200 bg-[#FFFFFF]/90 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-base font-semibold tracking-tight text-[#333333]">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2E7D32]/10 text-[#2E7D32]">
              ⚡
            </span>
            <span>SuperMarket Express</span>
          </div>
          <div className="flex items-center gap-6">
            <a
              href="#features"
              className="text-sm font-medium text-[#333333]/70 hover:text-[#333333] transition-colors"
            >
              Features
            </a>
            <Link
              to="/login"
              className="rounded-lg bg-[#2E7D32] px-4 py-2 text-xs font-semibold text-[#FFFFFF] hover:bg-[#246628] transition-colors shadow-sm"
            >
              Sign in
            </Link>
          </div>
        </div>
      </nav>

      <main>
        {/* Hero Section */}
        <section className="mx-auto max-w-3xl px-6 pt-20 pb-16 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#2E7D32]/20 bg-[#2E7D32]/10 px-3.5 py-1 text-xs font-semibold text-[#2E7D32] mb-6">
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
              to="/login"
              className="rounded-lg bg-[#2E7D32] px-6 py-3 text-sm font-semibold text-[#FFFFFF] shadow-md hover:bg-[#246628] transition-all"
            >
              Sign in with Google
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
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#2E7D32]/10 text-[#2E7D32]">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-[#333333]">Point of Sale</h3>
              <p className="mt-2 text-xs leading-relaxed text-[#333333]/70">
                Scan items, manage live carts, and apply loyalty discounts smoothly during checkout.
              </p>
            </div>

            {/* Inventory */}
            <div className="rounded-2xl bg-[#FFFFFF] p-6 border border-gray-200/80 shadow-sm transition-all hover:shadow-md">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#2E7D32]/10 text-[#2E7D32]">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-[#333333]">Inventory Control</h3>
              <p className="mt-2 text-xs leading-relaxed text-[#333333]/70">
                Real-time stock updates with automated low-stock indicators to keep your shelves ready.
              </p>
            </div>

            {/* Loyalty */}
            <div className="rounded-2xl bg-[#FFFFFF] p-6 border border-gray-200/80 shadow-sm transition-all hover:shadow-md">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#2E7D32]/10 text-[#2E7D32]">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
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
            Sign in with your Google account to access your store's dashboard.
          </p>
          <div className="mt-6">
            <Link
              to="/login"
              className="inline-block rounded-lg bg-[#2E7D32] px-6 py-3 text-sm font-semibold text-[#FFFFFF] shadow-md hover:bg-[#246628] transition-colors"
            >
              Sign in with Google
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
            <Link to="/login" className="hover:text-[#333333] transition-colors">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}