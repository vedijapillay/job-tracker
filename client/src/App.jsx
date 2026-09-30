import { useState, useEffect } from 'react'

export default function App() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)

  // Filter state
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSource, setFilterSource] = useState('')

  // Form state
  const [formData, setFormData] = useState({
    company: '',
    jobTitle: '',
    appliedDate: '',
    status: 'Applied',
    source: ''
  })

  // Fetch jobs on mount
  useEffect(() => {
    fetchJobs()
  }, [filterStatus, filterSource])

  const fetchJobs = async () => {
    setLoading(true)
    setError(null)
    try {
      let url = '/api/jobs'
      const params = new URLSearchParams()
      if (filterStatus) params.append('status', filterStatus)
      if (filterSource) params.append('source', filterSource)
      if (params.toString()) url += '?' + params.toString()

      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch jobs')
      const data = await res.json()
      setJobs(data.jobs || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAddJob = async (e) => {
    e.preventDefault()
    if (!formData.company || !formData.jobTitle || !formData.appliedDate) {
      setError('Please fill in all required fields')
      return
    }

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })
      if (!res.ok) throw new Error('Failed to add job')
      
      setFormData({
        company: '',
        jobTitle: '',
        appliedDate: '',
        status: 'Applied',
        source: ''
      })
      setShowForm(false)
      fetchJobs()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleUpdateStatus = async (id, newStatus) => {
    try {
      const res = await fetch(`/api/jobs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })
      if (!res.ok) throw new Error('Failed to update job')
      fetchJobs()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDeleteJob = async (id) => {
    if (!confirm('Are you sure you want to delete this job?')) return
    try {
      const res = await fetch(`/api/jobs/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete job')
      fetchJobs()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleExportCSV = () => {
    if (jobs.length === 0) {
      setError('No jobs to export')
      return
    }

    const headers = ['Company', 'Job Title', 'Status', 'Source', 'Applied Date', 'Last Update']
    const rows = jobs.map(job => [
      job.company,
      job.jobTitle,
      job.status,
      job.source || '',
      job.appliedDate,
      job.lastEmailDate || ''
    ])

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `job-tracker-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const statuses = ['Applied', 'Rejected', 'Interview Scheduled', 'Recruiter Screen', 'Technical Round', 'HM Round', 'Offer', 'Declined by You', 'Ghosted']
  const sources = [...new Set(jobs.map(job => job.source).filter(Boolean))]

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Job Tracker</h1>
          <p className="text-gray-600">Track all your job applications in one place</p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-4 text-red-700 hover:text-red-900 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mb-6 flex gap-4 flex-wrap">
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 text-white px-6 py-2 rounded font-semibold hover:bg-blue-700"
          >
            {showForm ? 'Cancel' : '+ Add Job'}
          </button>
          <button
            onClick={handleExportCSV}
            className="bg-green-600 text-white px-6 py-2 rounded font-semibold hover:bg-green-700"
          >
            📥 Export CSV
          </button>
        </div>

        {/* Add Job Form */}
        {showForm && (
          <div className="mb-8 p-6 bg-white rounded-lg shadow-md border border-gray-200">
            <h2 className="text-2xl font-bold mb-4">Add New Job</h2>
            <form onSubmit={handleAddJob} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="Company *"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                required
                className="border border-gray-300 rounded px-4 py-2"
              />
              <input
                type="text"
                placeholder="Job Title *"
                value={formData.jobTitle}
                onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                required
                className="border border-gray-300 rounded px-4 py-2"
              />
              <input
                type="date"
                value={formData.appliedDate}
                onChange={(e) => setFormData({ ...formData, appliedDate: e.target.value })}
                required
                className="border border-gray-300 rounded px-4 py-2"
              />
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="border border-gray-300 rounded px-4 py-2"
              >
                {statuses.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Source (LinkedIn, Builtin, etc)"
                value={formData.source}
                onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                className="border border-gray-300 rounded px-4 py-2"
              />
              <button
                type="submit"
                className="bg-blue-600 text-white px-6 py-2 rounded font-semibold hover:bg-blue-700 md:col-span-2"
              >
                Add Job
              </button>
            </form>
          </div>
        )}

        {/* Filters */}
        <div className="mb-6 flex gap-4 flex-wrap">
          <div>
            <label className="block text-sm font-semibold mb-2">Filter by Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border border-gray-300 rounded px-4 py-2"
            >
              <option value="">All Statuses</option>
              {statuses.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2">Filter by Source</label>
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value)}
              className="border border-gray-300 rounded px-4 py-2"
            >
              <option value="">All Sources</option>
              {sources.map(source => (
                <option key={source} value={source}>{source}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => {
              setFilterStatus('')
              setFilterSource('')
            }}
            className="self-end bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500"
          >
            Clear Filters
          </button>
        </div>

        {/* Jobs Table */}
        <div className="bg-white rounded-lg shadow-md overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-600">Loading jobs...</div>
          ) : jobs.length === 0 ? (
            <div className="p-8 text-center text-gray-600">No jobs found. Add one to get started!</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-100 border-b">
                  <th className="px-6 py-3 text-left font-semibold">Company</th>
                  <th className="px-6 py-3 text-left font-semibold">Job Title</th>
                  <th className="px-6 py-3 text-left font-semibold">Status</th>
                  <th className="px-6 py-3 text-left font-semibold">Source</th>
                  <th className="px-6 py-3 text-left font-semibold">Applied Date</th>
                  <th className="px-6 py-3 text-left font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => (
                  <tr key={job.id} className="border-b hover:bg-gray-50">
                    <td className="px-6 py-3 font-semibold">{job.company}</td>
                    <td className="px-6 py-3">{job.jobTitle}</td>
                    <td className="px-6 py-3">
                      <select
                        value={job.status}
                        onChange={(e) => handleUpdateStatus(job.id, e.target.value)}
                        className="border border-gray-300 rounded px-2 py-1 text-sm"
                      >
                        {statuses.map(status => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600">{job.source || '—'}</td>
                    <td className="px-6 py-3 text-sm">{job.appliedDate}</td>
                    <td className="px-6 py-3">
                      <button
                        onClick={() => handleDeleteJob(job.id)}
                        className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Stats Footer */}
        {jobs.length > 0 && (
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded text-sm text-gray-700">
            Total: {jobs.length} jobs | Rejected: {jobs.filter(j => j.status === 'Rejected').length} | 
            Interviews: {jobs.filter(j => j.status === 'Interview Scheduled').length}
          </div>
        )}
      </div>
    </div>
  )
}