import { useState, type ReactNode } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Menu as MenuIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppRole } from '../types/app';
import { Button } from './ui/button';
import AccountMenu from './AccountMenu';
import BrandLogo from './BrandLogo';

export interface NavTab<T extends string> {
  id: T;
  label: string;
  icon: ReactNode;
}

interface AppShellProps<T extends string> {
  // Which role's pages these are (shown in the account button).
  role: AppRole;
  tabs: NavTab<T>[];
  activeTab: T;
  onTabChange: (tab: NoInfer<T>) => void;
  children: ReactNode;
}


// What's inside the sidebar: logo, the screens, and the account button at the bottom.
// Used in the fixed desktop sidebar and in the slide-in menu on phones.
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
      <div className="flex items-center gap-2.5 px-5 py-5">
        <BrandLogo />
      </div>

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
      <a
        href="#main"
        className="sr-only rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70]"
      >
        Skip to main content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-gray-200 bg-white lg:block">
        <SidebarContent role={role} tabs={tabs} activeTab={activeTab} onSelect={onTabChange} />
      </aside>

      {/* Phone top bar */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-gray-200 bg-white/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <Button variant="ghost" size="icon" aria-label="Open menu" onClick={() => setMobileMenuOpen(true)}>
          <MenuIcon className="size-5" />
        </Button>
        <BrandLogo size="sm" showName={false} />
        <span className="truncate text-base font-bold text-ink">{activeLabel}</span>
      </header>

      {/* Phone slide-in menu (same content as the desktop sidebar) */}
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

      <main id="main" className="lg:pl-64">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
