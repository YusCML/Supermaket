// LandingPage.tsx: the public home page, the first thing anyone sees.
//
// Shown at "/" and also at "/login" (see App.tsx). At /login the sign-in
// pop-up (LoginDialog) opens on top of it.
//
// Sections, top to bottom: sticky top bar, hero (headline + a picture of the
// app), Features, How it works, the rule numbers on green, a yellow "get
// started" box, and the footer.
//
// It uses:
//   - useAuth() (contexts/AuthContext) to know whether someone is signed in,
//     so the main button says "Sign in", "Shop now" (customers) or
//     "Open POS" (cashiers and admins).
//   - takeSignInRedirect() (lib/roles.ts) to send someone coming back from
//     Google sign-in on into the app.
//   - the rule numbers from lib/loyalty.ts and lib/pricing.ts, so the text
//     matches the real rules.
//   - BrandLogo, LoginDialog and AccountMenu (the signed-in account button
//     in the top bar) from components/.
//   - cn() from '@/lib/utils'. '@/' is a shortcut for the src/ folder (set up
//     in vite.config.ts and tsconfig.json). cn() joins class names, skips
//     empty ones, and when two Tailwind classes clash, the last one wins.
//
// Tailwind screen-size prefixes appear all over this page: `sm:` means "only
// on screens 640px wide or more", `md:` 768px or more, `lg:` 1024px or more.
// A class without a prefix applies to every size, phones included.
// Square brackets, like text-[11px] or leading-[1.08], are one-off custom
// values that aren't on Tailwind's normal scale.
import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Plus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { takeSignInRedirect } from '../lib/roles';
import { PESO_VALUE_PER_POINT } from '../lib/loyalty';
import { NEAR_EXPIRY_PERCENT_OFF } from '../lib/pricing';
import AccountMenu from '../components/AccountMenu';
import BrandLogo from '../components/BrandLogo';
import LoginDialog from '../components/LoginDialog';
import { cn } from '@/lib/utils';

// Shared look for the green "Sign in" / "Shop now" / "Open POS" buttons on this page.
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-full bg-brand font-semibold text-white shadow-sm transition-colors hover:bg-brand-hover';

// Small green label above each section title ("Features", "How it works").
// A component's inputs are called "props". `children` is a special prop: it's
// whatever is written between the tags, so <Eyebrow>Features</Eyebrow> gets
// children = 'Features'. Here it must be plain text (a string).
function Eyebrow({ children }: { children: string }) {
  return <p className="text-sm font-semibold tracking-wide text-brand-strong">{children}</p>;
}

// ── Page content ───────────────────────────────────────────────────────────
// The text is kept here as plain lists and turned into HTML with .map() in
// the page below, so adding a feature or step means adding one object here.

// The three columns of the Features section.
const FEATURES = [
  {
    title: 'Point of Sale',
    text: 'Scan items, manage live carts, and apply loyalty discounts smoothly during checkout.',
  },
  {
    title: 'Inventory Control',
    text: 'Real-time stock updates with automated low-stock indicators to keep your shelves ready.',
  },
  {
    title: 'Customer Rewards',
    text: 'Automatic points system to keep customers returning. Clear, simple point calculations.',
  },
];

// The checkout sequence from the project spec, in plain words.
// The backtick text `...${PESO_VALUE_PER_POINT}...` is a template string: the
// value inside ${ } is filled in, so the step always shows the real ₱ amount.
const CHECKOUT_STEPS = [
  { title: 'Scan or search', text: 'Barcode, SKU or product name. Items go straight into the basket.' },
  { title: 'Find the member', text: 'A phone number or loyalty ID brings up their name and points.' },
  { title: 'Use points', text: `If they want to, each point takes ₱${PESO_VALUE_PER_POINT} off the bill.` },
  { title: 'Complete', text: 'The order, the stock and the points are all saved together in one step.' },
];

// Real numbers from the app's rules. The ₱-per-point value and the % off come
// from the constants in lib/loyalty.ts and lib/pricing.ts, so they update if
// those rules change. "1 point for every ₱100" is typed in by hand (the
// earning rule only exists in the database), so update it here if that rule
// ever changes.
const FACTS = [
  { value: '1 point', label: 'for every ₱100 spent' },
  { value: `₱${PESO_VALUE_PER_POINT}`, label: 'off for every point redeemed' },
  { value: `${NEAR_EXPIRY_PERCENT_OFF}% off`, label: 'stock that is close to expiring' },
];

