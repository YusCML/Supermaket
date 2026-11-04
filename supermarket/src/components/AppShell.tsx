// AppShell.tsx: the layout around every signed-in page (SelfServePage,
// CashierPage and AdminPage all wrap their content in it).
//
//   wide screens: a fixed sidebar on the left (logo, the page's screens, a
//                 "Homepage" link back to the landing page, account menu),
//                 and the page content to its right
//   phones:       a slim top bar with a ☰ button that slides the same
//                 sidebar in from the left
//
// The page tells AppShell which screens ("tabs") exist and which one is
// active. AppShell only draws the buttons and reports clicks through
// onTabChange; the page keeps the active tab in its own state.
//
// Uses Base UI's Dialog for the phone slide-in menu (it handles focus,
// Escape and clicking outside), plus AccountMenu, BrandLogo and ui/button.
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Dialog } from '@base-ui/react/dialog';
import { House, Menu as MenuIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppRole } from '../types/app';
import { Button } from './ui/button';
import AccountMenu from './AccountMenu';
import BrandLogo from './BrandLogo';

// One entry in the sidebar.
// <T extends string> makes this a TypeScript "generic": T is a placeholder
// that each page fills in with its own tab ids (e.g. 'pos' | 'stock'), so a
// typo like 'stok' is caught before the app runs.
export interface NavTab<T extends string> {
  // The tab's id, e.g. 'pos'.
  id: T;
  // The text on the button, e.g. 'POS Checkout'.
  label: string;
  // The icon element, e.g. <ShoppingCart />.
  icon: ReactNode;
}

// The props (inputs) a page passes to AppShell.
interface AppShellProps<T extends string> {
  // Which role's pages these are (shown in the account button).
  role: AppRole;
  // The screens to list in the sidebar, in order.
  tabs: NavTab<T>[];
  // The id of the screen that's showing (highlighted in the sidebar).
  activeTab: T;
  // Called with a tab's id when its button is clicked.
  // NoInfer<T> tells TypeScript not to use this prop to work out what T is:
  // T comes from `tabs` and `activeTab`, and this function must accept them.
  onTabChange: (tab: NoInfer<T>) => void;
  // The page's own content, drawn in the main area.
  children: ReactNode;
}


