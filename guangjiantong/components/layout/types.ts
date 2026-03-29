import type { LucideIcon } from "lucide-react"

export interface NavItem {
  title: string
  url: string
  icon?: LucideIcon
  badge?: string
  isActive?: boolean
  items?: NavItem[]
}

export interface NavGroup {
  title: string
  items: NavItem[]
}
