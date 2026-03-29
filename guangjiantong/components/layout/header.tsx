"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

export function Header({
  className,
  children,
  fixed,
  ...props
}: React.ComponentProps<"header"> & { fixed?: boolean }) {
  const [offset, setOffset] = React.useState(0)

  React.useEffect(() => {
    const onScroll = () => setOffset(document.body.scrollTop)
    // Using document.body for scrolling in sidebar inset layout
    document.body.addEventListener("scroll", onScroll, { passive: true })
    return () => document.body.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      data-slot="header"
      className={cn(
        "flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear",
        fixed && "sticky top-0 z-10 bg-background",
        offset > 10 && fixed ? "h-12 border-b shadow-sm" : "",
        className
      )}
      {...props}
    >
      <div className="flex w-full items-center gap-1 px-4 md:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        {children}
      </div>
    </header>
  )
}
