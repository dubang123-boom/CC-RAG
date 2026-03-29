"use client"

import Link from "next/link"
import { Scale } from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar"
import { NavGroup } from "./nav-group"
import { sidebarData } from "./sidebar-data"
import { SidebarThemeToggle } from "./sidebar-theme-toggle"

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-0">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Scale className="size-4" />
            </div>
            <span className="text-sm font-bold group-data-[collapsible=icon]:hidden">
              有辩法
            </span>
          </Link>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {sidebarData.navGroups.map((group) => (
          <NavGroup key={group.title} {...group} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarThemeToggle />
      </SidebarFooter>
    </Sidebar>
  )
}
