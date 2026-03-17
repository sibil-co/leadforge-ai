import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function TestWebhook() {
  useAuth() // ensure we're inside auth context
  const navigate = useNavigate()
  const token = localStorage.getItem('token')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const runSimulation = async () => {
    setLoading(true)
    setResult(null)
    setError(null)

    try {
      const res = await fetch('/api/scrape?action=simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({})
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Simulation failed')
      } else {
        setResult(data)
      }
    } catch (err) {
      setError(err.message || 'Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '2rem' }}>
      <h2 style={{ marginBottom: '0.5rem' }}>Pipeline Simulation</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '0.9rem' }}>
        Tests the full groups scrape-to-lead pipeline with mock Facebook group post data — no Apify cost.
        Use this to verify DB writes, lead creation, and housing relevance filtering work before using the real scraper.
      </p>

      <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          Simulates 3 mock posts from group <code>1445573419202140</code>:<br />
          • 2BR condo for rent (Bangkok) — should be extracted as lead<br />
          • Studio near BTS Asok — should be extracted as lead<br />
          • Restaurant recommendation — should be filtered out (not housing)
        </p>
        <button
          className="btn btn-primary"
          onClick={runSimulation}
          disabled={loading}
        >
          {loading ? 'Running simulation...' : 'Run Simulation'}
        </button>
      </div>

      {error && (
        <div style={{
          background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8,
          padding: '1rem', color: '#dc2626', marginBottom: '1rem'
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div style={{
          background: result.leadsCreated > 0 ? '#f0fdf4' : '#fffbeb',
          border: `1px solid ${result.leadsCreated > 0 ? '#86efac' : '#fcd34d'}`,
          borderRadius: 8, padding: '1.5rem'
        }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>
            {result.leadsCreated > 0 ? '✓ ' : ''}{result.message}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={{ background: 'white', borderRadius: 6, padding: '0.75rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#16a34a' }}>{result.leadsCreated}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Leads Created</div>
            </div>
            <div style={{ background: 'white', borderRadius: 6, padding: '0.75rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{result.totalMockItems}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Mock Posts Processed</div>
            </div>
          </div>

          {result.errors?.length > 0 && (
            <div style={{ background: '#fee2e2', borderRadius: 6, padding: '0.75rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
              <strong>Errors:</strong>
              <ul style={{ margin: '0.5rem 0 0 1rem' }}>
                {result.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          {result.leadsCreated > 0 && (
            <button className="btn btn-primary" onClick={() => navigate('/leads')}>
              View Leads
            </button>
          )}
        </div>
      )}

      <div style={{ marginTop: '2rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: 8, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        <strong>What this tests:</strong>
        <ul style={{ margin: '0.5rem 0 0 1rem' }}>
          <li>Database connectivity and lead insertion</li>
          <li>Groups scraper field mapping (postText, authorName, time, images)</li>
          <li>Housing relevance filtering (no keywords required for groups)</li>
          <li>Price and area extraction from post text</li>
          <li>Duplicate lead detection (run twice to verify)</li>
          <li>Job status lifecycle (running → completed)</li>
        </ul>
        <div style={{ marginTop: '0.75rem' }}>
          <strong>What this does NOT test:</strong> the Apify webhook callback (requires a real scrape run).
        </div>
      </div>
    </div>
  )
}
