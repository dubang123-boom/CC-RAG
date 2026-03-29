import {
  LayoutDashboard,
  PlusCircle,
  FolderOpen,
  MessageSquareWarning,
} from "lucide-react"
import type { NavGroup } from "./types"

export const sidebarData: { navGroups: NavGroup[] } = {
  navGroups: [
    {
      title: "功能",
      items: [
        {
          title: "概览",
          url: "/dashboard",
          icon: LayoutDashboard,
        },
        {
          title: "新建申辩",
          url: "/tool",
          icon: PlusCircle,
        },
        {
          title: "投诉应对",
          url: "/complaint",
          icon: MessageSquareWarning,
        },
        {
          title: "历史案件",
          url: "/history",
          icon: FolderOpen,
        },
      ],
    },
  ],
}
