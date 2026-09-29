"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import ResultCard from "@/components/ResultCard"
import CropModal from "@/components/CropModal"

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16)
  })
}

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
  originalFile: File
  originalUrl: string
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

type View = "token" | "upload" | "mapping" | "custom-mapping" | "preview" | "success"

const m = (n: number) => `mapping_${String(n).padStart(3, "0")}_new`

const PRESETS = [
  { key: "easy",   label: "Easy",    description: "Mappings 1–20",       color: "emerald", mappings: [2,4,6,8,10,12,14,16,18,20].map(m) },
  { key: "medium", label: "Medium",  description: "Mappings 20–40",      color: "amber",   mappings: [22,24,26,28,30,32,34,36,38,40].map(m) },
  { key: "hard",   label: "Hard",    description: "Mappings 40–60",      color: "red",     mappings: [42,44,46,48,50,52,54,56,58,60].map(m) },
  { key: "mix1",   label: "Mix 1",   description: "Spread across levels", color: "violet",  mappings: [2,8,14,20,26,32,38,44,50,56].map(m) },
  { key: "mix2",   label: "Mix 2",   description: "Spread across levels", color: "violet",  mappings: [4,10,16,22,28,34,40,46,52,58].map(m) },
  { key: "mix3",   label: "Mix 3",   description: "Spread across levels", color: "violet",  mappings: [6,12,18,24,30,36,42,48,54,60].map(m) },
  { key: "custom", label: "Custom",  description: "Pick per image",       color: "slate",   mappings: [] },
] as const

type PresetKey = typeof PRESETS[number]["key"]

const STEPS = [
  { n: 1, label: "Upload & crop", view: "upload" },
  { n: 2, label: "Mappings", view: "mapping" },
  { n: 3, label: "Preview & download", view: "preview" },
] as const

