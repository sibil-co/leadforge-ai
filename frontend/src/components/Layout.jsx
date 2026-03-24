import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, Search, MessageSquare, LogOut, FlaskConical, Building2, Menu, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const closeSidebar = () => setSidebarOpen(false)

  return (
    <div className="app-layout" style={{ flexDirection: 'column', minHeight: '100vh' }}>

      {/* ── Mobile header ─────────────────────────────────────────────────── */}
      <header className="mobile-header">
        <button
          className="hamburger-btn"
          onClick={() => setSidebarOpen(o => !o)}
          aria-label="Toggle menu"
        >
          {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <div className="mobile-header-logo">
          <Search size={20} />
          LeadForge
        </div>
      </header>

      {/* ── Sidebar overlay ───────────────────────────────────────────────── */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
        onClick={closeSidebar}
      />

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <Search size={28} />
          <h1>LeadForge</h1>
        </div>

        <nav>
          <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end onClick={closeSidebar}>
            <LayoutDashboard size={20} />
            Dashboard
          </NavLink>
          <NavLink to="/leads" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={closeSidebar}>
            <Users size={20} />
            Leads
          </NavLink>
          <NavLink to="/properties" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={closeSidebar}>
            <Building2 size={20} />
            Properties
          </NavLink>
          <NavLink to="/scrape" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={closeSidebar}>
            <Search size={20} />
            Scrape
          </NavLink>
          <NavLink to="/conversations" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={closeSidebar}>
            <MessageSquare size={20} />
            Conversations
          </NavLink>
          <NavLink to="/test" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={closeSidebar}>
            <FlaskConical size={20} />
            Test
          </NavLink>
        </nav>

        <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ padding: '0.75rem 1rem', marginBottom: '0.5rem' }}>
            <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{user?.name}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>{user?.email}</div>
          </div>
          <button onClick={handleLogout} className="nav-item" style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer' }}>
            <LogOut size={20} />
            Logout
          </button>
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main className="main-content">
        {children}
      </main>
    </div>
  )
}