// Made-up products for the app preview in the hero. `tile` and `shape` are just
// soft colour blocks standing in for product photos.
// The "/number" in a colour class is its opacity: bg-danger/10 is the red at
// 10%, a pale pink. `sale: true` adds a "15% off" tag (that text is typed in
// by hand in AppPreview, not taken from lib/pricing.ts).
const PREVIEW_PRODUCTS = [
  { name: 'Red apples', price: '₱30.00', tile: 'bg-danger/10', shape: 'bg-danger/60' },
  { name: 'Bananas', price: '₱85.00', tile: 'bg-sun/40', shape: 'bg-sun' },
  { name: 'Oranges', price: '₱45.00', tile: 'bg-warning/25', shape: 'bg-warning' },
  { name: 'Broccoli', price: '₱60.00', tile: 'bg-brand/10', shape: 'bg-brand/60' },
  { name: 'Fresh milk 1L', price: '₱95.00', tile: 'bg-subtle', shape: 'bg-white shadow-sm' },
  { name: 'Wheat bread', price: '₱55.25', tile: 'bg-warning/15', shape: 'bg-warning/60', sale: true },
];

// ── The app preview under the headline ─────────────────────────────────────
// A simplified picture of the POS screen, drawn with HTML so it always matches
// the real colours. It's decoration only (aria-hidden), not a working screen.
// aria-hidden="true" hides the whole thing from screen readers, so they don't
// read out the fake products and prices. It takes no props.
function AppPreview() {
  return (
    <div className="relative mx-auto mt-16 max-w-5xl px-2" aria-hidden="true">
      {/* Soft glow behind the window */}
      {/* (-z-10 puts it behind the window, -inset-x-8 -top-8 lets it spill
          past the edges, bg-linear-to-b is a top-to-bottom colour fade, and
          blur-3xl softens it into a glow.) */}
      <div className="absolute -inset-x-8 -top-8 bottom-10 -z-10 bg-linear-to-b from-brand/15 via-sun/15 to-transparent blur-3xl" />

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white text-left shadow-2xl shadow-brand/10">
        {/* Browser bar */}
        <div className="flex items-center gap-1.5 border-b border-gray-100 bg-subtle px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-danger/70" />
          <span className="size-2.5 rounded-full bg-warning" />
          <span className="size-2.5 rounded-full bg-brand/70" />
          <span className="mx-auto rounded-full bg-white px-4 py-0.5 text-[11px] text-ink-muted">
            supermarket-express / cashier
          </span>
        </div>

        {/* The three columns change with the screen width:
              phones:    product menu only (one column)
              sm: and up: product menu + basket
              md: and up: sidebar + product menu + basket
            grid-cols-[9.5rem_1fr_15rem] is a custom column list (the
            underscores stand for spaces): 9.5rem, "all the space left", 15rem. */}
        <div className="grid sm:grid-cols-[1fr_15rem] md:grid-cols-[9.5rem_1fr_15rem]">
          {/* Sidebar (hidden on small screens, shown from md: up) */}
          <div className="hidden border-r border-gray-100 p-4 md:block">
            <BrandLogo size="sm" showName={false} />
            <div className="mt-5 space-y-1 text-xs font-semibold">
              <div className="rounded-full bg-brand px-3 py-2 text-white">POS Checkout</div>
              <div className="px-3 py-2 text-ink-muted">Inventory</div>
              <div className="px-3 py-2 text-ink-muted">Loyalty</div>
              <div className="px-3 py-2 text-ink-muted">Analytics</div>
            </div>
          </div>

          {/* Product menu */}
          <div className="p-5">
            {/* A fake search box (just a div, you can't type in it) */}
            <div className="rounded-full border border-gray-200 px-4 py-2 text-xs text-ink-subtle">
              Scan barcode, SKU, or search products…
            </div>
            {/* Category chips; the first one is drawn as the selected one */}
            <div className="mt-3 flex gap-2 overflow-hidden text-[11px] font-semibold">
              {['Fruits & Vegetables', 'Dairy', 'Bakery', 'Beverages'].map((category, index) => (
                <span
                  key={category}
                  className={cn(
                    'shrink-0 rounded-full px-3 py-1.5',
                    index === 0 ? 'bg-brand text-white' : 'bg-subtle text-ink-muted'
                  )}
                >
                  {category}
                </span>
              ))}
            </div>
            {/* Product cards: 2 per row, 3 per row from lg: up. `key` is the
                unique label React needs on each item of a .map() list, so it
                can tell the items apart when the list changes. */}
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-3">
              {PREVIEW_PRODUCTS.map((product) => (
                <div key={product.name}>
                  <div className={cn('flex aspect-[4/3] items-center justify-center rounded-lg', product.tile)}>
                    <span className={cn('size-10 rounded-full', product.shape)} />
                  </div>
                  <div className="mt-2 text-xs font-semibold text-ink">{product.name}</div>
                  <div className="mt-0.5 flex items-center justify-between">
                    <span className="text-xs font-bold text-ink">
                      {product.price}
                      {product.sale && <span className="ml-1.5 font-semibold text-warning-strong">{NEAR_EXPIRY_PERCENT_OFF}% off</span>}
                    </span>
                    <span className="flex size-6 items-center justify-center rounded-full bg-brand text-white">
                      <Plus className="size-3.5" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Basket (hidden on phones, shown from sm: up) */}
          <div className="hidden flex-col border-l border-gray-100 p-5 sm:flex">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-bold text-ink">Active Basket</span>
              <span className="text-xs font-semibold text-brand-strong">7 items</span>
            </div>
            {/* Basket lines. tabular-nums gives every digit the same width,
                so prices line up neatly in a column. */}
            <div className="mt-4 space-y-3 text-xs">
              {[
                ['Fresh milk 1L × 2', '₱190.00'],
                ['Wheat bread', '₱55.25'],
                ['Red apples × 4', '₱120.00'],
              ].map(([item, price]) => (
                <div key={item} className="flex justify-between gap-2">
                  <span className="text-ink">{item}</span>
                  <span className="font-semibold text-ink tabular-nums">{price}</span>
                </div>
              ))}
            </div>
            {/* The member on this sale and their points */}
            <div className="mt-5 border-t border-gray-100 pt-4 text-xs">
              <div className="text-ink-muted">Member</div>
              <div className="mt-0.5 flex items-baseline justify-between">
                <span className="font-semibold text-ink">Maria Santos</span>
                <span className="font-semibold text-brand-strong">42 pts</span>
              </div>
              <div className="mt-1 text-ink-muted">+3 points with this sale</div>
            </div>
            {/* Total, payment buttons and "Complete Transaction".
                mt-auto pushes this block to the bottom of the basket column. */}
            <div className="mt-auto space-y-3 pt-6">
              <div className="flex items-baseline justify-between border-t border-gray-100 pt-3">
                <span className="text-sm font-bold text-ink">Total</span>
                <span className="text-xl font-extrabold text-brand-strong tabular-nums">₱365.25</span>
              </div>
              <div className="grid grid-cols-3 gap-1 rounded-full bg-subtle p-1 text-center text-[11px] font-semibold">
                <span className="rounded-full bg-brand py-1.5 text-white">Cash</span>
                <span className="py-1.5 text-ink-muted">Card</span>
                <span className="py-1.5 text-ink-muted">Points</span>
              </div>
              <div className="rounded-full bg-brand py-2.5 text-center text-xs font-semibold text-white">
                Complete Transaction
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// The page itself. It takes no props.
export default function LandingPage() {
  // `loading` is true for a moment at start-up while Supabase checks for a
  // saved sign-in. Until that's done we treat the visitor as signed out.
  // (`!!user` turns the user object, or null, into true / false.)
  // roleLoading / availableRoles: which roles they hold (see AuthContext),
  // used for the button words below.
  const { user, loading, roleLoading, availableRoles } = useAuth();
  const isSignedIn = !loading && !!user;
  // Staff = holds the cashier or admin role (or both), on top of being a
  // customer like everyone. availableRoles stays empty while roleLoading.
  const isStaff = availableRoles.some((role) => role !== 'customer');
  // The main "call to action" (CTA) buttons: signed-in people go into the app,
  // everyone else opens the sign-in pop-up. /app (RolePickerPage) sends a
  // customer-only account straight into the shop, and lets staff pick
  // Customer, Cashier or Admin, so the words match where it leads:
  //   signed out            -> "Sign in"
  //   customer only         -> "Shop now"
  //   cashier and/or admin  -> "Open POS"
  //   roles still loading   -> "Continue" (a moment after sign-in, so the
  //                            button doesn't flash "Shop now" for staff)
  const primaryCtaTo = isSignedIn ? '/app' : '/login';
  const primaryCtaLabel = !isSignedIn ? 'Sign in' : roleLoading ? 'Continue' : isStaff ? 'Open POS' : 'Shop now';

  // Signing in is a pop-up over this page, not a separate page. The address
  // /login opens it (the Sign in buttons link there, and so does the redirect
  // when someone opens a protected page while signed out), so the Back button
  // and shared links work as usual.
  // useLocation() (React Router) gives the current address; useNavigate()
  // gives a function that changes the address from code.
  const location = useLocation();
  const navigate = useNavigate();
  const signInOpen = location.pathname === '/login';

  // As soon as someone is signed in while the pop-up is open, take them into the app.
  // useEffect runs its code AFTER React has drawn the page. The list at the
  // end, [signInOpen, isSignedIn, navigate], is the "dependency list": React
  // runs the effect again whenever one of those values changes. So when an
  // email sign-in succeeds, AuthContext sets the user, isSignedIn turns true,
  // and this sends them to /app. It also moves on someone who is already
  // signed in and opens /login.
  // Google sign-in comes back to "/" instead (the pop-up isn't open there).
  // takeSignInRedirect() (lib/roles.ts) tells us they've just come back from
  // Google, so they're sent on too. It's only checked once `loading` is done,
  // and the note is deleted whether or not they're signed in, so a cancelled
  // Google sign-in can't send them into the app later by surprise.
  // /app then takes customers straight into the shop and asks staff which
  // role to use.
  // `replace: true` so Back doesn't return to the sign-in pop-up.
  useEffect(() => {
    if (loading) return;
    const backFromGoogle = takeSignInRedirect();
    if (isSignedIn && (signInOpen || backFromGoogle)) navigate('/app', { replace: true });
  }, [loading, signInOpen, isSignedIn, navigate]);

  return (
    // overflow-x-clip: decorations can never make the page wider than the screen
    // (clip, not hidden, so the sticky top bar keeps working).
    <div className="min-h-screen overflow-x-clip bg-canvas text-ink">
      {/* ── Top bar ── */}
      {/* sticky top-0: stays stuck to the top of the window while you scroll.
          z-20 keeps it above the page. bg-white/80 + backdrop-blur-md: a
          slightly see-through white that blurs whatever scrolls behind it. */}
      <nav className="sticky top-0 z-20 border-b border-gray-200/70 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <BrandLogo />
          <div className="flex items-center gap-7">
            {/* Plain <a href="#..."> links jump down to the section with that
                id on this same page. They're hidden on phones (hidden sm:inline).
                <Link to="..."> (React Router) is used to go to another page
                of the app without reloading the site. */}
            <a href="#features" className="hidden text-sm font-medium text-ink-muted transition-colors hover:text-ink sm:inline">
              Features
            </a>
            <a href="#how-it-works" className="hidden text-sm font-medium text-ink-muted transition-colors hover:text-ink sm:inline">
              How it works
            </a>
            {/* Signed in: the account button (round initial + email) and the
                "Shop now" button, grouped closer together (gap-2). The
                account button opens a menu with the full email and Sign out
                (AccountMenu, placement="topbar"). */}
            <div className="flex items-center gap-2">
              {isSignedIn && <AccountMenu placement="topbar" />}
              <Link to={primaryCtaTo} className={cn(primaryButtonClass, 'px-5 py-2 text-sm')}>
                {primaryCtaLabel}
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main>
        {/* ── Hero ── */}
        <section className="px-6 pt-20 pb-24 text-center sm:pt-28">
          <Eyebrow>Simplified Store Management</Eyebrow>
          <h1 className="mx-auto mt-5 max-w-4xl text-4xl leading-[1.08] font-extrabold tracking-tight text-balance text-ink sm:text-6xl">
            Run your store.{' '}
            {/* On wider screens the second sentence always starts its own line. */}
            <br className="hidden sm:block" />
            {/* Yellow highlighter behind the bottom part of the text. Drawn as a
                background, so it still looks right if the words wrap onto two
                lines on a phone (box-decoration-clone repeats it on each line). */}
            <span className="box-decoration-clone bg-linear-to-b from-transparent from-60% to-sun to-60% px-1">
              Not your spreadsheet.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-ink-muted">
            Point of sale, inventory tracking, and customer loyalty — streamlined into one intuitive platform built for
            independent grocery stores.
          </p>
          {/* The two hero buttons, then a short list of highlights */}
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link to={primaryCtaTo} className={cn(primaryButtonClass, 'px-7 py-3.5 text-base')}>
              {primaryCtaLabel}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <a
              href="#features"
              className="rounded-full px-6 py-3.5 text-base font-semibold text-ink transition-colors hover:bg-subtle"
            >
              See what it does
            </a>
          </div>
          <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-ink-muted">
            {['Barcode scanning', 'Near-expiry discounts', 'Loyalty points'].map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <Check className="size-4 text-brand-strong" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>

          <AppPreview />
        </section>

        {/* ── Features: three numbered columns, no boxes ── */}
        {/* id="features" is where the "Features" links jump to. scroll-mt-20
            stops the jump 5rem early, so the sticky top bar doesn't cover the title. */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-24">
          <div className="max-w-2xl">
            <Eyebrow>Features</Eyebrow>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-balance sm:text-4xl">
              Everything the till needs. Nothing it doesn't.
            </h2>
          </div>
          <div className="mt-14 grid gap-12 md:grid-cols-3 md:gap-10">
            {FEATURES.map((feature, index) => (
              // A thin grey line on top with a short green accent at its start.
              // The `before:` classes style an extra, empty box that CSS draws
              // at the start of the element (a "::before pseudo-element"): here a
              // 3rem-wide green bar sitting on top of the grey border.
              // `0{index + 1}` shows 01, 02, 03 (index starts at 0).
              <div
                key={feature.title}
                className="relative border-t border-gray-200 pt-6 before:absolute before:-top-px before:left-0 before:h-0.5 before:w-12 before:bg-brand"
              >
                <span className="text-sm font-semibold text-ink-subtle tabular-nums">0{index + 1}</span>
                <h3 className="mt-2 text-xl font-bold text-ink">{feature.title}</h3>
                <p className="mt-3 text-base leading-relaxed text-ink-muted">{feature.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── How checkout works ── */}
        <section id="how-it-works" className="scroll-mt-20 border-y border-gray-200/70 bg-white">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <div className="max-w-2xl">
              <Eyebrow>How it works</Eyebrow>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                A sale in four steps.
              </h2>
            </div>
            <ol className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
              {CHECKOUT_STEPS.map((step, index) => (
                <li key={step.title}>
                  <span className="text-5xl font-extrabold text-brand/25 tabular-nums" aria-hidden="true">
                    {index + 1}
                  </span>
                  <h3 className="mt-3 text-lg font-bold text-ink">
                    {/* sr-only: invisible on screen but read by screen readers.
                        The big number above is aria-hidden (decoration), so
                        this is how a screen reader user hears "Step 1:". */}
                    <span className="sr-only">Step {index + 1}: </span>
                    {step.title}
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-ink-muted">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── The rules, as big numbers on green ── */}
        {/* One column on phones, three side by side from sm: up. */}
        <section className="bg-brand text-white">
          <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 text-center sm:grid-cols-3 sm:gap-6">
            {FACTS.map((fact) => (
              <div key={fact.label}>
                <div className="text-4xl font-extrabold tracking-tight sm:text-5xl">{fact.value}</div>
                <div className="mt-2 text-sm text-white/85">{fact.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Call to action ── */}
        <section className="mx-auto max-w-6xl px-6 py-24">
          <div className="rounded-lg bg-sun px-6 py-16 text-center sm:px-12">
            <h2 className="text-3xl font-bold tracking-tight text-balance text-brand-ink sm:text-4xl">
              Get started in seconds
            </h2>
            {/* The sentence changes depending on whether someone is signed in. */}
            <p className="mx-auto mt-3 max-w-md text-base text-brand-ink/80">
              {isSignedIn
                ? isStaff
                  ? "You're signed in — open the POS to pick up where you left off."
                  : "You're signed in — head to the shop to pick up where you left off."
                : 'Sign in with Google or your email to start shopping.'}
            </p>
            <div className="mt-8">
              {/* Dark button so it stands out on the yellow */}
              <Link
                to={primaryCtaTo}
                className="inline-flex items-center gap-2 rounded-full bg-brand-ink px-7 py-3.5 text-base font-semibold text-white shadow-md transition-colors hover:bg-brand-ink/90"
              >
                {primaryCtaLabel}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-200/70 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-ink-muted">
          <BrandLogo size="sm" />
          <div className="flex flex-wrap items-center gap-6">
            <a href="#features" className="transition-colors hover:text-ink">
              Features
            </a>
            <a href="#how-it-works" className="transition-colors hover:text-ink">
              How it works
            </a>
            <span>© 2026 SuperMarket Express</span>
          </div>
        </div>
      </footer>

      {/* ── Sign-in pop-up ── */}
      {/* Open only at /login, and only once we know nobody is signed in.
          Waiting for `loading` to finish stops it flashing open for a moment
          for someone who is in fact already signed in. */}
      <LoginDialog
        open={signInOpen && !loading && !isSignedIn}
        // Closing the pop-up goes back to the plain landing page.
        onOpenChange={(open) => {
          if (!open) navigate('/', { replace: true });
        }}
      />
    </div>
  );
}
