import { useState } from 'react'
import { Play, CheckCircle, XCircle, Clock } from 'lucide-react'
import { api } from '../services/api'

export default function Scrape() {
  const [country, setCountry] = useState('USA')
  const [city, setCity] = useState('')
  const [keywords, setKeywords] = useState('')
  const [isScraping, setIsScraping] = useState(false)
  const [message, setMessage] = useState('')
  const [jobs, setJobs] = useState([])
  const [loadingJobs, setLoadingJobs] = useState(true)

  useState(() => {
    loadJobs()
  }, [])

  const loadJobs = async () => {
    try {
      setLoadingJobs(true)
      const data = await api.scrape.getJobs()
      setJobs(data.jobs || [])
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
      
      if (result.job || result.message) {
        setMessage('Scraper triggered! Check back for results.')
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
        return <Clock size={16} style={{ color: 'var(--warning)' }} />
      case 'failed':
        return <XCircle size={16} style={{ color: 'var(--danger)' }} />
      default:
        return <Clock size={16} style={{ color: 'var(--text-secondary)' }} />
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Scrape</h2>
        <p>Find leads by scraping Facebook groups and pages</p>
      </div>

      <div className="card" style={{ marginBottom: '2rem' }}>
        <div className="card-header">
          <h3 className="card-title">Start New Scrape</h3>
        </div>
        <div className="card-body">
          <form onSubmit={handleScrape}>
            <div className="form-group">
              <label className="form-label">Country</label>
              <select
                className="form-select"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              >
                <option value="USA">United States</option>
                <option value="FR">France</option>
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
                placeholder="e.g., Miami, Orlando, Tampa"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
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

            <button
              type="submit"
              className="btn btn-primary"
              disabled={isScraping || !keywords}
            >
              <Play size={18} />
              {isScraping ? 'Starting...' : 'Start Crawl'}
            </button>

            {message && (
              <p style={{ marginTop: '1rem', color: message.includes('Error') ? 'var(--danger)' : 'var(--success)' }}>
                {message}
              </p>
            )}
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Scrape History</h3>
        </div>
        {loadingJobs ? (
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
                <th>Country</th>
                <th>City</th>
                <th>Keywords</th>
                <th>Status</th>
                <th>Leads</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>{new Date(job.created_at).toLocaleDateString()}</td>
                  <td>{job.country}</td>
                  <td>{job.city || '-'}</td>
                  <td>{job.keywords?.join(', ') || '-'}</td>
                  <td>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {getStatusIcon(job.status)}
                      <span style={{ textTransform: 'capitalize' }}>{job.status}</span>
                    </span>
                  </td>
                  <td>{job.leads_count || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
