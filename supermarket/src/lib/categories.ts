// Product categories.
//
// There's no separate categories table: a category is simply the text saved
// on each product. The list of categories the app knows about is
//   the starter (template) categories below
//   + every category that a product already uses.
// So when an admin types a brand-new category while adding a product, it
// becomes part of that list automatically and is suggested for the next product.

// Starter categories suggested even before any product uses them.
// Their order is also the order the POS menu shows them in.
export const TEMPLATE_CATEGORIES = [
  'Fruits & Vegetables',
  'Meat & Seafood',
  'Dairy',
  'Bakery',
  'Beverages',
  'Snacks',
  'Pantry',
  'Frozen',
  'Household',
  'Personal Care',
];

// Used for products saved without a category.
export const NO_CATEGORY = 'Other';

// Two names count as the same category if they only differ in capitals or
// extra spaces ("beverages " and "Beverages").
const categoryKey = (name: string) => name.trim().toLowerCase();

// Every category to suggest in the Category box: templates first, then the
// ones products use (A–Z). Each name appears once, with the first spelling found.
export function categorySuggestions(products: { category: string }[]): string[] {
  const byKey = new Map<string, string>();
  for (const name of TEMPLATE_CATEGORIES) byKey.set(categoryKey(name), name);

  const used = products
    .map((product) => product.category?.trim())
    .filter((name): name is string => Boolean(name))
    .sort((a, b) => a.localeCompare(b));
  for (const name of used) {
    if (!byKey.has(categoryKey(name))) byKey.set(categoryKey(name), name);
  }
  return [...byKey.values()];
}

// Turns what the admin typed into the category to save:
//  - matches an existing category in different capitals -> use the existing
//    spelling, so "beverages" doesn't become a second "Beverages"
//  - anything else -> saved as typed (trimmed). That's how new categories start.
export function matchCategory(typed: string, known: string[]): string {
  const trimmed = typed.trim();
  return known.find((name) => categoryKey(name) === categoryKey(trimmed)) ?? trimmed;
}

// True if `typed` isn't one of the known categories yet.
export function isNewCategory(typed: string, known: string[]): boolean {
  const trimmed = typed.trim();
  return trimmed !== '' && !known.some((name) => categoryKey(name) === categoryKey(trimmed));
}

// Splits products into category groups for the POS menu:
// template categories in their set order first, then the others A–Z, and
// "Other" (no category) last. Categories with no products are left out.
export function groupByCategory<T extends { category: string }>(items: T[]): { name: string; items: T[] }[] {
  const groups = new Map<string, { name: string; items: T[] }>();

  for (const item of items) {
    const raw = item.category?.trim() || NO_CATEGORY;
    const key = categoryKey(raw);
    // Show the template's spelling if it is one, otherwise the product's own.
    const name = TEMPLATE_CATEGORIES.find((t) => categoryKey(t) === key) ?? raw;
    if (!groups.has(key)) groups.set(key, { name, items: [] });
    groups.get(key)!.items.push(item);
  }

  const rank = (name: string) => {
    if (categoryKey(name) === categoryKey(NO_CATEGORY)) return Number.MAX_SAFE_INTEGER;
    const index = TEMPLATE_CATEGORIES.findIndex((t) => categoryKey(t) === categoryKey(name));
    return index === -1 ? TEMPLATE_CATEGORIES.length : index;
  };

  return [...groups.values()].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}
