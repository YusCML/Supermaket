// utils.ts: small helpers shared by the whole UI. Right now just one: cn().
//
// cn() joins CSS class names into one string, and is used by nearly every
// component (imported as `@/lib/utils`; `@/` is a shortcut for `src/`, set up
// in tsconfig.json and vite.config.ts). Two things make it handy:
//   1. It skips "empty" values, so you can switch a class on and off:
//        cn('px-4', isActive && 'font-bold')  ->  'px-4 font-bold' or 'px-4'
//   2. It knows Tailwind. When two classes fight over the same thing, the
//      LATER one wins and the earlier one is dropped:
//        cn('px-2', 'px-4')  ->  'px-4'
//      That lets a component have default classes that a caller can override.
//
// The real code lives in the small "cn" package from npm (a drop-in
// replacement for the popular clsx + tailwind-merge pair). This file just
// passes it on ("re-exports" it), so components import it from one place in
// our own code and the package could be swapped later without touching them.
export { cn } from "cn"
