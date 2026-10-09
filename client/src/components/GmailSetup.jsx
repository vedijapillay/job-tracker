import { useState, useEffect } from 'react'

const LINKS = {
  project: 'https://console.cloud.google.com/projectcreate',
  api: 'https://console.cloud.google.com/apis/library/gmail.googleapis.com',
  consent: 'https://console.cloud.google.com/apis/credentials/consent',
  credentials: 'https://console.cloud.google.com/apis/credentials'
}

function ExternalLink({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-purple-700 underline hover:text-purple-900">
      {children}
    </a>
  )
}

export default function GmailSetup({ onClose, onChanged }) {
  const [config, setConfig] = useState(null)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null) // { ok, message } from the connection test
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/gmail/config')
        const data = await res.json()
        setConfig(data)
        setClientId(data.clientId || '')
      } catch {
        setError('Could not load the current settings.')
      }
    }
    load()
  }, [])

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const copyRedirectUri = async () => {
    try {
      await navigator.clipboard.writeText(config.redirectUri)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Copy failed. Select the address and copy it manually.')
    }
  }

  const runTest = async () => {
    const res = await fetch('/api/gmail/config/test', { method: 'POST' })
    const data = await res.json()
    setResult(data)
    return data
  }

  const saveAndTest = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/gmail/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')

      setConfig(data)
      setClientSecret('')
      const test = await runTest()
      if (test.ok && onChanged) onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const testOnly = async () => {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      await runTest()
    } catch {
      setError('The test could not run.')
    } finally {
      setBusy(false)
    }
  }

  const removeCredentials = async () => {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/gmail/config', { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to remove credentials')
      const data = await res.json()
      setConfig(data)
      setClientId(data.clientId || '')
      setClientSecret('')
      if (onChanged) onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="gmail-setup-title" className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-purple-700 text-white p-6">
          <div className="flex justify-between items-center">
            <h2 id="gmail-setup-title" className="text-2xl font-bold">Connect Gmail</h2>
            <button onClick={onClose} aria-label="Close" className="text-2xl hover:text-gray-200">✕</button>
          </div>
          <p className="text-purple-100 mt-2">
            Optional. Scanning your inbox finds applications, interviews, offers and rejections for you.
          </p>
        </div>

        <div className="p-6 space-y-5 text-gray-800">
          <p className="text-sm">
            To keep your email private, this app uses <strong>your own free Google Cloud project</strong>. Nothing is shared
            with anyone else, and your emails never leave this computer. Setup takes about 10 minutes, once.
          </p>

          <ol className="list-decimal pl-5 space-y-3 text-sm">
            <li>
              <ExternalLink href={LINKS.project}>Create a Google Cloud project</ExternalLink> (name it anything, e.g. “Job Tracker”).
            </li>
            <li>
              <ExternalLink href={LINKS.api}>Enable the Gmail API</ExternalLink> for that project. Check the project name at the top of the page first.
            </li>
            <li>
              Set up the <ExternalLink href={LINKS.consent}>OAuth consent screen</ExternalLink>: choose <strong>External</strong>, fill in an app name and your email,
              and add <strong>your own Gmail address under “Test users”</strong> (needed until you publish in the step below). If asked for scopes, add the read-only Gmail scope
              (<code className="bg-gray-100 px-1 rounded">gmail.readonly</code>).
            </li>
            <li>
              In <ExternalLink href={LINKS.credentials}>Credentials</ExternalLink>, choose <strong>Create credentials → OAuth client ID</strong>, type <strong>Web application</strong>.
              Under <strong>Authorized redirect URIs</strong> add exactly this address:
              {config && (
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 bg-gray-100 px-2 py-1 rounded break-all select-all">{config.redirectUri}</code>
                  <button
                    type="button"
                    onClick={copyRedirectUri}
                    className="bg-white border border-gray-300 px-3 py-1 rounded hover:bg-gray-100"
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              )}
            </li>
            <li>
              <strong>Recommended:</strong> on the consent screen’s <strong>Audience</strong> page, click <strong>Publish app</strong> to move it
              from “Testing” to “In production”. It is your own personal project, so Google does not review it, and it avoids
              the weekly sign-in described below. You will still see the “not verified” warning when you sign in.
            </li>
            <li>Copy the <strong>Client ID</strong> and <strong>Client secret</strong> Google shows you, and paste them below.</li>
          </ol>

          <div className="text-sm bg-yellow-50 border border-yellow-200 rounded p-3 space-y-1">
            <p><strong>Good to know</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>The first time you sign in, Google says the app is “not verified”. That is expected for your own project: choose <em>Advanced</em>, then continue to your app.</li>
              <li>Google’s rule: while a project is in “Testing”, its sign-in expires after 7 days, so you would have to sign in again every week. Publishing it (the recommended step above) avoids that. If you connected before publishing, click <em>Disconnect Gmail</em> and scan again so Google issues a fresh sign-in.</li>
              <li>You may also be asked to sign in again if you change your Google password, or if you don’t scan for about six months. Those are Google’s rules too.</li>
              <li>Google renames things in its console now and then, so the labels above may differ slightly.</li>
            </ul>
          </div>

          {config && config.source === 'env' && (
            <div className="text-sm bg-blue-50 border border-blue-200 rounded p-3">
              Credentials are currently coming from your <code>.env</code> file. Saving here overrides them.
            </div>
          )}

          <form onSubmit={saveAndTest} className="space-y-3">
            <div>
              <label htmlFor="gmail-client-id" className="block text-sm font-semibold mb-1">Client ID</label>
              <input
                id="gmail-client-id"
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="123456789-abc….apps.googleusercontent.com"
                autoComplete="off"
                spellCheck="false"
                required
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="gmail-client-secret" className="block text-sm font-semibold mb-1">Client secret</label>
              <input
                id="gmail-client-secret"
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={config && config.hasSecret ? '•••••••• saved. Leave blank to keep it' : 'GOCSPX-…'}
                autoComplete="off"
                spellCheck="false"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">Stored only in this app’s local database. It is never shown again.</p>
            </div>

            {error && (
              <div role="alert" className="p-3 bg-red-100 border border-red-400 text-red-700 rounded text-sm">{error}</div>
            )}
            {result && (
              <div
                role="status"
                className={`p-3 border rounded text-sm ${result.ok ? 'bg-green-50 border-green-300 text-green-800' : 'bg-red-100 border-red-400 text-red-700'}`}
              >
                {result.ok ? '✓ ' : ''}{result.message}
                {result.ok && ' Close this window and click “Scan Gmail” to sign in.'}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="submit"
                disabled={busy}
                className="bg-purple-600 text-white px-4 py-2 rounded font-semibold hover:bg-purple-700 disabled:bg-gray-400"
              >
                {busy ? 'Working…' : 'Save and test'}
              </button>
              {config && config.configured && (
                <button
                  type="button"
                  onClick={testOnly}
                  disabled={busy}
                  className="bg-white border border-gray-300 px-4 py-2 rounded hover:bg-gray-100 disabled:opacity-50"
                >
                  Test connection
                </button>
              )}
              {config && config.source === 'app' && (
                <button
                  type="button"
                  onClick={removeCredentials}
                  disabled={busy}
                  className="ml-auto text-sm text-red-700 underline hover:text-red-900 disabled:opacity-50"
                >
                  Remove saved credentials
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
