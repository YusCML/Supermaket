// Product categories.
//
// There's no separate categories table: a category is simply the text saved
// on each product. The list of categories the app knows about is
//   the starter (template) categories below
//   + every category that a product already uses.
// So when an admin types a brand-new category while adding a product, it
// becomes part of that list automatically and is suggested for the next product.
//
// Used by:
//   - src/components/Inventory.tsx: suggestions for the Category box, and
//     matchCategory() when saving a product
//   - src/components/ui/category-input.tsx: the text box with suggestions
//     (isNewCategory() decides when to say "new category")
//   - src/components/ProductMenu.tsx: groupByCategory() for the POS menu

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
// Input: any list of things that have a `category` text (usually products).
// Output: the list of category names to suggest.
export function categorySuggestions(products: { category: string }[]): string[] {
  // A Map remembers key -> value pairs and keeps them in the order they were
  // added. Key = the simplified name (for spotting duplicates), value = the
  // spelling to show. Templates go in first, so they come first.
  const byKey = new Map<string, string>();
  for (const name of TEMPLATE_CATEGORIES) byKey.set(categoryKey(name), name);

  // Every category the products use, trimmed, with empty ones dropped, A–Z.
  // `(name): name is string =>` tells TypeScript that after this filter there
  // are no undefined values left in the list.
  const used = products
    .map((product) => product.category?.trim())
    .filter((name): name is string => Boolean(name))
    .sort((a, b) => a.localeCompare(b));
  // Add each one unless that category (in any spelling) is already in.
  for (const name of used) {
    if (!byKey.has(categoryKey(name))) byKey.set(categoryKey(name), name);
  }
  // `[...x]` turns the Map's values into a normal array.
  return [...byKey.values()];
}

// Turns what the admin typed into the category to save:
//  - matches an existing category in different capitals -> use the existing
//    spelling, so "beverages" doesn't become a second "Beverages"
//  - anything else -> saved as typed (trimmed). That's how new categories start.
// `known` is the list from categorySuggestions().
export function matchCategory(typed: string, known: string[]): string {
  const trimmed = typed.trim();
  // .find() gives the first known name that matches, or undefined if none
  // does; `?? trimmed` then falls back to what was typed.
  return known.find((name) => categoryKey(name) === categoryKey(trimmed)) ?? trimmed;
}

// True if `typed` isn't one of the known categories yet.
// An empty box is never "new". Capitals and extra spaces are ignored.
export function isNewCategory(typed: string, known: string[]): boolean {
  const trimmed = typed.trim();
  return trimmed !== '' && !known.some((name) => categoryKey(name) === categoryKey(trimmed));
}

// Splits products into category groups for the POS menu:
// template categories in their set order first, then the others A–Z, and
// "Other" (no category) last. Categories with no products are left out.
//
// `<T extends { category: string }>` makes this a "generic" function: T is a
// stand-in for whatever type you pass in, as long as it has a `category`
// text. If you give it ProductInventorySummary items, you get back groups of
// ProductInventorySummary items (not a vaguer type), so no information is lost.
// Output: [{ name: 'Dairy', items: [...] }, { name: 'Bakery', items: [...] }, ...]
export function groupByCategory<T extends { category: string }>(items: T[]): { name: string; items: T[] }[] {
  // 1. Put each item into its group. Map key = simplified category name.
  const groups = new Map<string, { name: string; items: T[] }>();

  for (const item of items) {
    const raw = item.category?.trim() || NO_CATEGORY;
    const key = categoryKey(raw);
    // Show the template's spelling if it is one, otherwise the product's own.
    const name = TEMPLATE_CATEGORIES.find((t) => categoryKey(t) === key) ?? raw;
    if (!groups.has(key)) groups.set(key, { name, items: [] });
    // The `!` tells TypeScript "this can't be undefined": the line above has
    // just made sure the group exists.
    groups.get(key)!.items.push(item);
  }

  // 2. Each group's place in the menu: a template category gets its position
  //    in TEMPLATE_CATEGORIES (0, 1, 2...), any other category comes right
  //    after the templates, and "Other" gets the biggest possible number so
  //    it's always last.
  const rank = (name: string) => {
    if (categoryKey(name) === categoryKey(NO_CATEGORY)) return Number.MAX_SAFE_INTEGER;
    const index = TEMPLATE_CATEGORIES.findIndex((t) => categoryKey(t) === categoryKey(name));
    return index === -1 ? TEMPLATE_CATEGORIES.length : index;
  };

  // 3. Sort by rank. `||` means: if two groups have the same rank (0
  //    difference), fall back to A–Z by name.
  return [...groups.values()].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}
