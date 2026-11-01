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

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

// The dark see-through layer behind the window. It fades in and out.
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

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("flex flex-col gap-1 pr-8", className)} {...props} />
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-end", className)}
      {...props}
    />
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-xl font-bold tracking-tight text-ink", className)}
      {...props}
    />
  )
}

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
