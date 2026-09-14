"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import ResultCard from "@/components/ResultCard"

const MAX_IMAGES = 10

const CATEGORIES = ["Beginner", "Easy", "Intermediate", "Hard", "Expert"] as const

function getCategory(name: string): string {
  const match = name.match(/mapping_(\d+)/)
  if (!match) return "Expert"
  const num = parseInt(match[1])
  if (num <= 10) return "Beginner"
  if (num <= 20) return "Easy"
  if (num <= 30) return "Intermediate"
  if (num <= 40) return "Hard"
  return "Expert"
}

type ImageEntry = {
  id: string
  file: File
  previewUrl: string
  mapping: string
  isSquare: boolean | null
}

type ResultEntry = {
  id: string
  fileName: string
  mapping: string
  original: string
  foldo: string
}

export default function Home() {
  const [allMappings, setAllMappings] = useState<string[]>([])
  const [mappingSamples, setMappingSamples] = useState<Record<string, string>>({})
  const [samplesLoading, setSamplesLoading] = useState(false)
  const [images, setImages] = useState<ImageEntry[]>([])
  const [results, setResults] = useState<ResultEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [truncationWarning, setTruncationWarning] = useState<string | null>(null)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(["Beginner"]))
  const [downloading, setDownloading] = useState(false)
  const [view, setView] = useState<"token" | "upload" | "preview">("token")
  const [tokenInput, setTokenInput] = useState("")
  const [emailInput, setEmailInput] = useState("")
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [tokenLoading, setTokenLoading] = useState(false)
  const [session, setSession] = useState<{ email: string; token: string } | null>(() => {
    if (typeof window === "undefined") return null
    const stored = sessionStorage.getItem("foldo_session")
    return stored ? JSON.parse(stored) : null
  })
  const inputRef = useRef<HTMLInputElement>(null)

  // Skip token screen if already have a valid session
  useEffect(() => {
    if (session) setView("upload")
  }, [])
  const checkedIds = useRef<Set<string>>(new Set())

  const downloadDocx = async () => {
    setDownloading(true)
    setError(null)
    try {
      const form = new FormData()
      images.forEach((entry) => form.append("images", entry.file))
      form.append("mappings", images.map((e) => e.mapping).join(","))

      if (session) {
        form.append("email", session.email)
        form.append("token", session.token)
      }
      const res = await fetch("/api/generate-pdf", { method: "POST", body: form })
      if (!res.ok) throw new Error(await res.text())

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "foldo_images.pdf"
      a.click()
      URL.revokeObjectURL(url)
      // Token is now used — clear the session
      sessionStorage.removeItem("foldo_session")
      setSession(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Download failed")
    } finally {
      setDownloading(false)
    }
  }

  const toggleCategory = (cat: string) =>
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })

  useEffect(() => {
    fetch("/api/mappings")
      .then((r) => r.json())
      .then((d) => setAllMappings(d.mappings))
      .catch(() => setError("Could not connect to API. Is the FastAPI server running?"))

    setSamplesLoading(true)
    fetch("/api/mapping-samples")
      .then((r) => r.json())
      .then((d) => setMappingSamples(d.samples))
      .finally(() => setSamplesLoading(false))
  }, [])

  // Fill in mapping for entries added before mappings loaded
  useEffect(() => {
    if (allMappings.length === 0) return
    setImages((prev) =>
      prev.map((e) => (e.mapping === "" ? { ...e, mapping: allMappings[0] } : e))
    )
  }, [allMappings])

  // Check image dimensions asynchronously for new entries
  useEffect(() => {
    images.forEach((entry) => {
      if (entry.isSquare !== null || checkedIds.current.has(entry.id)) return
      checkedIds.current.add(entry.id)
      const img = new Image()
      img.onload = () => {
        const square = img.naturalWidth === img.naturalHeight
        setImages((prev) =>
          prev.map((e) => (e.id === entry.id ? { ...e, isSquare: square } : e))
        )
      }
      img.src = entry.previewUrl
    })
  }, [images])

  const addFiles = useCallback(
    (files: File[]) => {
      const imageFiles = files.filter((f) => f.type.startsWith("image/"))
      setTruncationWarning(null)
      setImages((prev) => {
        const remaining = MAX_IMAGES - prev.length
        if (imageFiles.length > remaining) {
          setTruncationWarning(
            `You selected ${imageFiles.length} images but only ${remaining} slot${remaining !== 1 ? "s" : ""} remain. Only the first ${remaining} image${remaining !== 1 ? "s" : ""} were added.`
          )
        }
        const toAdd = imageFiles.slice(0, remaining).map((file) => ({
          id: crypto.randomUUID(),
          file,
          previewUrl: URL.createObjectURL(file),
          mapping: allMappings[0] ?? "",
          isSquare: null,
        }))
        return [...prev, ...toAdd]
      })
      setResults([])
    },
    [allMappings]
  )

  const removeImage = (id: string) => {
    checkedIds.current.delete(id)
    setImages((prev) => prev.filter((e) => e.id !== id))
    setResults([])
  }

  const setMapping = (id: string, mapping: string) => {
    setImages((prev) => prev.map((e) => (e.id === id ? { ...e, mapping } : e)))
  }

  const generate = async () => {
    setLoading(true)
    setResults([])
    setError(null)
    try {
      const settled = await Promise.all(
        images.map(async (entry) => {
          const form = new FormData()
          form.append("image", entry.file)
          form.append("mappings", entry.mapping)
          const res = await fetch("/api/preview", { method: "POST", body: form })
          if (!res.ok) throw new Error(await res.text())
          const data = await res.json()
          return {
            id: entry.id,
            fileName: entry.file.name,
            mapping: entry.mapping,
            original: data.original,
            foldo: data.results[0]?.image ?? "",
          }
        })
      )
      setResults(settled)
      setView("preview")
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  const submitToken = async (e: React.FormEvent) => {
    e.preventDefault()
    setTokenLoading(true)
    setTokenError(null)
    try {
      const res = await fetch("/api/validate-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailInput.trim(), token: tokenInput.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setTokenError(data.detail ?? "Invalid or already used token.")
        return
      }
      const s = { email: emailInput.trim(), token: tokenInput.trim() }
      sessionStorage.setItem("foldo_session", JSON.stringify(s))
      setSession(s)
      setView("upload")
    } catch {
      setTokenError("Could not reach the server. Please try again.")
    } finally {
      setTokenLoading(false)
    }
  }

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = () => setIsDragging(false)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    addFiles([...e.dataTransfer.files])
  }

  const formatLabel = (name: string) => {
    const match = name.match(/mapping_(\d+)/)
    return match ? `Mapping ${match[1]}` : name
  }

  const canGenerate = !loading && images.length === MAX_IMAGES && images.every((e) => e.mapping)

  if (view === "token") {
    return (
      <div className="min-h-screen bg-slate-50 font-sans flex items-center justify-center px-6">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-6">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Foldology</h1>
            <p className="text-sm text-slate-500 mt-1">Enter your email and access token to continue.</p>
          </div>

          <form onSubmit={submitToken} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="you@example.com"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Access token</label>
              <input
                type="text"
                required
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="FOLDO-XXXXXXXXXXXX"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 bg-white text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            {tokenError && (
              <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                {tokenError}
              </p>
            )}

            <button
              type="submit"
              disabled={tokenLoading}
              className={`w-full py-3 rounded-xl font-semibold text-sm transition-colors ${
                tokenLoading
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
              }`}
            >
              {tokenLoading ? "Verifying…" : "Continue"}
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (view === "preview") {
    return (
      <div className="min-h-screen bg-slate-50 font-sans">
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200 px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => setView("upload")}
            className="text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-1"
          >
            ← Back
          </button>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">Foldology Preview</h1>
        </header>

        <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {results.map((r) => (
              <ResultCard key={r.id} {...r} formatLabel={formatLabel} />
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setView("upload")}
              className="flex-1 py-3 px-6 rounded-xl font-semibold text-sm border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              ← Change mapping
            </button>
            <button
              onClick={downloadDocx}
              disabled={downloading}
              className={`flex-1 py-3 px-6 rounded-xl font-semibold text-sm transition-colors ${
                downloading
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                  : "bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer"
              }`}
            >
              {downloading ? "Creating PDF…" : "Download PDF"}
            </button>
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {error}
            </p>
          )}
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200 px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">Foldology Preview</h1>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={generate}
              disabled={!canGenerate}
              className={`flex-1 py-3 px-6 rounded-xl font-semibold text-sm transition-colors ${
                loading
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                  : images.length < MAX_IMAGES
                  ? "bg-green-900 text-green-100 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
              }`}
            >
              {loading
                ? "Generating…"
                : images.length === MAX_IMAGES
                ? `Preview ${MAX_IMAGES} Foldo Images`
                : images.length === 0
                ? `Upload ${MAX_IMAGES} images to start`
                : `Add ${MAX_IMAGES - images.length} more image${MAX_IMAGES - images.length !== 1 ? "s" : ""} to continue`}
            </button>
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {error}
            </p>
          )}

          {/* Upload zone */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Images{" "}
              <span className="text-slate-400 font-normal">({images.length}/{MAX_IMAGES})</span>
            </label>
            {images.length < MAX_IMAGES && (
              <div
                role="button"
                tabIndex={0}
                className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                  isDragging
                    ? "border-blue-400 bg-blue-50"
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
                onClick={() => inputRef.current?.click()}
                onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
              >
                <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 text-lg">
                  ↑
                </div>
                <p className="text-sm text-slate-600">Drop images here or click to upload</p>
                <p className="text-xs text-slate-400">
                  Up to {MAX_IMAGES - images.length} more · Square images recommended
                </p>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && addFiles([...e.target.files])}
                />
              </div>
            )}

            {/* Truncation warning */}
            {truncationWarning && (
              <p className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                ⚠ {truncationWarning}
              </p>
            )}
          </div>

          {/* Image list */}
          {images.length > 0 && (
            <div className="space-y-2">
              {images.map((entry, i) => (
                <div key={entry.id} className="space-y-1">
                  <div className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3">
                    <span className="text-xs text-slate-400 w-5 shrink-0 text-right">{i + 1}</span>
                    <img
                      src={entry.previewUrl}
                      alt=""
                      className="h-10 w-10 rounded-lg object-cover border border-slate-200 shrink-0"
                    />
                    <p className="text-sm text-slate-700 truncate flex-1 min-w-0">{entry.file.name}</p>
                    <select
                      value={entry.mapping}
                      onChange={(e) => setMapping(entry.id, e.target.value)}
                      className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400 shrink-0"
                    >
                      {allMappings.map((m) => (
                        <option key={m} value={m}>{formatLabel(m)}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => removeImage(entry.id)}
                      aria-label="Remove"
                      className="text-slate-300 hover:text-slate-500 transition-colors shrink-0 text-xl leading-none"
                    >
                      ×
                    </button>
                  </div>

                  {/* Non-square warning */}
                  {entry.isSquare === false && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 ml-9">
                      ⚠ This image is not square and may appear stretched or squished. We recommend
                      cropping it first at{" "}
                      <a
                        href="https://squareanimage.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-amber-900"
                      >
                        squareanimage.com
                      </a>
                      .
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Mapping selection - shown after images are uploaded */}
          {images.length > 0 && allMappings.length > 0 && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                Mapping options{" "}
                <span className="text-slate-400 font-normal">— click a mapping to apply to all images</span>
              </label>
              {CATEGORIES.map((cat) => {
                const catMappings = allMappings.filter((n) => getCategory(n) === cat)
                if (catMappings.length === 0) return null
                const isOpen = expandedCategories.has(cat)
                return (
                  <div key={cat} className="border border-slate-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => toggleCategory(cat)}
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                    >
                      <span className="text-sm font-medium text-slate-700">{cat}</span>
                      <span className="flex items-center gap-2 text-xs text-slate-400">
                        {catMappings.length} mappings
                        <span className="text-slate-400">{isOpen ? "▲" : "▼"}</span>
                      </span>
                    </button>
                    {isOpen && (
                      <div className="p-3">
                        {samplesLoading ? (
                          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2">
                            {catMappings.map((name) => (
                              <div key={name} className="aspect-square bg-slate-100 rounded-xl animate-pulse" />
                            ))}
                          </div>
                        ) : (
                          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2">
                            {catMappings.map((name) => {
                              const allSelected = images.every((e) => e.mapping === name)
                              return (
                                <button
                                  key={name}
                                  onClick={() =>
                                    setImages((prev) => prev.map((e) => ({ ...e, mapping: name })))
                                  }
                                  className={`relative rounded-xl overflow-hidden border-2 transition-all ${
                                    allSelected
                                      ? "border-blue-500 shadow-md scale-105"
                                      : "border-transparent hover:border-slate-300"
                                  }`}
                                >
                                  {mappingSamples[name] ? (
                                    <img
                                      src={mappingSamples[name]}
                                      alt={formatLabel(name)}
                                      className="w-full aspect-square object-cover"
                                    />
                                  ) : (
                                    <div className="w-full aspect-square bg-slate-100" />
                                  )}
                                  <div className={`absolute bottom-0 inset-x-0 text-center text-xs py-0.5 font-medium ${
                                    allSelected ? "bg-blue-500 text-white" : "bg-black/40 text-white"
                                  }`}>
                                    {formatLabel(name)}
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {images.map((e) => (
              <div key={e.id} className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse">
                <div className="h-3 w-36 bg-slate-200 rounded mb-1" />
                <div className="h-2.5 w-20 bg-slate-100 rounded mb-4" />
                <div className="grid grid-cols-2 gap-3">
                  <div className="aspect-square bg-slate-100 rounded-xl" />
                  <div className="aspect-square bg-slate-100 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
