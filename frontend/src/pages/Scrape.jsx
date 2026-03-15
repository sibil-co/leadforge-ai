import { useState, useEffect } from 'react'
import { Play, CheckCircle, XCircle, Clock, Loader2, RefreshCw } from 'lucide-react'
import { api } from '../services/api'

export default function Scrape() {
  const [country, setCountry] = useState('USA')
  const [city, setCity] = useState('')
  const [keywords, setKeywords] = useState('')
  const [isScraping, setIsScraping] = useState(false)
  const [message, setMessage] = useState('')
  const [jobs, setJobs] = useState([])
  const [loadingJobs, setLoadingJobs] = useState(true)
  const [activeJobId, setActiveJobId] = useState(null)

  useEffect(() => {
    loadJobs()
    const interval = setInterval(() => {
      if (activeJobId) {
        loadJobs()
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [activeJobId])

  const loadJobs = async () => {
    try {
      setLoadingJobs(true)
      const data = await api.scrape.getJobs()
      setJobs(data.jobs || [])
      
      const runningJob = data.jobs?.find(j => j.status === 'running')
      setActiveJobId(runningJob?.id || null)
    } catch (error) {
      console.error('Failed to load jobs:', error)
    } finally {
      setLoadingJobs(false)
    }
  }

  const handleScrape = async (e) => {
    e.preventDefault()
    setIsScraping(true)
    setMessage('')
    
    try {
      const keywordList = keywords.split(',').map(k => k.trim()).filter(k => k)
      
      const result = await api.scrape.trigger({
        country,
        city,
        keywords: keywordList
      })
      
      if (result.job) {
        setMessage(`Scraping started! Job ID: ${result.job.id.slice(0,8)}...`)
        setActiveJobId(result.job.id)
        loadJobs()
      } else {
        setMessage('Error: ' + (result.error || 'Unknown error'))
      }
    } catch (error) {
      setMessage('Failed to trigger scraper: ' + error.message)
    } finally {
      setIsScraping(false)
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={16} style={{ color: 'var(--success)' }} />
      case 'running':
        return <Loader2 size={16} className="spin" style={{ color: 'var(--warning)' }} />
      case 'failed':
        return <XCircle size={16} style={{ color: 'var(--danger)' }} />
      default:
        return <Clock size={16} style={{ color: 'var(--text-secondary)' }} />
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return '#10b981'
      case 'running': return '#f59e0b'
      case 'failed': return '#ef4444'
      default: return '#64748b'
    }
  }

  return (
    <div>
      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .progress-bar { height: 4px; background: #e2e8f0; border-radius: 2px; overflow: hidden; }
        .progress-fill { height: 100%; transition: width 0.3s ease; }
      `}</style>
      
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2>Scrape</h2>
            <p>Find leads by scraping Facebook groups and pages</p>
          </div>
          <button className="btn btn-secondary" onClick={loadJobs}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      {activeJobId && (
        <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid #f59e0b' }}>
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
              <Loader2 size={20} className="spin" style={{ color: '#f59e0b' }} />
              <strong>Scraping in progress...</strong>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: '60%', background: '#f59e0b' }}></div>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
              Auto-refreshing every 5 seconds
            </p>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: '2rem' }}>
        <div className="card-header">
          <h3 className="card-title">Start New Scrape</h3>
        </div>
        <div className="card-body">
          <form onSubmit={handleScrape}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Country</label>
                <select
                  className="form-select"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                >
                  <option value="USA">United States</option>
                  <option value="FR">France</option>
                  <option value="TH">Thailand</option>
                  <option value="UK">United Kingdom</option>
                  <option value="CA">Canada</option>
                  <option value="AU">Australia</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">City (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g., Miami, Paris, Bangkok"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Keywords (comma-separated)</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g., real estate, homes for sale, property"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isScraping || !keywords}
              >
                <Play size={18} />
                {isScraping ? 'Starting...' : 'Start Crawl'}
              </button>
              
              {message && (
                <span style={{ color: message.includes('Error') ? 'var(--danger)' : 'var(--success)', fontSize: '0.875rem' }}>
                  {message}
                </span>
              )}
            </div>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Scrape History</h3>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            {jobs.length} job{jobs.length !== 1 ? 's' : ''}
          </span>
        </div>
        {loadingJobs && jobs.length === 0 ? (
          <div className="card-body">Loading jobs...</div>
        ) : jobs.length === 0 ? (
          <div className="empty-state">
            <p>No scrape jobs yet. Start your first scrape above!</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Location</th>
                <th>Keywords</th>
                <th>Status</th>
                <th>Leads</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} style={{ background: job.status === 'running' ? '#fefce8' : 'transparent' }}>
                  <td>
                    <div>{new Date(job.created_at).toLocaleDateString()}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {new Date(job.created_at).toLocaleTimeString()}
                    </div>
                  </td>
                  <td>
                    <strong>{job.country}</strong>
                    {job.city && <span style={{ color: 'var(--text-secondary)' }}> - {job.city}</span>}
                  </td>
                  <td>
                    <div style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {job.keywords?.join(', ')}
                    </div>
                  </td>
                  <td>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {getStatusIcon(job.status)}
                      <span style={{ textTransform: 'capitalize', color: getStatusColor(job.status) }}>
                        {job.status}
                      </span>
                    </span>
                  </td>
                  <td>
                    <span style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      minWidth: '40px',
                      padding: '0.25rem 0.5rem',
                      background: job.leads_count > 0 ? '#d1fae5' : '#f1f5f9',
                      color: job.leads_count > 0 ? '#059669' : '#64748b',
                      borderRadius: '0.25rem',
                      fontWeight: '600',
                      fontSize: '0.875rem'
                    }}>
                      {job.leads_count || 0}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
