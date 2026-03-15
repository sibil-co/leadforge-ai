import { useState, useEffect } from 'react'
import { Users, AlertCircle, CheckCircle, XCircle, TrendingUp } from 'lucide-react'
import { api } from '../services/api'

export default function Dashboard() {
  const [stats, setStats] = useState({ total: 0, new_count: 0, engaging_count: 0, secured_count: 0, dead_count: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      const data = await api.leads.getAll({ limit: 1000 })
      const leads = data.leads || []
      
      const newCount = leads.filter(l => l.status === 'new').length
      const engagingCount = leads.filter(l => l.status === 'engaging').length
      const securedCount = leads.filter(l => l.status === 'secured').length
      const deadCount = leads.filter(l => l.status === 'dead').length
      
      setStats({
        total: leads.length,
        new_count: newCount,
        engaging_count: engagingCount,
        secured_count: securedCount,
        dead_count: deadCount
      })
    } catch (error) {
      console.error('Failed to load stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const statCards = [
    { label: 'Total Leads', value: stats.total, icon: Users, color: 'var(--primary)' },
    { label: 'New Leads', value: stats.new_count, icon: AlertCircle, color: '#3b82f6' },
    { label: 'Engaging', value: stats.engaging_count, icon: TrendingUp, color: '#f59e0b' },
    { label: 'Secured', value: stats.secured_count, icon: CheckCircle, color: 'var(--success)' },
    { label: 'Dead', value: stats.dead_count, icon: XCircle, color: 'var(--danger)' }
  ]

  return (
    <div>
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>Overview of your lead generation performance</p>
      </div>

      {loading ? (
        <p>Loading stats...</p>
      ) : (
        <div className="stats-grid">
          {statCards.map((stat) => (
            <div key={stat.label} className="stat-card">
              <div className="stat-card-label">{stat.label}</div>
              <div className="stat-card-value" style={{ color: stat.color }}>
                <stat.icon size={24} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Getting Started</h3>
        </div>
        <div className="card-body">
          <ol style={{ paddingLeft: '1.5rem', lineHeight: 2 }}>
            <li>Go to the <strong>Scrape</strong> page to find leads from Facebook</li>
            <li>Use the <strong>Leads</strong> page to manage your scraped leads</li>
            <li>Start AI outreach to engage with leads automatically</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