function StepIndicator({ current }: { current: View }) {
  const effectiveView = current === "custom-mapping" ? "mapping" : current
  const activeStep = STEPS.find((s) => s.view === effectiveView)?.n ?? 1
  return (
    <div className="flex items-center gap-2 text-sm">
      {STEPS.map(({ n, label }, i) => {
        const active = n === activeStep
        const done = n < activeStep
        return (
          <div key={n} className="flex items-center gap-2">
            {i > 0 && <span className="text-slate-300">→</span>}
            <div className={`flex items-center gap-1.5 ${active ? "text-blue-600 font-semibold" : done ? "text-slate-400" : "text-slate-300"}`}>
              <span className={`h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold ${
                active ? "bg-blue-600 text-white" : done ? "bg-slate-300 text-white" : "bg-slate-100 text-slate-400"
              }`}>
                {done ? "✓" : n}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function Home() {
  const [allMappings, setAllMappings] = useState<string[]>([])
  const [mappingSamples, setMappingSamples] = useState<Record<string, string>>({})
  const [images, setImages] = useState<ImageEntry[]>([])
  const [results, setResults] = useState<ResultEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [truncationWarning, setTruncationWarning] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [openMappingId, setOpenMappingId] = useState<string | null>(null)
  const [selectedPreset, setSelectedPreset] = useState<PresetKey | null>(null)
  const [reloadingIds, setReloadingIds] = useState<Record<string, boolean>>({})
  const [previewStatus, setPreviewStatus] = useState<Record<string, "loading" | "done" | "error">>({})
  const [cropImageId, setCropImageId] = useState<string | null>(null)
  const [view, setView] = useState<View>("token")
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
  const checkedIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (session) setView("upload")
  }, [])

  useEffect(() => {
    fetch("/api/mappings")
      .then((r) => r.json())
      .then((d) => setAllMappings(d.mappings))
      .catch(() => setError("Could not connect to API. Is the FastAPI server running?"))
    fetch("/api/mapping-samples")
      .then((r) => r.json())
      .then((d) => setMappingSamples(d.samples))
  }, [])

  useEffect(() => {
    if (allMappings.length === 0) return
    setImages((prev) =>
      prev.map((e) => (e.mapping === "" ? { ...e, mapping: allMappings[0] } : e))
    )
  }, [allMappings])

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
            `You selected ${imageFiles.length} images but only ${remaining} slot${remaining !== 1 ? "s" : ""} remain. Only the first ${remaining} were added.`
          )
        }
        const toAdd = imageFiles.slice(0, remaining).map((file) => {
          const url = URL.createObjectURL(file)
          return {
            id: uuid(),
            file,
            originalFile: file,
            originalUrl: url,
            previewUrl: url,
            mapping: allMappings[0] ?? "",
            isSquare: null,
          }
        })
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
    setSelectedPreset("custom")
    setImages((prev) => prev.map((e) => (e.id === id ? { ...e, mapping } : e)))
  }

  const changePreviewMapping = async (id: string, newMapping: string) => {
    const entry = images.find((e) => e.id === id)
    if (!entry) return
    setMapping(id, newMapping)
    setOpenMappingId(null)
    setReloadingIds((prev) => ({ ...prev, [id]: true }))
    try {
      const form = new FormData()
      form.append("image", entry.file)
      form.append("mappings", newMapping)
      const res = await fetch("/api/preview", { method: "POST", body: form })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setResults((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, mapping: newMapping, foldo: data.results[0]?.image ?? r.foldo } : r
        )
      )
    } catch {
      setError("Failed to reload preview for one image.")
    } finally {
      setReloadingIds((prev) => ({ ...prev, [id]: false }))
    }
  }

  const applyPreset = (key: typeof PRESETS[number]["key"]) => {
    setSelectedPreset(key)
    const preset = PRESETS.find((p) => p.key === key)
    if (!preset || preset.mappings.length === 0) return
    setImages((prev) =>
      prev.map((e, i) => ({ ...e, mapping: preset.mappings[i] ?? e.mapping }))
    )
  }

  const applyCrop = (id: string, blob: Blob) => {
    const entry = images.find((e) => e.id === id)
    if (!entry) return
    const croppedFile = new File([blob], entry.file.name, { type: "image/jpeg" })
    const croppedUrl = URL.createObjectURL(blob)
    setImages((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, file: croppedFile, previewUrl: croppedUrl, isSquare: true } : e
      )
    )
    setCropImageId(null)
  }

  const resetCrop = (id: string) => {
    setImages((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, file: e.originalFile, previewUrl: e.originalUrl, isSquare: null } : e
      )
    )
    checkedIds.current.delete(id)
  }

  const generate = async (imgs: typeof images = images) => {
    setLoading(true)
    setResults([])
    setError(null)
    setPreviewStatus(Object.fromEntries(imgs.map((e) => [e.id, "loading"])))

    const resultMap: Record<string, ResultEntry> = {}
    let anyError = false

    await Promise.all(
      imgs.map(async (entry) => {
        try {
          const form = new FormData()
          form.append("image", entry.file)
          form.append("mappings", entry.mapping)
          const res = await fetch("/api/preview", { method: "POST", body: form })
          if (!res.ok) throw new Error(await res.text())
          const data = await res.json()
          resultMap[entry.id] = {
            id: entry.id,
            fileName: entry.file.name,
            mapping: entry.mapping,
            original: data.original,
            foldo: data.results[0]?.image ?? "",
          }
          setPreviewStatus((prev) => ({ ...prev, [entry.id]: "done" }))
        } catch (e) {
          anyError = true
          setPreviewStatus((prev) => ({ ...prev, [entry.id]: "error" }))
          setError(e instanceof Error ? e.message : "An error occurred")
        }
      })
    )

    setLoading(false)
    if (!anyError) {
      setResults(imgs.map((e) => resultMap[e.id]))
      setView("preview")
    }
  }

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
      sessionStorage.removeItem("foldo_session")
      setSession(null)
      setView("success")
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Download failed")
    } finally {
      setDownloading(false)
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

  // ── Token ─────────────────────────────────────────────────────────────────
  if (view === "token") {
    return (
      <div className="min-h-screen bg-slate-50 font-sans flex items-center justify-center px-6">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-6">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Foldovation</h1>
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
                tokenLoading ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
              }`}
            >
              {tokenLoading ? "Verifying…" : "Continue"}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ── Success ───────────────────────────────────────────────────────────────
  if (view === "success") {
    return (
      <div className="min-h-screen bg-slate-50 font-sans flex items-center justify-center px-6">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-6 text-center">
          <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-3xl mx-auto">✓</div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Download complete!</h1>
            <p className="text-sm text-slate-500 mt-2">
              Thanks for using Foldovation! Your file{" "}
              <strong className="text-slate-700">foldo_images.pdf</strong> has been saved to your desktop.
            </p>
          </div>
          <p className="text-xs text-slate-400">Your access token has been used.</p>
        </div>
      </div>
    )
  }

  // ── Preview ───────────────────────────────────────────────────────────────
  if (view === "preview") {
    return (
      <div className="min-h-screen bg-slate-50 font-sans">
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200 px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => setView("mapping")}
            className="text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
          >
            ← Back
          </button>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">Foldovation</h1>
        </header>
        <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">
          <StepIndicator current="preview" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {results.map((r) => {
              const entry = images.find((e) => e.id === r.id)
              return (
                <div key={r.id} className="space-y-2">
                  <div className="relative">
                    {reloadingIds[r.id] && (
                      <div className="absolute inset-0 bg-white/70 rounded-2xl flex items-center justify-center z-10">
                        <span className="h-6 w-6 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                      </div>
                    )}
                    <ResultCard {...r} formatLabel={formatLabel} />
                  </div>

                  {/* Per-card mapping picker */}
                  <div className="relative flex items-center gap-2">
                    {entry?.isSquare === false && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 text-xs font-medium shrink-0">
                        ⚠ Not square
                      </span>
                    )}
                    <button
                      onClick={() => setOpenMappingId(openMappingId === r.id ? null : r.id)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                        openMappingId === r.id ? "border-blue-400 bg-blue-50 text-blue-600" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                      }`}
                    >
                      {entry && mappingSamples[entry.mapping] && (
                        <img src={mappingSamples[entry.mapping]} alt="" className="h-4 w-4 rounded object-cover" />
                      )}
                      {formatLabel(r.mapping)} · change
                    </button>

                    {openMappingId === r.id && (
                      <div className="absolute top-full left-0 mt-1 w-72 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-lg z-20">
                        <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
                          <span className="text-xs font-medium text-slate-600">Choose a mapping</span>
                          <button onClick={() => setOpenMappingId(null)} className="text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
                        </div>
                        {CATEGORIES.map((cat) => {
                          const catMappings = allMappings.filter((n) => getCategory(n) === cat)
                          if (catMappings.length === 0) return null
                          return (
                            <div key={cat}>
                              <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500 uppercase tracking-wide">{cat}</div>
                              <div className="p-2 grid grid-cols-6 gap-1.5">
                                {catMappings.map((name) => (
                                  <button
                                    key={name}
                                    onClick={() => changePreviewMapping(r.id, name)}
                                    className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                                      r.mapping === name ? "border-blue-500 shadow-sm scale-105" : "border-transparent hover:border-slate-300"
                                    }`}
                                    title={formatLabel(name)}
                                  >
                                    {mappingSamples[name] ? (
                                      <img src={mappingSamples[name]} alt={formatLabel(name)} className="w-full aspect-square object-cover" />
                                    ) : (
                                      <div className="w-full aspect-square bg-slate-100 animate-pulse" />
                                    )}
                                    <div className={`absolute bottom-0 inset-x-0 text-center py-0.5 font-medium ${
                                      r.mapping === name ? "bg-blue-500 text-white" : "bg-black/40 text-white"
                                    }`} style={{ fontSize: "7px", lineHeight: "11px" }}>
                                      {formatLabel(name)}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {(() => {
            const mappingCounts: Record<string, number> = {}
            results.forEach((r) => { mappingCounts[r.mapping] = (mappingCounts[r.mapping] ?? 0) + 1 })
            const duplicates = Object.entries(mappingCounts).filter(([, n]) => n >= 2)
            if (duplicates.length === 0) return null
            const labels = duplicates.map(([m, n]) => `${formatLabel(m)} (×${n})`).join(", ")
            return (
              <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <span className="mt-0.5 shrink-0 text-amber-500">⚠</span>
                <span>Some images share the same mapping: <strong>{labels}</strong>. We recommend using a different mapping for each image to ensure a unique challenge per image.</span>
              </div>
            )
          })()}
          <div className="flex gap-3">
            <button
              onClick={() => setView("mapping")}
              className="flex-1 py-3 px-6 rounded-xl font-semibold text-sm border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              ← Change mapping
            </button>
            <button
              onClick={downloadDocx}
              disabled={downloading}
              className={`flex-1 py-3 px-6 rounded-xl font-semibold text-sm transition-colors ${
                downloading ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer"
              }`}
            >
              {downloading ? "Creating PDF…" : "Download PDF"}
            </button>
          </div>
          {error && (
            <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>
          )}
        </main>
      </div>
    )
  }

  // ── Shared page shell for upload / crop / mapping ─────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        {(view === "mapping" || view === "custom-mapping") && (
          <button
            onClick={() => setView(view === "custom-mapping" ? "mapping" : "upload")}
            className="text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
          >
            ← Back
          </button>
        )}
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">Foldovation</h1>
      </header>

      {/* Mapping picker backdrop */}
      {openMappingId !== null && (
        <div className="fixed inset-0 z-10" onClick={() => setOpenMappingId(null)} />
      )}

      {/* Crop modal */}
      {cropImageId !== null && (() => {
        const entry = images.find((e) => e.id === cropImageId)
        if (!entry) return null
        return (
          <CropModal
            imageUrl={entry.previewUrl}
            fileName={entry.file.name}
            onConfirm={(blob) => applyCrop(cropImageId, blob)}
            onClose={() => setCropImageId(null)}
          />
        )
      })()}

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        <StepIndicator current={view} />

        {/* ── UPLOAD & CROP ── */}
        {view === "upload" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
            {error && (
              <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Images <span className="text-slate-400 font-normal">({images.length}/{MAX_IMAGES})</span>
              </label>
              {images.length < MAX_IMAGES && (
                <div
                  role="button"
                  tabIndex={0}
                  className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                    isDragging ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                  onClick={() => inputRef.current?.click()}
                  onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                >
                  <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 text-lg">↑</div>
                  <p className="text-sm text-slate-600">Drop images here or click to upload</p>
                  <p className="text-xs text-slate-400">Up to {MAX_IMAGES - images.length} more · use ✂ to crop each image</p>
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
              {truncationWarning && (
                <p className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  ⚠ {truncationWarning}
                </p>
              )}
            </div>

            {images.length > 0 && (
              <div className="space-y-2">
                {images.map((entry, i) => (
                  <div key={entry.id} className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3">
                    <span className="text-xs text-slate-400 w-5 shrink-0 text-right">{i + 1}</span>
                    <img src={entry.previewUrl} alt="" className="h-10 w-10 rounded-lg object-cover border border-slate-200 shrink-0" />
                    <p className="text-sm text-slate-700 truncate flex-1 min-w-0">{entry.file.name}</p>
                    {entry.isSquare === true && (
                      <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 shrink-0">square</span>
                    )}
                    {entry.isSquare === false && (
                      <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 shrink-0">not square</span>
                    )}
                    <button
                      onClick={() => setCropImageId(entry.id)}
                      title="Crop image"
                      className="text-slate-400 hover:text-blue-500 transition-colors shrink-0 text-base"
                    >
                      ✂
                    </button>
                    {entry.file !== entry.originalFile && (
                      <button
                        onClick={() => resetCrop(entry.id)}
                        title="Reset to original"
                        className="text-xs text-slate-400 hover:text-amber-500 transition-colors shrink-0"
                      >
                        ↺
                      </button>
                    )}
                    <button
                      onClick={() => removeImage(entry.id)}
                      aria-label="Remove"
                      className="text-slate-300 hover:text-slate-500 transition-colors shrink-0 text-xl leading-none"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setView("mapping")}
              disabled={images.length < MAX_IMAGES}
              className={`w-full py-3 px-6 rounded-xl font-semibold text-sm transition-colors ${
                images.length < MAX_IMAGES
                  ? "bg-green-900 text-green-100 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
              }`}
            >
              {images.length === 0
                ? `Upload ${MAX_IMAGES} images to start`
                : images.length < MAX_IMAGES
                ? `Add ${MAX_IMAGES - images.length} more image${MAX_IMAGES - images.length !== 1 ? "s" : ""} to continue`
                : "Continue to mappings →"}
            </button>
          </div>
        )}

        {/* ── MAPPING ── */}
        {view === "mapping" && (
          <div className="space-y-4">
            {/* Preset cards */}
            {(() => {
              const colors: Record<string, string> = {
                emerald: "border-emerald-300 bg-emerald-50 text-emerald-700",
                amber:   "border-amber-300 bg-amber-50 text-amber-700",
                red:     "border-red-300 bg-red-50 text-red-700",
                violet:  "border-violet-300 bg-violet-50 text-violet-700",
                slate:   "border-slate-300 bg-slate-50 text-slate-700",
              }
              const activeColors: Record<string, string> = {
                emerald: "border-emerald-500 bg-emerald-100 ring-2 ring-emerald-400",
                amber:   "border-amber-500 bg-amber-100 ring-2 ring-amber-400",
                red:     "border-red-500 bg-red-100 ring-2 ring-red-400",
                violet:  "border-violet-500 bg-violet-100 ring-2 ring-violet-400",
                slate:   "border-slate-500 bg-slate-100 ring-2 ring-slate-400",
              }
              const renderCard = (preset: typeof PRESETS[number]) => {
                const isActive = selectedPreset === preset.key
                const colorClass = isActive ? activeColors[preset.color] : colors[preset.color]
                return (
                  <button
                    key={preset.key}
                    onClick={() => {
                      if (preset.key === "custom") {
                        const defaultMapping = allMappings[0] ?? ""
                        const reset = images.map((e) => ({ ...e, mapping: defaultMapping }))
                        setImages(reset)
                        setSelectedPreset("custom")
                        generate(reset)
                      } else {
                        applyPreset(preset.key)
                      }
                    }}
                    className={`rounded-xl border-2 p-3 text-left transition-all cursor-pointer ${colorClass}`}
                  >
                    <div className="font-semibold text-sm">{preset.label}</div>
                    <div className="text-xs opacity-70 mt-0.5">{preset.description}</div>
                    {preset.mappings.length > 0 && (
                      <div className="flex gap-0.5 mt-2">
                        {preset.mappings.slice(0, 5).map((name) =>
                          mappingSamples[name] ? (
                            <img key={name} src={mappingSamples[name]} alt="" className="h-5 w-5 rounded object-cover" />
                          ) : (
                            <div key={name} className="h-5 w-5 rounded bg-white/50" />
                          )
                        )}
                      </div>
                    )}
                  </button>
                )
              }
              const easy   = PRESETS.find((p) => p.key === "easy")!
              const medium = PRESETS.find((p) => p.key === "medium")!
              const hard   = PRESETS.find((p) => p.key === "hard")!
              const mix1   = PRESETS.find((p) => p.key === "mix1")!
              const mix2   = PRESETS.find((p) => p.key === "mix2")!
              const mix3   = PRESETS.find((p) => p.key === "mix3")!
              const custom = PRESETS.find((p) => p.key === "custom")!
              return (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">{[easy, medium, hard].map(renderCard)}</div>
                  <div className="grid grid-cols-3 gap-3">{[mix1, mix2, mix3].map(renderCard)}</div>
                  <div className="grid grid-cols-3 gap-3">
                    <div />
                    {renderCard(custom)}
                    <div />
                  </div>
                </div>
              )
            })()}

            {selectedPreset && selectedPreset !== "custom" && (
              <button
                onClick={() => generate()}
                disabled={loading}
                className={`w-full py-3 px-6 rounded-xl font-semibold text-sm transition-colors ${
                  loading ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
                }`}
              >
                {loading ? "Generating…" : `Preview ${MAX_IMAGES} Foldo Images`}
              </button>
            )}
          </div>
        )}

        {/* ── CUSTOM MAPPING ── */}
        {view === "custom-mapping" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-2">
            {error && (
              <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>
            )}
            {images.map((entry, i) => (
              <div key={entry.id} className="space-y-1">
                <div className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-3">
                  <span className="text-xs text-slate-400 w-5 shrink-0 text-right">{i + 1}</span>
                  <img src={entry.previewUrl} alt="" className="h-10 w-10 rounded-lg object-cover border border-slate-200 shrink-0" />
                  <p className="text-sm text-slate-700 truncate flex-1 min-w-0">{entry.file.name}</p>
                  {previewStatus[entry.id] === "loading" && (
                    <span className="h-5 w-5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin shrink-0" />
                  )}
                  {previewStatus[entry.id] === "done" && (
                    <span className="text-emerald-500 font-bold shrink-0">✓</span>
                  )}
                  {previewStatus[entry.id] === "error" && (
                    <span className="text-red-400 font-bold shrink-0">✗</span>
                  )}
                  <div className="flex flex-col items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => setOpenMappingId(openMappingId === entry.id ? null : entry.id)}
                      className={`relative h-10 w-10 rounded-lg overflow-hidden border-2 transition-all ${
                        openMappingId === entry.id ? "border-blue-500 shadow-sm" : "border-slate-200 hover:border-slate-300"
                      }`}
                      title={formatLabel(entry.mapping)}
                    >
                      {mappingSamples[entry.mapping] ? (
                        <img src={mappingSamples[entry.mapping]} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-slate-100" />
                      )}
                    </button>
                    <span className="text-slate-400 w-10 text-center truncate" style={{ fontSize: "9px" }}>
                      {formatLabel(entry.mapping)}
                    </span>
                  </div>
                </div>

                {openMappingId === entry.id && (
                  <div className="ml-9 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm relative z-20">
                    <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
                      <span className="text-xs font-medium text-slate-600">Choose a mapping</span>
                      <button
                        onClick={() => setOpenMappingId(null)}
                        aria-label="Close picker"
                        className="text-slate-400 hover:text-slate-700 transition-colors text-xl leading-none"
                      >
                        ×
                      </button>
                    </div>
                    {CATEGORIES.map((cat) => {
                      const catMappings = allMappings.filter((n) => getCategory(n) === cat)
                      if (catMappings.length === 0) return null
                      return (
                        <div key={cat}>
                          <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500 uppercase tracking-wide">
                            {cat}
                          </div>
                          <div className="p-2 grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-1.5">
                            {catMappings.map((name) => (
                              <button
                                key={name}
                                onClick={() => { setMapping(entry.id, name); setOpenMappingId(null) }}
                                className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                                  entry.mapping === name ? "border-blue-500 shadow-sm scale-105" : "border-transparent hover:border-slate-300"
                                }`}
                                title={formatLabel(name)}
                              >
                                {mappingSamples[name] ? (
                                  <img src={mappingSamples[name]} alt={formatLabel(name)} className="w-full aspect-square object-cover" />
                                ) : (
                                  <div className="w-full aspect-square bg-slate-100 animate-pulse" />
                                )}
                                <div className={`absolute bottom-0 inset-x-0 text-center py-0.5 font-medium ${
                                  entry.mapping === name ? "bg-blue-500 text-white" : "bg-black/40 text-white"
                                }`} style={{ fontSize: "7px", lineHeight: "11px" }}>
                                  {formatLabel(name)}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}

            <button
              onClick={() => generate()}
              disabled={loading}
              className={`w-full py-3 px-6 rounded-xl font-semibold text-sm transition-colors ${
                loading ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
              }`}
            >
              {loading ? "Generating…" : `Preview ${MAX_IMAGES} Foldo Images`}
            </button>
          </div>
        )}

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
