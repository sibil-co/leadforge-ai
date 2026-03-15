import { useState } from 'react'
import { Play, CheckCircle, XCircle, Clock } from 'lucide-react'
import { mockScrapeJobs } from '../data/mockData'

export default function Scrape() {
  const [country, setCountry] = useState('USA')
  const [city, setCity] = useState('')
  const [keywords, setKeywords] = useState('')
  const [isScraping, setIsScraping] = useState(false)
  const [jobs] = useState(mockScrapeJobs)

  const handleScrape = async (e) => {
    e.preventDefault()
    setIsScraping(true)
    
    // Simulate API call
    setTimeout(() => {
      setIsScraping(false)
      alert('Scraper triggered! (Mock - Connect Apify API to see real results)')
    }, 2000)
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
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Scrape History</h3>
        </div>
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
                <td>{job.keywords.join(', ')}</td>
                <td>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {getStatusIcon(job.status)}
                    <span style={{ textTransform: 'capitalize' }}>{job.status}</span>
                  </span>
                </td>
                <td>{job.leads_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
