import { useEffect, useRef, useState } from 'react';
import { ImageIcon, Plus, ScanBarcode, Tag } from 'lucide-react';
import type { ProductInventorySummary } from '../types/app';
import { markedDownPrice, NEAR_EXPIRY_PERCENT_OFF } from '../lib/pricing';
import { groupByCategory } from '../lib/categories';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { StatusText } from './ui/status-text';

const peso = (amount: number) => `₱${amount.toFixed(2)}`;

// Smooth scrolling, unless the person asked their device for less motion.
const scrollBehavior = (): ScrollBehavior =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

// ── One product on the menu ────────────────────────────────────────────────
// Food-delivery-app style: picture, name and description with no box around
// them, then the price and a round "+" button to add one straight away.
function ProductTile({
  product: p,
  inBasket,
  onOpen,
  onQuickAdd,
}: {
  product: ProductInventorySummary;
  inBasket: number;
  onOpen: () => void;
  onQuickAdd: () => void;
}) {
  const soldOut = p.stock_quantity <= 0;
  const onSale = p.near_expiry_count > 0;
  const allInBasket = !soldOut && inBasket >= p.stock_quantity;

  return (
    <div className="flex flex-col">
      {/* Picture + name + description open the product details window. */}
      <button type="button" onClick={onOpen} className="group text-left">
        <span
          className={cn(
            'flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-subtle',
            soldOut && 'opacity-50 grayscale'
          )}
        >
          {p.image_url ? (
            <img
              src={p.image_url}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <ImageIcon className="size-8 text-ink-subtle" aria-hidden="true" />
          )}
        </span>
        <span className="mt-2.5 line-clamp-2 text-sm leading-snug font-semibold text-ink group-hover:text-brand-strong">
          {p.name}
        </span>
        {p.description && (
          <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-muted">{p.description}</span>
        )}
      </button>

      {/* Price, stock note and the quick "+" button */}
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-baseline gap-1.5 tabular-nums">
            {onSale ? (
              <>
                <strong className="text-sm font-bold text-brand-strong">{peso(markedDownPrice(p.price || 0))}</strong>
                <span className="text-xs text-ink-muted line-through">{peso(p.price || 0)}</span>
              </>
            ) : (
              <strong className="text-sm font-bold text-ink">{peso(p.price || 0)}</strong>
            )}
          </div>
          {soldOut ? (
            <StatusText tone="danger">Out of stock</StatusText>
          ) : onSale ? (
            <StatusText tone="warning" icon={<Tag />}>
              {NEAR_EXPIRY_PERCENT_OFF}% off · {p.near_expiry_count} expiring soon
            </StatusText>
          ) : (
            <span className="text-xs text-ink-muted">{p.stock_quantity} in stock</span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {inBasket > 0 && (
            <span className="text-xs font-semibold text-brand-strong tabular-nums">{inBasket} in basket</span>
          )}
          <Button
            size="icon-sm"
            onClick={onQuickAdd}
            disabled={soldOut || allInBasket}
            aria-label={`Add one ${p.name} to the basket`}
          >
            <Plus />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── The whole menu ─────────────────────────────────────────────────────────

interface ProductMenuProps {
  // Products to show (already narrowed down by the search box).
  products: ProductInventorySummary[];
  totalCount: number;
  search: string;
  onSearchChange: (value: string) => void;
  // Enter in the search box (a barcode scanner presses Enter too).
  onScan: () => void;
  inBasketCount: (productId: number) => number;
  onOpenDetails: (productId: number) => void;
  onQuickAdd: (product: ProductInventorySummary) => void;
}

// The left side of the POS: search, a bar of category buttons, and the
// products listed category by category. Scrolling the list highlights the
// category you're in; clicking a category scrolls to it.
export default function ProductMenu({
  products,
  totalCount,
  search,
  onSearchChange,
  onScan,
  inBasketCount,
  onOpenDetails,
  onQuickAdd,
}: ProductMenuProps) {
  const groups = groupByCategory(products);

  const listRef = useRef<HTMLDivElement>(null); // the scrolling product list
  const barRef = useRef<HTMLDivElement>(null); // the row of category buttons
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  // While a click-to-jump scroll is moving, ignore the scroll tracking so the
  // highlight doesn't flick through every category on the way.
  const jumping = useRef(false);

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  // Fall back to the first category (e.g. after a search hides the active one).
  const current = groups.some((g) => g.name === activeCategory) ? activeCategory : (groups[0]?.name ?? null);

  // Works out which category is at the top of the list right now.
  const trackScroll = () => {
    const list = listRef.current;
    if (!list || jumping.current || groups.length === 0) return;

    let found = groups[0].name;
    for (const group of groups) {
      const section = sectionRefs.current.get(group.name);
      if (section && section.offsetTop - list.scrollTop <= 24) found = group.name;
    }
    // At the very bottom, the last category counts as active even if it's short.
    if (list.scrollTop + list.clientHeight >= list.scrollHeight - 2) found = groups[groups.length - 1].name;
    setActiveCategory(found);
  };

  const jumpToCategory = (name: string) => {
    const list = listRef.current;
    const section = sectionRefs.current.get(name);
    if (!list || !section) return;
    setActiveCategory(name);
    jumping.current = true;
    list.scrollTo({ top: section.offsetTop - 8, behavior: scrollBehavior() });
    window.setTimeout(() => {
      jumping.current = false;
    }, 600);
  };

  // Keep the highlighted category button visible in its (sideways-scrolling) bar.
  useEffect(() => {
    const bar = barRef.current;
    const button = current ? buttonRefs.current.get(current) : null;
    if (!bar || !button) return;
    bar.scrollTo({ left: button.offsetLeft - bar.clientWidth / 2 + button.clientWidth / 2, behavior: scrollBehavior() });
  }, [current]);

  // A new search starts again from the top of the list.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
    setActiveCategory(null);
  }, [search]);

  return (
    <section
      aria-labelledby="pos-products-title"
      className="flex min-h-0 flex-col rounded-lg border border-gray-200 bg-white shadow-xs lg:col-span-7 lg:h-[calc(100vh-3rem)] xl:col-span-8"
    >
      {/* ── Top: title, search, categories (stays put while the list scrolls) ── */}
      <div className="space-y-3 border-b border-gray-100 px-5 pt-5 pb-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="pos-products-title" className="text-xl font-bold tracking-tight text-ink">
            Items Lookup
          </h2>
          <span className="text-xs font-medium text-ink-muted">
            {products.length} of {totalCount} products
          </span>
        </div>

        {/* A barcode scanner "types" the code and presses Enter, so this box
            starts focused and Enter adds the matching product straight away. */}
        <div className="relative">
          <ScanBarcode
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-ink-subtle"
            aria-hidden="true"
          />
          <Input
            type="text"
            aria-label="Scan barcode, SKU, or search products"
            placeholder="Scan barcode, SKU, or search products…"
            className="h-11 pl-10"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onScan();
            }}
            autoComplete="off"
            spellCheck={false}
            autoFocus
          />
        </div>

        {groups.length > 0 && (
          <nav aria-label="Product categories">
            <div ref={barRef} className="relative -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {groups.map((group) => {
                const isActive = group.name === current;
                return (
                  <button
                    key={group.name}
                    ref={(el) => {
                      if (el) buttonRefs.current.set(group.name, el);
                      else buttonRefs.current.delete(group.name);
                    }}
                    type="button"
                    aria-current={isActive ? 'true' : undefined}
                    onClick={() => jumpToCategory(group.name)}
                    className={cn(
                      'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors',
                      isActive ? 'bg-brand text-white' : 'bg-subtle text-ink-muted hover:text-ink'
                    )}
                  >
                    {group.name}
                    <span className="ml-1.5 text-xs opacity-70 tabular-nums">{group.items.length}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        )}
      </div>

      {/* ── The scrolling list, one section per category ── */}
      <div
        ref={listRef}
        onScroll={trackScroll}
        className="relative max-h-[70vh] min-h-0 flex-1 overflow-y-auto px-5 py-5 lg:max-h-none"
      >
        {groups.length === 0 ? (
          <p className="py-16 text-center text-sm text-ink-muted">
            {search.trim() ? `No products match “${search}”.` : 'No products yet.'}
          </p>
        ) : (
          groups.map((group) => {
            const headingId = `pos-category-${group.name.replace(/\W+/g, '-').toLowerCase()}`;
            return (
              <section
                key={group.name}
                ref={(el) => {
                  if (el) sectionRefs.current.set(group.name, el);
                  else sectionRefs.current.delete(group.name);
                }}
                aria-labelledby={headingId}
                className="pb-10 last:pb-2"
              >
                <h3 id={headingId} className="mb-4 flex items-baseline gap-2 text-lg font-bold text-ink">
                  {group.name}
                  <span className="text-sm font-medium text-ink-muted">{group.items.length}</span>
                </h3>
                <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 xl:grid-cols-4">
                  {group.items.map((product) => (
                    <ProductTile
                      key={product.id}
                      product={product}
                      inBasket={inBasketCount(product.id)}
                      onOpen={() => onOpenDetails(product.id)}
                      onQuickAdd={() => onQuickAdd(product)}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>
    </section>
  );
}
