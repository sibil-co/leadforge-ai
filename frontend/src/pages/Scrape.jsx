import { useState, useEffect } from 'react'
import { Play, CheckCircle, XCircle, Clock, Loader2, RefreshCw, Square, Search } from 'lucide-react'
import { api } from '../services/api'

export default function Scrape() {
  const [country, setCountry] = useState('TH')
  const [city, setCity] = useState('')
  const [keywords, setKeywords] = useState('')
  const [isScraping, setIsScraping] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [message, setMessage] = useState('')
  const [jobs, setJobs] = useState([])
  const [loadingJobs, setLoadingJobs] = useState(true)
  const [activeJobId, setActiveJobId] = useState(null)
  const [activeJob, setActiveJob] = useState(null)

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
      setActiveJob(runningJob || null)
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
        setMessage(`Search started! Finding Facebook pages for: ${keywordList.join(', ')}`)
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

  const handleCancel = async () => {
    if (!activeJobId) return
    
    const confirmed = window.confirm('Are you sure you want to stop this crawl?')
    if (!confirmed) return
    
    setIsCancelling(true)
    try {
      const result = await api.scrape.cancel(activeJobId)
      if (result.success) {
        setMessage('Search stopped')
        setActiveJobId(null)
        setActiveJob(null)
        loadJobs()
      } else {
        setMessage('Error: ' + (result.error || 'Failed to cancel'))
      }
    } catch (error) {
      setMessage('Failed to cancel: ' + error.message)
    } finally {
      setIsCancelling(false)
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={16} style={{ color: 'var(--success)' }} />
      case 'running':
        return <Loader2 size={16} className="spin" style={{ color: 'var(--warning)' }} />
      case 'partial':
        return <Clock size={16} style={{ color: '#f59e0b' }} />
      case 'cancelled':
        return <XCircle size={16} style={{ color: '#6b7280' }} />
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
      case 'partial': return '#f59e0b'
      case 'cancelled': return '#6b7280'
      case 'failed': return '#ef4444'
      default: return '#64748b'
    }
  }

  const getStageLabel = (stage) => {
    switch (stage) {
      case 'search': return 'Searching Facebook'
      case 'completed': return 'Completed'
      case 'failed': return 'Failed'
      default: return 'Pending'
    }
  }

  const getProgressWidth = (stage) => {
    switch (stage) {
      case 'search': return '50%'
      case 'completed': return '100%'
      default: return '10%'
    }
  }

  return (
    <div>
      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .progress-bar { height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; }
        .progress-fill { height: 100%; transition: width 0.5s ease; }
        .stage-dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
        .stage-dot.active { background: #3b82f6; animation: pulse 2s infinite; }
        .stage-dot.completed { background: #10b981; }
        .stage-dot.pending { background: #cbd5e1; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
      
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2>Scrape</h2>
            <p>Find leads by searching Facebook pages with keywords</p>
          </div>
          <button className="btn btn-secondary" onClick={loadJobs}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      {activeJob && activeJob.status === 'running' && (
        <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid #3b82f6' }}>
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <Loader2 size={24} className="spin" style={{ color: '#3b82f6' }} />
              <strong style={{ fontSize: '1.1rem' }}>{getStageLabel(activeJob.stage)}</strong>
            </div>
            
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: getProgressWidth(activeJob.stage), background: 'linear-gradient(90deg, #3b82f6, #10b981)' }}></div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className={`stage-dot ${activeJob.stage === 'search' ? 'active' : (activeJob.stage === 'completed' ? 'completed' : 'pending')}`}></span>
                <Search size={16} style={{ color: activeJob.stage === 'search' ? '#3b82f6' : '#64748b' }} />
                <span style={{ fontSize: '0.875rem' }}>Search</span>
              </div>
            </div>

            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '1rem', marginBottom: 0 }}>
              {activeJob.stage === 'search' && 'Searching Facebook for pages matching your keywords...'}
              {activeJob.stage === 'completed' && `Search complete! Found ${activeJob.leads_count} leads matching your keywords.`}
            </p>

            <div style={{ marginTop: '1rem' }}>
              <button
                className="btn"
                style={{ background: '#ef4444', color: 'white', padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                onClick={handleCancel}
                disabled={isCancelling}
              >
                <Square size={16} style={{ marginRight: '0.5rem' }} />
                {isCancelling ? 'Cancelling...' : 'Stop Search'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeJob && activeJob.status === 'partial' && (
        <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid #f59e0b', background: '#fffbeb' }}>
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <Clock size={24} style={{ color: '#f59e0b' }} />
              <div>
                <strong style={{ color: '#f59e0b' }}>Search completed with some errors</strong>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Found {activeJob.leads_count} leads
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: '2rem' }}>
        <div className="card-header">
          <h3 className="card-title">Start New Crawl</h3>
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
                  <option value="TH">Thailand</option>
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
                placeholder="e.g., short term rental, property, villa"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                required
              />
              <small style={{ color: 'var(--text-secondary)' }}>
                Enter keywords to search Facebook posts
              </small>
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isScraping || !keywords}
              >
                <Play size={18} />
                {isScraping ? 'Starting...' : 'Start Search'}
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
          <h3 className="card-title">Search History</h3>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            {jobs.length} job{jobs.length !== 1 ? 's' : ''}
          </span>
        </div>
        {loadingJobs && jobs.length === 0 ? (
          <div className="card-body">Loading jobs...</div>
        ) : jobs.length === 0 ? (
          <div className="empty-state">
            <p>No search jobs yet. Start your first search above!</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Location</th>
                <th>Keywords</th>
                <th>Progress</th>
                <th>Leads</th>
                <th>Properties</th>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {getStatusIcon(job.status)}
                      <span style={{ textTransform: 'capitalize', color: getStatusColor(job.status), fontSize: '0.875rem' }}>
                        {job.stage || job.status}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      minWidth: '36px', padding: '0.25rem 0.5rem',
                      background: job.leads_count > 0 ? '#dbeafe' : '#f1f5f9',
                      color: job.leads_count > 0 ? '#1d4ed8' : '#64748b',
                      borderRadius: '0.25rem', fontWeight: '600', fontSize: '0.875rem'
                    }}>
                      {job.leads_count ?? (job.status === 'running' ? '…' : 0)}
                    </span>
                  </td>
                  <td>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      minWidth: '36px', padding: '0.25rem 0.5rem',
                      background: job.properties_count > 0 ? '#d1fae5' : '#f1f5f9',
                      color: job.properties_count > 0 ? '#059669' : '#64748b',
                      borderRadius: '0.25rem', fontWeight: '600', fontSize: '0.875rem'
                    }}>
                      {job.properties_count ?? (job.status === 'running' ? '…' : 0)}
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
