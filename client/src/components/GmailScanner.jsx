import { useState, useEffect } from 'react'
import GmailSetup from './GmailSetup'

const STATUSES = ['Applied', 'Rejected', 'Interview Scheduled', 'Recruiter Screen', 'Technical Round', 'HM Round', 'Offer', 'Declined by You', 'Ghosted']

export default function GmailScanner({ onJobsDetected }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [connected, setConnected] = useState(false)
  const [detectedJobs, setDetectedJobs] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [showSetup, setShowSetup] = useState(false)

  const refreshConnectionStatus = async () => {
    try {
      const res = await fetch('/api/gmail/status')
      const data = await res.json()
      setConnected(Boolean(data.connected))
      return { connected: Boolean(data.connected), configured: Boolean(data.configured) }
    } catch {
      return { connected: false, configured: false }
    }
  }

  // On load: learn whether Gmail is connected, and finish the sign-in if we
  // were just redirected back from Google
  useEffect(() => {
    refreshConnectionStatus()
    if (window.location.hash === '#gmail=connected') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
      scanGmailEmails()
    }
  }, [])

  // No Google credentials yet: set those up. Already signed in: scan. Otherwise sign in first.
  const handleScanClick = async () => {
    const status = await refreshConnectionStatus()
    if (!status.configured) {
      setShowSetup(true)
    } else if (status.connected) {
      scanGmailEmails()
    } else {
      startOAuthFlow()
    }
  }

  const handleCredentialsChanged = async () => {
    await refreshConnectionStatus()
    setNotice('Google credentials updated. Click “Scan Gmail” to sign in.')
  }

  const disconnectGmail = async () => {
    try {
      const res = await fetch('/api/gmail/disconnect', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to disconnect Gmail')
      setConnected(false)
      setNotice('Gmail disconnected. You will be asked to sign in on the next scan.')
    } catch (err) {
      setError(err.message)
    }
  }

  const startOAuthFlow = async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/gmail/auth')
      const data = await res.json()

      if (data.code === 'not_configured') {
        setShowSetup(true)
        setLoading(false)
        return
      }
      if (!data.authUrl) {
        throw new Error('Failed to get auth URL')
      }

      window.location.href = data.authUrl
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  const scanGmailEmails = async () => {
    try {
      setLoading(true)
      setError(null)
      setNotice(null)

      const res = await fetch('/api/gmail/scan', { method: 'POST' })

      if (!res.ok) {
        const errData = await res.json()
        if (errData.code === 'not_configured') {
          setShowSetup(true)
          return
        }
        // Access was revoked or expired: sign in again instead of showing an error
        if (errData.code === 'reauth_required' || errData.code === 'not_connected') {
          setConnected(false)
          await startOAuthFlow()
          return
        }
        throw new Error(errData.error || 'Failed to scan Gmail')
      }

      const data = await res.json()
      setDetectedJobs(data.detectedJobs || [])

      if (data.detectedJobs && data.detectedJobs.length > 0) {
        setShowModal(true)
      } else if (data.alreadyTracked > 0) {
        setNotice(`Your tracker is up to date: ${data.alreadyTracked} email${data.alreadyTracked === 1 ? '' : 's'} matched jobs you already track.`)
      } else {
        setError('No job-related emails detected. Try checking your inbox manually.')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Remember the email server-side so future scans skip it
  const markProcessed = (job, reason) =>
    fetch('/api/gmail/processed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: job.id,
        reason,
        senderEmail: job.senderEmail,
        subject: job.lastEmailSubject
      })
    })

  const removeDetected = (job) => {
    setDetectedJobs(prev => {
      const remaining = prev.filter(j => j.id !== job.id)
      if (remaining.length === 0) setShowModal(false)
      return remaining
    })
  }

  const dismissJob = async (job) => {
    try {
      const res = await markProcessed(job, 'dismissed')
      if (!res.ok) throw new Error('Failed to dismiss email')
      removeDetected(job)
    } catch (err) {
      setError(err.message)
    }
  }

  // The email is about a job that is already tracked: move it forward instead of adding a row
  const updateExistingJob = async (job) => {
    try {
      const res = await fetch(`/api/jobs/${job.matchedJob.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: job.status,
          lastEmailDate: job.lastEmailDate,
          lastEmailSubject: job.lastEmailSubject,
          emailId: job.id
        })
      })

      if (!res.ok) throw new Error('Failed to update job')

      if (onJobsDetected) onJobsDetected(job)
      removeDetected(job)
    } catch (err) {
      setError(err.message)
    }
  }

  const addJobToTracker = async (job) => {
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: job.company,
          jobTitle: job.jobTitle || `Job at ${job.company}`,
          appliedDate: job.lastEmailDate,
          status: job.status,
          source: job.source,
          lastEmailDate: job.lastEmailDate,
          lastEmailSubject: job.lastEmailSubject,
          emailId: job.id
        })
      })

      if (!res.ok) throw new Error('Failed to add job')

      // Notify parent component
      if (onJobsDetected) {
        onJobsDetected(job)
      }

      removeDetected(job)
    } catch (err) {
      setError(err.message)
    }
  }

  const updateDetected = (index, changes) => {
    setDetectedJobs(prev =>
      prev.map((job, i) => (i === index ? { ...job, ...changes } : job))
    )
  }

  return (
    <>
      {/* Scan Button */}
      <button
        onClick={handleScanClick}
        disabled={loading}
        className="bg-purple-600 text-white px-6 py-2 rounded font-semibold hover:bg-purple-700 disabled:bg-gray-400"
      >
        {loading ? '⏳ Working...' : '🔍 Scan Gmail'}
      </button>
      {!loading && (
        <button
          onClick={() => setShowSetup(true)}
          className="self-center text-sm text-gray-500 underline hover:text-gray-700"
        >
          Gmail setup
        </button>
      )}
      {connected && !loading && (
        <button
          onClick={disconnectGmail}
          className="self-center text-sm text-gray-500 underline hover:text-gray-700"
        >
          Disconnect Gmail
        </button>
      )}

      {showSetup && (
        <GmailSetup onClose={() => setShowSetup(false)} onChanged={handleCredentialsChanged} />
      )}

      {/* Error Message */}
      {error && (
        <div className="mt-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-4 text-red-700 hover:text-red-900 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Info Message */}
      {notice && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-300 text-blue-800 rounded">
          {notice}
          <button
            onClick={() => setNotice(null)}
            className="ml-4 text-blue-800 hover:text-blue-950 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Modal: Detected Jobs */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-purple-700 text-white p-6 border-b">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">📧 Detected Job Applications</h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-2xl hover:text-gray-200"
                >
                  ✕
                </button>
              </div>
              <p className="text-purple-100 mt-2">
                {detectedJobs.length} job(s) found in your emails. Add them to your tracker.
              </p>
            </div>

            {/* Jobs List */}
            <div className="p-6 space-y-4">
              {detectedJobs.map((job, index) => (
                <div
                  key={job.id || index}
                  className="border border-gray-300 rounded-lg p-4 bg-gray-50 hover:bg-gray-100 transition"
                >
                  {/* Existing job this email belongs to */}
                  {job.matchedJob && (
                    <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-900">
                      Already tracking <strong>{job.matchedJob.company}</strong>
                      {job.matchedJob.jobTitle ? ` – ${job.matchedJob.jobTitle}` : ''}
                      {' '}({job.matchedJob.status}). This email suggests <strong>{job.status}</strong>.
                    </div>
                  )}
                  {!job.matchedJob && job.similarCount > 0 && (
                    <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-900">
                      {job.similarCount} jobs at this company are already tracked and this email has no
                      job title, so it can't be matched automatically.
                    </div>
                  )}

                  {/* Company & Status (editable) */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-sm font-semibold mb-1">Company</label>
                      <input
                        type="text"
                        value={job.company}
                        onChange={(e) => updateDetected(index, { company: e.target.value })}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold mb-1">Status</label>
                      <select
                        value={job.status}
                        onChange={(e) => updateDetected(index, { status: e.target.value })}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                      >
                        {STATUSES.map(status => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Job Title Input */}
                  <div className="mb-3">
                    <label className="block text-sm font-semibold mb-1">Job Title (optional)</label>
                    <input
                      type="text"
                      placeholder="e.g., Senior Engineer, Product Manager"
                      value={job.jobTitle}
                      onChange={(e) => updateDetected(index, { jobTitle: e.target.value })}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                    />
                  </div>

                  {/* Email Subject & Date */}
                  <div className="text-sm text-gray-600 space-y-1 mb-4">
                    <p>
                      <strong>Email:</strong> {job.lastEmailSubject}
                    </p>
                    <p>
                      <strong>Date:</strong> {job.lastEmailDate}
                    </p>
                    <p>
                      <strong>From:</strong> {job.senderEmail}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    {job.matchedJob ? (
                      <>
                        <button
                          onClick={() => updateExistingJob(job)}
                          className="flex-1 bg-purple-600 text-white px-4 py-2 rounded font-semibold hover:bg-purple-700 transition"
                        >
                          ↻ Update status
                        </button>
                        <button
                          onClick={() => addJobToTracker(job)}
                          className="bg-white text-purple-700 border border-purple-300 px-4 py-2 rounded hover:bg-purple-50 transition"
                        >
                          + Add as new job
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => addJobToTracker(job)}
                        className="flex-1 bg-purple-600 text-white px-4 py-2 rounded font-semibold hover:bg-purple-700 transition"
                      >
                        ✓ Add to Tracker
                      </button>
                    )}
                    <button
                      onClick={() => dismissJob(job)}
                      className="bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded hover:bg-gray-100 transition"
                    >
                      ✕ Not a job email
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-gray-100 p-4 border-t flex justify-end gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}