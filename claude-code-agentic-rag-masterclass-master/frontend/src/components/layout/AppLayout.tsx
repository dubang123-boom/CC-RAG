import { useState, useEffect, type ReactNode } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LogOut, User, MessageSquare, FileUp, Menu, Sun, Moon } from 'lucide-react'

interface AppLayoutProps {
  children: ReactNode
  sidebar?: ReactNode
  activeView?: 'chat' | 'import'
  onNavigateToChat?: () => void
  onNavigateToImport?: () => void
}

export default function AppLayout({
  sidebar,
  children,
  activeView = 'chat',
  onNavigateToChat,
  onNavigateToImport,
}: AppLayoutProps) {
  const { user, signOut } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains('dark')
  )

  const toggleDark = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }

  // Close sidebar on navigation (mobile)
  useEffect(() => {
    setSidebarOpen(false)
  }, [activeView])

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar - desktop */}
      {sidebar && (
        <div className="hidden sm:block w-64 shrink-0 border-r bg-muted/30">
          {sidebar}
        </div>
      )}

      {/* Sidebar - mobile overlay */}
      {sidebar && sidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 sm:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 w-64 border-r bg-muted/30 sm:hidden transition-transform">
            {sidebar}
          </div>
        </>
      )}

      {/* Main */}
      <div className="flex flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-14 items-center justify-between border-b px-4">
          <div className="flex items-center gap-1">
            {/* Hamburger for mobile */}
            {sidebar && (
              <Button
                variant="ghost"
                size="icon"
                className="sm:hidden mr-1"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-4 w-4" />
              </Button>
            )}
            <h1 className="text-lg font-semibold mr-3">RAG Chat</h1>
            <Button
              variant={activeView === 'chat' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={onNavigateToChat}
              className="gap-1.5"
            >
              <MessageSquare className="h-4 w-4" />
              Chat
            </Button>
            <Button
              variant={activeView === 'import' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={onNavigateToImport}
              className="gap-1.5"
            >
              <FileUp className="h-4 w-4" />
              Import
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={toggleDark}>
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <User className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                  {user?.email}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => signOut()}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  )
}
