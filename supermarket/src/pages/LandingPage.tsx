import { Link } from 'react-router-dom';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Nav */}
      <nav className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-slate-800/60 bg-slate-950/80 backdrop-blur">
        <div className="flex items-center gap-2 text-lg font-bold text-white">
          <span>⚡</span>
          <span>SuperMarket Express</span>
        </div>
        <div className="flex items-center gap-6">
          <a
            href="#features"
            className="text-sm text-slate-300 hover:text-white transition-colors"
          >
            Features
          </a>
          <Link
            to="/login"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Sign in
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <header className="mx-auto max-w-3xl px-6 pt-24 pb-16 text-center">
        <h1 className="text-5xl font-extrabold tracking-tight leading-tight bg-gradient-to-br from-white to-blue-300 bg-clip-text text-transparent">
          Run your store.
          <br />
          Not your spreadsheet.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-slate-400 leading-relaxed">
          Point of sale, inventory management, and a loyalty program — all in
          one place. Built for small grocery stores that want to move fast.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <Link
            to="/login"
            className="rounded-lg bg-blue-600 px-7 py-3.5 text-base font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            Sign in with Google
          </Link>
          <a
            href="#features"
            className="rounded-lg border border-slate-700 px-7 py-3.5 text-base font-medium text-slate-200 hover:bg-slate-900 hover:border-slate-600 transition-colors"
          >
            Learn more
          </a>
        </div>
      </header>

      {/* Features */}
      <section
        id="features"
        className="mx-auto grid max-w-5xl gap-6 px-6 py-16 md:grid-cols-3"
      >
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8 transition-colors hover:border-blue-500/40">
          <div className="mb-4 text-3xl">🛒</div>
          <h3 className="mb-2 text-lg font-semibold text-white">
            Point of Sale
          </h3>
          <p className="text-sm leading-relaxed text-slate-400">
            Scan barcodes, build a cart, apply loyalty discounts, and complete
            transactions in seconds.
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8 transition-colors hover:border-blue-500/40">
          <div className="mb-4 text-3xl">📦</div>
          <h3 className="mb-2 text-lg font-semibold text-white">Inventory</h3>
          <p className="text-sm leading-relaxed text-slate-400">
            Track stock in real time. Get low-stock warnings before you run
            out. Add new products in a few clicks.
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8 transition-colors hover:border-blue-500/40">
          <div className="mb-4 text-3xl">⭐</div>
          <h3 className="mb-2 text-lg font-semibold text-white">Loyalty</h3>
          <p className="text-sm leading-relaxed text-slate-400">
            Reward repeat customers automatically. Every ₱100 spent earns a
            point. Points redeem for instant discounts.
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="mx-auto grid max-w-4xl gap-8 px-6 py-12 border-y border-slate-800 md:grid-cols-3 text-center">
        <div>
          <div className="text-4xl font-extrabold text-white">3</div>
          <div className="mt-1 text-xs uppercase tracking-widest text-slate-500">
            Integrated modules
          </div>
        </div>
        <div>
          <div className="text-4xl font-extrabold text-white">₱1</div>
          <div className="mt-1 text-xs uppercase tracking-widest text-slate-500">
            Per loyalty point
          </div>
        </div>
        <div>
          <div className="text-4xl font-extrabold text-white">100%</div>
          <div className="mt-1 text-xs uppercase tracking-widest text-slate-500">
            Cloud-based
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-xl px-6 py-20 text-center">
        <h2 className="text-3xl font-bold text-white">Ready to try it?</h2>
        <p className="mt-3 text-slate-400">
          Sign in with your Google account to get started.
        </p>
        <Link
          to="/login"
          className="mt-8 inline-block rounded-lg bg-blue-600 px-7 py-3.5 text-base font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          Sign in with Google
        </Link>
      </section>

      {/* Footer */}
      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-800 px-6 py-6 text-xs text-slate-500">
        <div>© 2026 SuperMarket Express</div>
        <div className="flex gap-6">
          <a href="#features" className="hover:text-slate-300">
            Features
          </a>
          <Link to="/login" className="hover:text-slate-300">
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}