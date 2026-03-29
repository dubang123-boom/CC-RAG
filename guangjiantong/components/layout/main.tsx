import * as React from "react"
import { cn } from "@/lib/utils"

export function Main({
  fixed,
  className,
  ...props
}: React.ComponentProps<"div"> & { fixed?: boolean }) {
  return (
    <div
      data-slot="main"
      className={cn(
        "p-4 md:px-6",
        fixed && "flex flex-col flex-grow overflow-hidden",
        className
      )}
      {...props}
    />
  )
}
