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
        link: "text-brand-strong underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3.5 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        default: "h-9 px-5 text-sm",
        lg: "h-11 px-6 text-sm",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

// forwardRef lets a parent grab the real <button> (e.g. to focus it when a
// pop-up opens). React 18 needs this; a plain function component drops `ref`.
const Button = React.forwardRef<
  HTMLButtonElement,
  ButtonPrimitive.Props & VariantProps<typeof buttonVariants>
>(function Button({ className, variant = "default", size = "default", ...props }, ref) {
  return (
    <ButtonPrimitive
      ref={ref}
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
})

export { Button, buttonVariants }
