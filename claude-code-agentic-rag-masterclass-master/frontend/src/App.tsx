import { useState, useEffect } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginPage from './pages/LoginPage'
import ChatPage from './pages/ChatPage'
import ImportPage from './pages/ImportPage'

type View = 'chat' | 'import'

function AppContent() {
  const { user, loading } = useAuth()
  const [view, setView] = useState<View>('chat')

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!user) return <LoginPage />

  if (view === 'import') {
    return (
      <ImportPage
        onNavigateToChat={() => setView('chat')}
      />
    )
  }

  return (
    <ChatPage
      onNavigateToImport={() => setView('import')}
    />
  )
}

function App() {
  useEffect(() => {
    const theme = localStorage.getItem('theme')
    if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [])

  return (
    <AuthProvider>
      <AppContent />
      <Toaster />
    </AuthProvider>
  )
}

export default App
