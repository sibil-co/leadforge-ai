import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, Search, MessageSquare, LogOut } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <Search size={28} />
          <h1>LeadForge</h1>
        </div>

        <nav>
          <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end>
            <LayoutDashboard size={20} />
            Dashboard
          </NavLink>
          <NavLink to="/leads" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Users size={20} />
            Leads
          </NavLink>
          <NavLink to="/scrape" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Search size={20} />
            Scrape
          </NavLink>
          <NavLink to="/conversations" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <MessageSquare size={20} />
            Conversations
          </NavLink>
        </nav>

        <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ padding: '0.75rem 1rem', marginBottom: '0.5rem' }}>
            <div style={{ fontWeight: 500 }}>{user?.name}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{user?.email}</div>
          </div>
          <button onClick={handleLogout} className="nav-item" style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer' }}>
            <LogOut size={20} />
            Logout
          </button>
        </div>
      </aside>

      <main className="main-content">
        {children}
      </main>
    </div>
  )
}
