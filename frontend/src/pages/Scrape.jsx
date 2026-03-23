import { useState, useEffect } from 'react'
import { Play, CheckCircle, XCircle, Clock, Loader2, RefreshCw, Square } from 'lucide-react'
import { api } from '../services/api'

export default function Scrape() {
  const [country, setCountry] = useState('TH')
  const [groupUrls, setGroupUrls] = useState('https://www.facebook.com/groups/1445573419202140/')
  const [filterKeywords, setFilterKeywords] = useState('')
  const [resultsLimit, setResultsLimit] = useState(20)
  const [isScraping, setIsScraping] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [message, setMessage] = useState('')
  const [jobs, setJobs] = useState([])
  const [loadingJobs, setLoadingJobs] = useState(true)
  const [activeJobId, setActiveJobId] = useState(null)
  const [activeJob, setActiveJob] = useState(null)
  const [analyzingJobId, setAnalyzingJobId] = useState(null)

  useEffect(() => {
    loadJobs()
    const interval = setInterval(() => {
      if (activeJobId) {
        loadJobs()
      }
    }, 6000)
    return () => clearInterval(interval)
  }, [activeJobId])

  // Auto-trigger next batch when active job is still analyzing
  useEffect(() => {
    if (activeJob?.stage === 'analyzing' && activeJob?.status === 'running' && !analyzingJobId) {
      const timer = setTimeout(() => {
        setAnalyzingJobId(activeJob.id)
        api.scrape.analyzeJob(activeJob.id)
          .then(loadJobs)
          .catch(console.error)
          .finally(() => setAnalyzingJobId(null))
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [activeJob?.stage, activeJob?.status, analyzingJobId])

  const loadJobs = async () => {
    try {
      setLoadingJobs(true)
      const data = await api.scrape.getJobs()
      setJobs(data.jobs || [])

      const runningJob = data.jobs?.find(j => j.status === 'running' || j.status === 'pending' || (j.stage === 'analyzing' && j.status !== 'completed'))
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
      const urls = groupUrls.split('\n').map(u => u.trim()).filter(u => u)
      const keywords = filterKeywords.split(',').map(k => k.trim()).filter(k => k)

      const result = await api.scrape.trigger({
        country,
        groupUrls: urls,
        keywords,
        resultsLimit: parseInt(resultsLimit) || 20
      })

      if (result.job) {
        setMessage(`Scraping ${urls.length} group(s) for housing posts...`)
        setActiveJobId(result.job.id)
        loadJobs()
      } else {
        setMessage('Error: ' + (result.error || 'Unknown error'))
      }
    } catch (error) {
      setMessage('Failed to start scrape: ' + error.message)
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
        setMessage('Scrape stopped')
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
      case 'pending':
        return <Clock size={16} style={{ color: '#64748b' }} />
      case 'running':
      case 'processing':
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
      case 'processing': return '#f59e0b'
      case 'partial': return '#f59e0b'
      case 'cancelled': return '#6b7280'
      case 'failed': return '#ef4444'
      default: return '#64748b'
    }
  }

  const handleRetryAnalysis = async (jobId) => {
    setAnalyzingJobId(jobId)
    try {
      await api.scrape.analyzeJob(jobId)
      loadJobs()
    } catch (error) {
      console.error('Failed to retry analysis:', error)
    } finally {
      setAnalyzingJobId(null)
    }
  }

  const getStageLabel = (stage) => {
    switch (stage) {
      case 'search': return 'Stage 1: Scraping Groups'
      case 'scraping_done': return 'Stage 1 Done — Starting AI Analysis'
      case 'analyzing': return 'Stage 2: Analyzing with AI'
      case 'processing': return 'Stage 2: Analyzing with AI'
      case 'completed': return 'Completed'
      case 'failed': return 'Failed'
      case 'pending': return 'Waiting for local scraper…'
      default: return 'Pending'
    }
  }

  const getProgressWidth = (stage) => {
    switch (stage) {
      case 'search': return '20%'
      case 'scraping_done': return '50%'
      case 'analyzing': return '75%'
      case 'processing': return '75%'
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
      `}</style>

      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2>Scrape</h2>
            <p>Crawl Facebook groups and extract housing leads</p>
          </div>
          <button className="btn btn-secondary" onClick={loadJobs}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      {activeJob && (activeJob.status === 'running' || activeJob.status === 'pending') && (
        <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid #3b82f6' }}>
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <Loader2 size={24} className="spin" style={{ color: '#3b82f6' }} />
              <strong style={{ fontSize: '1.1rem' }}>{getStageLabel(activeJob.stage)}</strong>
            </div>

            <div className="progress-bar">
              <div className="progress-fill" style={{ width: getProgressWidth(activeJob.stage), background: 'linear-gradient(90deg, #3b82f6, #10b981)' }}></div>
            </div>

            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '1rem', marginBottom: 0 }}>
              {activeJob.stage === 'search' && 'Fetching posts from Facebook groups...'}
              {activeJob.stage === 'scraping_done' && `Saved ${activeJob.posts_count || '?'} posts — starting AI analysis...`}
              {(activeJob.stage === 'analyzing' || activeJob.stage === 'processing') && `Analyzing ${activeJob.posts_count || '?'} posts with AI...`}
              {activeJob.stage === 'completed' && `Done! ${activeJob.posts_count || 0} posts → ${activeJob.leads_count || 0} leads + ${activeJob.properties_count || 0} properties.`}
            </p>

            <div style={{ marginTop: '1rem' }}>
              <button
                className="btn"
                style={{ background: '#ef4444', color: 'white', padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                onClick={handleCancel}
                disabled={isCancelling}
              >
                <Square size={16} style={{ marginRight: '0.5rem' }} />
                {isCancelling ? 'Cancelling...' : 'Stop Scrape'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: '2rem' }}>
        <div className="card-header">
          <h3 className="card-title">Scrape Facebook Groups</h3>
        </div>
        <div className="card-body">
          <form onSubmit={handleScrape}>
            <div className="form-group">
              <label className="form-label">Country</label>
              <select
                className="form-select"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                style={{ maxWidth: 200 }}
              >
                <option value="TH">Thailand</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Group URLs (one per line)</label>
              <textarea
                className="form-input"
                rows={4}
                placeholder={`https://www.facebook.com/groups/1445573419202140/\nhttps://www.facebook.com/groups/...`}
                value={groupUrls}
                onChange={(e) => setGroupUrls(e.target.value)}
                required
                style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '0.85rem' }}
              />
              <small style={{ color: 'var(--text-secondary)' }}>
                Only public Facebook groups are supported
              </small>
            </div>

            <div className="form-group">
              <label className="form-label">Posts per group</label>
              <input
                type="number"
                className="form-input"
                min={1}
                max={200}
                value={resultsLimit}
                onChange={e => setResultsLimit(e.target.value)}
                style={{ maxWidth: 100 }}
              />
              <small style={{ color: 'var(--text-secondary)' }}>Max posts to scrape per group (1–200)</small>
            </div>

            <div className="form-group">
              <label className="form-label">Filter keywords (optional, comma-separated)</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g., rental, condo, villa — leave blank to capture all housing posts"
                value={filterKeywords}
                onChange={(e) => setFilterKeywords(e.target.value)}
              />
              <small style={{ color: 'var(--text-secondary)' }}>
                Leave blank to use housing vocabulary detection only
              </small>
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isScraping || !groupUrls.trim()}
              >
                <Play size={18} />
                {isScraping ? 'Starting...' : 'Start Scrape'}
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
                <th>Groups</th>
                <th>Progress</th>
                <th>Posts</th>
                <th>Results</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const isAnalyzing = job.stage === 'analyzing' || job.stage === 'processing'
                const isDone = job.stage === 'completed'
                const needsRetry = ['scraping_done', 'failed', 'analyzing'].includes(job.stage) && job.status !== 'running'
                // Show retry button for completed jobs with poor conversion (less than 10%)
                const hasLowConversion = isDone && job.posts_count > 0 && ((job.leads_count || 0) + (job.properties_count || 0)) / job.posts_count < 0.1
                const canRetry = needsRetry || hasLowConversion
                return (
                <tr key={job.id} style={{ background: job.status === 'running' ? '#fefce8' : 'transparent' }}>
                  <td>
                    <div>{new Date(job.created_at).toLocaleDateString()}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {new Date(job.created_at).toLocaleTimeString()}
                    </div>
                  </td>
                  <td>
                    <div style={{ maxWidth: '220px' }}>
                      {(job.group_urls || []).length > 0 ? (
                        (job.group_urls || []).map((u, i) => {
                          const match = u.match(/groups\/(\d+)/)
                          return (
                            <div key={i} style={{ fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <a href={u} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }}>
                                {match ? `Group ${match[1]}` : u}
                              </a>
                            </div>
                          )
                        })
                      ) : (
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>—</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {getStatusIcon(job.status)}
                      <span style={{ textTransform: 'capitalize', color: getStatusColor(job.status), fontSize: '0.875rem' }}>
                        {getStageLabel(job.stage || job.status)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: 4 }}>
                      {canRetry && (
                        <button
                          onClick={() => handleRetryAnalysis(job.id)}
                          disabled={analyzingJobId === job.id}
                          style={{ fontSize: '0.72rem', color: analyzingJobId === job.id ? '#9ca3af' : '#2563eb', background: 'none', border: 'none', cursor: analyzingJobId === job.id ? 'default' : 'pointer', padding: 0, textDecoration: 'underline' }}
                        >
                          {analyzingJobId === job.id ? 'Analyzing...' : (hasLowConversion ? 'Re-analyze' : 'Retry AI Analysis')}
                        </button>
                      )}
                      {(job.status === 'running' || analyzingJobId === job.id) && (
                        <button
                          onClick={() => api.scrape.cancel(job.id).then(loadJobs).catch(console.error)}
                          style={{ fontSize: '0.72rem', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                        >
                          Stop
                        </button>
                      )}
                    </div>
                  </td>
                  <td>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      minWidth: '36px', padding: '0.25rem 0.5rem',
                      background: (job.posts_count > 0) ? '#f0f9ff' : '#f1f5f9',
                      color: (job.posts_count > 0) ? '#0369a1' : '#64748b',
                      borderRadius: '0.25rem', fontWeight: '600', fontSize: '0.875rem'
                    }}>
                      {job.posts_count ?? (job.status === 'running' ? '…' : 0)}
                    </span>
                  </td>
                  <td>
                    {isDone ? (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        <span style={{ color: '#1d4ed8', fontWeight: 600 }}>{job.leads_count || 0}</span>
                        <span style={{ color: '#9ca3af', margin: '0 3px' }}>/</span>
                        <span style={{ color: '#059669', fontWeight: 600 }}>{job.properties_count || 0}</span>
                      </span>
                    ) : isAnalyzing ? (
                      <Loader2 size={14} className="spin" style={{ color: '#f59e0b' }} />
                    ) : (
                      <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>—</span>
                    )}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
