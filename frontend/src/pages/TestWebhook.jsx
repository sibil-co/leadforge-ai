import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { LeadCard, LeadPanel } from '../components/LeadComponents'

export default function TestWebhook() {
  useAuth()
  const token = localStorage.getItem('token')
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }

  // --- AI-analyzed results from last Apify run ---
  const [results, setResults] = useState(null)
  const [jobInfo, setJobInfo] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedPost, setSelectedPost] = useState(null)

  // --- Live test (trigger new 1-post Apify run) ---
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveError, setLiveError] = useState(null)
  const [liveJob, setLiveJob] = useState(null)
  const [liveStatus, setLiveStatus] = useState(null)
  const pollRef = useRef(null)

  // Poll live test until done, then auto-analyze
  useEffect(() => {
    if (!liveJob) return
    if (liveStatus?.status === 'completed' || liveStatus?.status === 'failed') return

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/scrape', { headers })
        const data = await res.json()
        const found = (data.jobs || []).find(j => j.id === liveJob.id)
        if (found) {
          setLiveStatus(found)
          if (found.status === 'completed') {
            clearInterval(pollRef.current)
            analyzeLastRun()
          } else if (found.status === 'failed') {
            clearInterval(pollRef.current)
          }
        }
      } catch { /* ignore */ }
    }, 5000)

    return () => clearInterval(pollRef.current)
  }, [liveJob, liveStatus?.status])

  const analyzeLastRun = async () => {
    setLoading(true)
    setError(null)
    setResults(null)
    try {
      const res = await fetch('/api/scrape?action=labanalyze', { headers })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Analysis failed')
      } else {
        setResults(data.results || [])
        setJobInfo(data.job)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const runLiveTest = async () => {
    setLiveLoading(true)
    setLiveError(null)
    setLiveJob(null)
    setLiveStatus(null)
    clearInterval(pollRef.current)
    try {
      const res = await fetch('/api/scrape?action=livetest', { method: 'POST', headers, body: JSON.stringify({}) })
      const data = await res.json()
      if (!res.ok) setLiveError(data.error || 'Failed to start')
      else { setLiveJob(data.job); setLiveStatus(data.job) }
    } catch (err) {
      setLiveError(err.message)
    } finally {
      setLiveLoading(false)
    }
  }

  const isLiveRunning = liveJob && liveStatus?.status !== 'completed' && liveStatus?.status !== 'failed'

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem' }}>
      <h2 style={{ marginBottom: '0.25rem' }}>Scraper Lab</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        Analyze posts from the last Apify run with GPT — no filtering applied, no DB writes. Use this to tune what the AI extracts.
      </p>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem', alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={analyzeLastRun} disabled={loading || isLiveRunning}>
          {loading ? 'Running GPT analysis…' : 'Analyze Last Run with GPT'}
        </button>

        <button className="btn btn-secondary" onClick={runLiveTest} disabled={liveLoading || isLiveRunning} style={{ fontSize: '0.85rem' }}>
          {liveLoading ? 'Starting…' : isLiveRunning ? 'Apify running…' : 'Trigger New 1-Post Run'}
        </button>

        {isLiveRunning && (
          <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
            Apify run <code>{liveJob?.apify_run_id}</code> — polling…
          </span>
        )}
      </div>

      {liveError && <ErrorBox msg={liveError} />}
      {error && <ErrorBox msg={error} />}

      {/* Job info bar */}
      {jobInfo && results && (
        <div style={{ marginBottom: '1rem', padding: '0.6rem 1rem', background: 'var(--bg-secondary)', borderRadius: 8, fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <span>Run: <code>{jobInfo.apify_run_id}</code></span>
          <span>Posts analyzed: <strong>{results.length}</strong></span>
          <span>Housing: <strong>{results.filter(r => r._ai?.is_housing_listing).length}</strong></span>
          <span>Non-housing: <strong>{results.filter(r => r._ai?.is_housing_listing === false).length}</strong></span>
          <span>GPT failed: <strong>{results.filter(r => !r._ai).length}</strong></span>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
          Fetching posts and running GPT analysis…
        </div>
      )}

      {results && results.length === 0 && (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No posts found in the last run's dataset.
        </div>
      )}

      {results && results.length > 0 && (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: '1.25rem'
          }}>
            {results.map(post => (
              <div key={post.id} style={{ position: 'relative' }}>
                {/* AI verdict badge overlay */}
                {post._ai && (
                  <div style={{
                    position: 'absolute', top: -10, right: -10, zIndex: 10,
                    background: post._ai.is_housing_listing ? '#16a34a' : '#dc2626',
                    color: 'white', fontSize: '0.65rem', fontWeight: 700,
                    borderRadius: 10, padding: '2px 8px',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.2)'
                  }}>
                    {post._ai.is_housing_listing ? `Housing ✓ (${post._ai.relevance_score}/10)` : `Not housing ✗`}
                  </div>
                )}
                <LeadCard lead={post} onClick={setSelectedPost} />
              </div>
            ))}
          </div>

          {/* AI debug table */}
          <div style={{ marginTop: '2rem' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>AI Verdict Summary</h3>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Author</th>
                    <th>Housing?</th>
                    <th>Location correct?</th>
                    <th>Confidence</th>
                    <th>Score</th>
                    <th>Type</th>
                    <th>Direction</th>
                    <th>Detected location</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedPost(r)}>
                      <td>{i + 1}</td>
                      <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</td>
                      <td>
                        <span style={{ color: r._ai?.is_housing_listing ? '#16a34a' : r._ai?.is_housing_listing === false ? '#dc2626' : '#6b7280', fontWeight: 600 }}>
                          {r._ai?.is_housing_listing === true ? 'Yes' : r._ai?.is_housing_listing === false ? 'No' : '—'}
                        </span>
                      </td>
                      <td>{r._ai?.is_correct_location === true ? '✓' : r._ai?.is_correct_location === false ? '✗' : '—'}</td>
                      <td>{r._ai?.location_confidence || '—'}</td>
                      <td>{r._ai?.relevance_score ?? '—'}</td>
                      <td>{r._ai?.listing_type || '—'}</td>
                      <td>{r._ai?.listing_direction || '—'}</td>
                      <td>{r._ai?.detected_location || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {selectedPost && (
        <LeadPanel
          lead={selectedPost}
          onClose={() => setSelectedPost(null)}
          onStatusChange={null}
        />
      )}
    </div>
  )
}

function ErrorBox({ msg }) {
  return (
    <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '0.875rem', color: '#dc2626', fontSize: '0.875rem', marginBottom: '1rem' }}>
      {msg}
    </div>
  )
}
