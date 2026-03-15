import { Users, TrendingUp, AlertCircle, XCircle, CheckCircle } from 'lucide-react'
import { mockStats } from '../data/mockData'

export default function Dashboard() {
  const stats = [
    { label: 'Total Leads', value: mockStats.total, icon: Users, color: 'var(--primary)' },
    { label: 'New Leads', value: mockStats.new_count, icon: AlertCircle, color: '#3b82f6' },
    { label: 'Engaging', value: mockStats.engaging_count, icon: TrendingUp, color: '#f59e0b' },
    { label: 'Secured', value: mockStats.secured_count, icon: CheckCircle, color: 'var(--success)' },
    { label: 'Dead', value: mockStats.dead_count, icon: XCircle, color: 'var(--danger)' }
  ]

  return (
    <div>
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>Overview of your lead generation performance</p>
      </div>

      <div className="stats-grid">
        {stats.map((stat) => (
          <div key={stat.label} className="stat-card">
            <div className="stat-card-label">{stat.label}</div>
            <div className="stat-card-value" style={{ color: stat.color }}>
              <stat.icon size={24} style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Recent Activity</h3>
        </div>
        <div className="card-body">
          <p style={{ color: 'var(--text-secondary)' }}>
            Connect your API keys in Settings to see real-time activity.
          </p>
        </div>
      </div>
    </div>
  )
}
