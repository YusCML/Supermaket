// ui/button.tsx: the <Button> used on every screen.
//
// Part of the design system in components/ui. Built on two libraries:
//  - Base UI ("@base-ui/react"): unstyled, accessible building blocks. Its
//    Button gives us correct keyboard and disabled behaviour; we add the look.
//  - cva ("class-variance-authority"): you list the classes every button
//    gets, plus named "variants" (outline, ghost…) and sizes, and cva gives
//    back a function that builds the right class string for a given choice.
//
// cn() (from lib/utils) joins class names together. It skips empty ones,
// and when two Tailwind classes clash (say px-5 and px-3) the later one wins,
// which is what lets a caller's className override ours.
import * as React from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

// The one button used across the app. Pick a look with `variant` and a size
// with `size` instead of writing the Tailwind classes out each time:
//
//   <Button>Save</Button>                              green main action
//   <Button variant="outline" size="sm">Refresh</Button>
//   <Button variant="destructive">Write off</Button>   red, for actions that remove things
//
// It renders a normal <button type="button">; pass type="submit" inside forms.
// The keyboard focus ring comes from the global :focus-visible rule in index.css.
// Buttons are pill-shaped (fully rounded ends); icon-only sizes become circles.
//
// The first string below is given to EVERY button. A few parts worth knowing:
//   disabled:opacity-50 …        greyed out and unclickable while disabled
//   active:translate-y-px        moves down 1px while pressed, like a real key
//   [&_svg]:…                    rules for any icon (svg) inside the button
//   [&_svg:not([class*='size-'])]:size-4
//                                icons are 16px unless the icon was given its
//                                own size-… class
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-transparent font-semibold whitespace-nowrap transition-colors select-none active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Main action on a screen (Save, Complete Transaction…)
        default: "bg-brand text-white shadow-xs hover:bg-brand-hover",
        // Secondary actions (Cancel, Refresh, Edit…)
        outline: "border-gray-300 bg-white text-ink shadow-2xs hover:bg-subtle",
        secondary: "bg-subtle text-ink hover:bg-gray-200",
        // Quiet icon buttons (close ×, remove from basket…)
        ghost: "text-ink-muted hover:bg-subtle hover:text-ink",
        // Actions that remove or destroy something
        destructive: "bg-danger-strong text-white shadow-xs hover:bg-danger-strong/90",
        // Looks like a text link but behaves as a button
        link: "text-brand-strong underline-offset-4 hover:underline",
      },
      // Heights: sm 32px, default 36px, lg 44px. The icon-… sizes are square
      // (so the pill becomes a circle) for buttons that only hold an icon,
      // like the + / − / × buttons in the POS basket.
      size: {
        sm: "h-8 px-3.5 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        default: "h-9 px-5 text-sm",
        lg: "h-11 px-6 text-sm",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    // Used when a <Button> doesn't say which variant/size it wants.
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

// forwardRef lets a parent grab the real <button> (e.g. to focus it when a
// pop-up opens). React 18 needs this; a plain function component drops `ref`.
// ProductDetails uses it: its "Add" button gets the focus when the window opens.
//
// The two types in <…> are: what the ref points at (a real <button>), and the
// props the Button accepts = every prop of Base UI's Button (onClick,
// disabled, type…) plus our `variant` and `size`. VariantProps<…> reads those
// two names and their allowed values straight from buttonVariants above, so
// TypeScript complains about a typo like variant="outlined".
const Button = React.forwardRef<
  HTMLButtonElement,
  ButtonPrimitive.Props & VariantProps<typeof buttonVariants>
>(function Button({ className, variant = "default", size = "default", ...props }, ref) {
  // buttonVariants() builds the class string for this variant + size and
  // adds the caller's className at the end. Everything else (onClick,
  // children, disabled…) is passed through unchanged with {...props}.
  // data-slot="button" is just a name tag on the element, handy for finding it
  // in the browser's developer tools or targeting it from CSS.
  return (
    <ButtonPrimitive
      ref={ref}
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
})

// buttonVariants is exported too, so something that isn't a <Button> can
// still borrow the button look by calling buttonVariants({ variant: … }).
// (Nothing in the app does that at the moment.)
export { Button, buttonVariants }