// What's inside the sidebar: logo, the screens, and the account button at the bottom.
// Used in the fixed desktop sidebar and in the slide-in menu on phones.
// Props: role, tabs and activeTab as in AppShellProps; onSelect is what to do
// when a tab is clicked (on phones it also closes the slide-in menu).
function SidebarContent<T extends string>({
  role,
  tabs,
  activeTab,
  onSelect,
}: {
  role: AppRole;
  tabs: NavTab<T>[];
  activeTab: T;
  onSelect: (tab: T) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      {/* The logo also takes you back to the landing page, like on most
          websites. <Link> (React Router) changes page without reloading. */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <Link to="/" aria-label="SuperMarket Express homepage" className="rounded-md">
          <BrandLogo />
        </Link>
      </div>

      {/* The screen buttons. aria-label="Main" names this navigation area
          for screen readers. flex-1 lets it take the space between the logo
          and the account button, and overflow-y-auto scrolls it if there
          are more buttons than fit. */}
      <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              // aria-current tells screen readers which screen is open.
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onSelect(tab.id)}
              // [&>svg]:... targets the <svg> icon directly inside the button,
              // so every page's icons come out 18px without setting a size.
              className={cn(
                'flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-left text-sm font-semibold transition-colors [&>svg]:size-[18px] [&>svg]:shrink-0',
                isActive ? 'bg-brand text-white shadow-xs' : 'text-ink-muted hover:bg-subtle hover:text-ink'
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Back to the landing page ("/"). It's a link, not a tab: it leaves
          these screens. You stay signed in, and the landing page's "Shop now" / "Open POS"
          button brings you back in. */}
      <div className="px-3 pb-2">
        <Link
          to="/"
          className="flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-sm font-semibold text-ink-muted transition-colors hover:bg-subtle hover:text-ink [&>svg]:size-[18px] [&>svg]:shrink-0"
        >
          <House aria-hidden="true" />
          Homepage
        </Link>
      </div>

      {/* Account: email, role, Switch role and Sign out live in this pop-up,
          so they never push the menu wider than the screen. */}
      <div className="border-t border-gray-200 p-3">
        <AccountMenu role={role} />
      </div>
    </div>
  );
}

// The frame around every signed-in page:
//   desktop: a fixed sidebar on the left, page content on the right
//   phones:  a slim top bar with a menu button that slides the sidebar in
export default function AppShell<T extends string>({ role, tabs, activeTab, onTabChange, children }: AppShellProps<T>) {
  // Whether the phone slide-in menu is open. useState remembers it between
  // redraws. The ☰ button opens it; the × button, Escape, a click on the dark
  // backdrop, or picking a screen closes it.
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // The open screen's name, shown in the phone top bar. `?.` stops if no tab
  // matched, and `?? ''` then falls back to an empty string.
  const activeLabel = tabs.find((tab) => tab.id === activeTab)?.label ?? '';

  // On phones, picking a screen also closes the slide-in menu.
  const selectFromMobileMenu = (tab: T) => {
    onTabChange(tab);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* Lets keyboard users jump past the menu straight to the page content.
          Invisible until it receives focus with the Tab key. */}
      {/* sr-only hides it visually but keeps it for screen readers;
          focus:not-sr-only (and the other focus: classes) show it in the
          top-left corner while it has keyboard focus. href="#main" jumps to
          the <main id="main"> below. */}
      <a
        href="#main"
        className="sr-only rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70]"
      >
        Skip to main content
      </a>

      {/* Desktop sidebar */}
      {/* `hidden lg:block`: hidden on narrow screens, shown on screens 1024px
          wide or more (the `lg:` prefix). fixed inset-y-0 left-0 pins it to
          the left edge at full height, so it doesn't scroll with the page. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-gray-200 bg-white lg:block">
        <SidebarContent role={role} tabs={tabs} activeTab={activeTab} onSelect={onTabChange} />
      </aside>

      {/* Phone top bar */}
      {/* lg:hidden: only on screens narrower than 1024px. sticky top-0 keeps
          it at the top while the page scrolls. The ☰ button has only an
          icon, so aria-label gives screen readers its name. */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-gray-200 bg-white/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <Button variant="ghost" size="icon" aria-label="Open menu" onClick={() => setMobileMenuOpen(true)}>
          <MenuIcon className="size-5" />
        </Button>
        {/* The small logo goes back to the landing page too. */}
        <Link to="/" aria-label="SuperMarket Express homepage" className="rounded-md">
          <BrandLogo size="sm" showName={false} />
        </Link>
        <span className="truncate text-base font-bold text-ink">{activeLabel}</span>
      </header>

      {/* Phone slide-in menu (same content as the desktop sidebar) */}
      {/* Base UI's Dialog is built from pieces:
            Root      holds the open/closed state (our mobileMenuOpen)
            Portal    draws the menu at the end of the page's <body>, outside
                      this layout, so nothing around it can clip or cover it
                      (that's what a "portal" is)
            Backdrop  the dark see-through layer behind the menu
            Popup     the white panel itself
            Title     a name for screen readers only (sr-only)
            Close     the × button; `render` makes it use our <Button> look
          Base UI adds data-starting-style / data-ending-style to the
          elements for a moment while opening and closing. The matching
          classes start the panel moved fully off to the left
          (-translate-x-full) and the backdrop invisible, so it slides and
          fades in, and the reverse on the way out. lg:hidden on both means
          that if the window is widened while it's open, it disappears and the
          desktop sidebar takes over. */}
      <Dialog.Root open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 data-starting-style:opacity-0 data-ending-style:opacity-0 lg:hidden" />
          <Dialog.Popup className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-white shadow-xl outline-none transition-transform duration-200 ease-out data-starting-style:-translate-x-full data-ending-style:-translate-x-full lg:hidden">
            <Dialog.Title className="sr-only">Menu</Dialog.Title>
            <Dialog.Close
              render={<Button variant="ghost" size="icon-sm" className="absolute top-4 right-3" />}
              aria-label="Close menu"
            >
              <X />
            </Dialog.Close>
            <SidebarContent role={role} tabs={tabs} activeTab={activeTab} onSelect={selectFromMobileMenu} />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      {/* The page content. lg:pl-64 leaves room on the left for the 16rem
          (w-64) fixed sidebar on wide screens. max-w-7xl stops it getting
          too wide on very large screens. */}
      <main id="main" className="lg:pl-64">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
