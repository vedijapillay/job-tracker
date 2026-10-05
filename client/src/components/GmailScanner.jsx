import { useState, useEffect } from 'react'

const STATUSES = ['Applied', 'Rejected', 'Interview Scheduled', 'Recruiter Screen', 'Technical Round', 'HM Round', 'Offer', 'Declined by You', 'Ghosted']

export default function GmailScanner({ onJobsDetected }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [detectedJobs, setDetectedJobs] = useState([])
  const [showModal, setShowModal] = useState(false)

  // Returning from Google: the callback redirects here with the token in the URL fragment
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1))
    const accessToken = params.get('gmail_token')
    if (accessToken) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
      scanGmailEmails(accessToken)
    }
  }, [])

  const startOAuthFlow = async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/gmail/auth')
      const data = await res.json()

      if (!data.authUrl) {
        throw new Error('Failed to get auth URL')
      }

      window.location.href = data.authUrl
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  const scanGmailEmails = async (accessToken) => {
    try {
      setLoading(true)
      setError(null)

      const res = await fetch('/api/gmail/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken })
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Failed to scan Gmail')
      }

      const data = await res.json()
      setDetectedJobs(data.detectedJobs || [])

      if (data.detectedJobs && data.detectedJobs.length > 0) {
        setShowModal(true)
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
        onClick={startOAuthFlow}
        disabled={loading}
        className="bg-purple-600 text-white px-6 py-2 rounded font-semibold hover:bg-purple-700 disabled:bg-gray-400"
      >
        {loading ? '⏳ Working...' : '🔍 Scan Gmail'}
      </button>

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
                    <button
                      onClick={() => addJobToTracker(job)}
                      className="flex-1 bg-purple-600 text-white px-4 py-2 rounded font-semibold hover:bg-purple-700 transition"
                    >
                      ✓ Add to Tracker
                    </button>
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