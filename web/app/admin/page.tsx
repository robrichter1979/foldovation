"use client"

import { useState } from "react"

type TokenRow = {
  id: number
  email: string
  token: string
  used: number
  created_at: string
  used_at: string | null
}

export default function AdminPage() {
  const [password, setPassword] = useState("")
  const [authed, setAuthed] = useState(false)
  const [authError, setAuthError] = useState("")

  const [email, setEmail] = useState("")
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState<{ token: string; email: string } | null>(null)
  const [genError, setGenError] = useState("")

  const [tokens, setTokens] = useState<TokenRow[]>([])
  const [loadingTokens, setLoadingTokens] = useState(false)

  const login = async () => {
    setAuthError("")
    setLoadingTokens(true)
    const res = await fetch(`/api/admin/tokens?password=${encodeURIComponent(password)}`)
    setLoadingTokens(false)
    if (!res.ok) { setAuthError("Wrong password."); return }
    const data = await res.json()
    setTokens(data.tokens)
    setAuthed(true)
  }

  const refreshTokens = async () => {
    setLoadingTokens(true)
    const res = await fetch(`/api/admin/tokens?password=${encodeURIComponent(password)}`)
    setLoadingTokens(false)
    if (res.ok) setTokens((await res.json()).tokens)
  }

  const generateToken = async () => {
    if (!email.trim()) return
    setGenerating(true)
    setGenError("")
    setGenerated(null)
    const res = await fetch("/api/admin/generate-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, email: email.trim() }),
    })
    setGenerating(false)
    if (!res.ok) { setGenError("Failed to generate token."); return }
    const data = await res.json()
    setGenerated(data)
    setEmail("")
    refreshTokens()
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 w-full max-w-sm space-y-4">
          <h1 className="text-lg font-semibold text-slate-900">Admin</h1>
          <input
            type="password"
            placeholder="Admin password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-400"
          />
          {authError && <p className="text-sm text-red-500">{authError}</p>}
          <button
            onClick={login}
            disabled={loadingTokens}
            className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors cursor-pointer"
          >
            {loadingTokens ? "Checking…" : "Sign in"}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">FoldMyPhoto Admin</h1>
        <button
          onClick={() => { setAuthed(false); setPassword("") }}
          className="text-sm text-slate-400 hover:text-slate-700"
        >
          Sign out
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">

        {/* Generate token */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Generate token</h2>
          <div className="flex gap-3">
            <input
              type="email"
              placeholder="buyer@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && generateToken()}
              className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-400"
            />
            <button
              onClick={generateToken}
              disabled={generating || !email.trim()}
              className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 transition-colors cursor-pointer"
            >
              {generating ? "Sending…" : "Generate & send"}
            </button>
          </div>

          {generated && (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <span className="font-bold text-emerald-500">✓</span>
              <span>Token <strong>{generated.token}</strong> sent to <strong>{generated.email}</strong></span>
            </div>
          )}
          {genError && (
            <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{genError}</p>
          )}
        </div>

        {/* Token list */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">All tokens</h2>
            <button onClick={refreshTokens} className="text-xs text-slate-400 hover:text-slate-700">↻ Refresh</button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2 text-left">#</th>
                <th className="px-4 py-2 text-left">Email</th>
                <th className="px-4 py-2 text-left">Token</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tokens.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-slate-400">{t.id}</td>
                  <td className="px-4 py-2.5 text-slate-700">{t.email}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{t.token}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      t.used ? "bg-slate-100 text-slate-500" : "bg-emerald-100 text-emerald-700"
                    }`}>
                      {t.used ? "used" : "available"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-400 text-xs">
                    {new Date(t.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
