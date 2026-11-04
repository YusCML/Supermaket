// ui/dialog.tsx: the pop-up window ("dialog" or "modal") parts.
//
// Part of the design system in components/ui. Each function below wraps one
// part of Base UI's Dialog (Base UI = a library of unstyled, accessible
// building blocks) and adds our styling. Used by LoginDialog,
// RolePickerDialog and the POS ProductDetails pop-up. (The receipt pop-up,
// Receipt.tsx, is hand-built and doesn't use this file.)
import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { XIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

// Pop-up window used across the app (role picker, product details…).
// Base UI takes care of the hard parts for us: the keyboard focus stays inside
// the window while it's open, Escape and clicking the dark backdrop close it,
// and the page behind can't scroll.
//
//   <Dialog open={isOpen} onOpenChange={setIsOpen}>
//     <DialogContent>
//       <DialogHeader>
//         <DialogTitle>Title</DialogTitle>
//         <DialogDescription>One line of explanation.</DialogDescription>
//       </DialogHeader>
//       …
//     </DialogContent>
//   </Dialog>
//
// `open` + `onOpenChange` make it a "controlled component": the parent keeps
// the open/closed state in its own useState, and Base UI calls onOpenChange
// (with false) when the user presses Escape, clicks outside or presses ×.
//
// data-slot="…" on each part is just a name tag, handy for spotting the part
// in the browser's developer tools or targeting it from CSS.

// The root. It shows nothing itself; it holds the open/closed state and
// shares it with the parts inside.
function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

// A button that opens the dialog by itself (for when the parent doesn't
// control `open`).
function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

// A "portal" draws its children at the end of the page's <body> instead of
// where the component sits in the tree. That way the pop-up is never cut off
// by a parent with overflow:hidden and always lands on top of the page.
function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

// Any button that should close the dialog when clicked (e.g. "Cancel").
function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

// The dark see-through layer behind the window. It fades in and out.
// (Base UI puts a data-starting-style attribute on it for a moment while it
// appears, and data-ending-style while it disappears. Our classes set the
// opacity to 0 in both of those moments, and transition-opacity animates
// the change.)
function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 transition-opacity duration-150 data-starting-style:opacity-0 data-ending-style:opacity-0",
        className
      )}
      {...props}
    />
  )
}

// The white window itself, centred on screen. It fades and grows slightly as it
// opens. Make it wider with e.g. className="sm:max-w-2xl".
// It brings its own portal and overlay, so a page only needs
// <Dialog><DialogContent>…</DialogContent></Dialog>. Every other prop
// (e.g. initialFocus, which says what gets the keyboard focus on opening)
// is passed straight on to Base UI's Popup.
// It's never taller than the screen minus 2rem (max-h-[calc(100dvh-2rem)]).
function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  // Set to false for windows that must not be dismissed (e.g. the role picker
  // right after logging in).
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-hidden rounded-lg border border-gray-200 bg-white p-6 text-ink shadow-xl outline-none",
          "transition-[opacity,scale] duration-150 ease-out data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0",
          className
        )}
        {...props}
      >
        {children}
        {/* The × in the top-right corner. `render` tells Base UI to use our
            ghost Button as the element, so it gets Base UI's closing
            behaviour with our button's look. "sr-only" text is read by
            screen readers but not shown. */}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={<Button variant="ghost" size="icon-sm" className="absolute top-4 right-4" />}
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

// Stacks the title and description. pr-8 keeps a long title from running
// under the × button.
function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("flex flex-col gap-1 pr-8", className)} {...props} />
}

// The row of buttons at the bottom. On phones the buttons stack, with the
// last one (usually the main action) on top (flex-col-reverse); from the
// "sm" screen width up they sit in a row on the right.
function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-end", className)}
      {...props}
    />
  )
}

// The window's heading. Base UI links it to the window, so screen readers
// announce it as the window's name when it opens.
function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-xl font-bold tracking-tight text-ink", className)}
      {...props}
    />
  )
}

// A short grey line under the title. Also linked to the window, so it's
// read out after the title.
function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-ink-muted", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
