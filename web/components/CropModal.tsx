"use client"

import { useCallback, useState } from "react"
import Cropper, { Area } from "react-easy-crop"

async function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.addEventListener("load", () => resolve(img))
    img.addEventListener("error", reject)
    img.src = url
  })
}

async function getCroppedBlob(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = await createImage(imageSrc)
  const canvas = document.createElement("canvas")
  canvas.width = pixelCrop.width
  canvas.height = pixelCrop.height
  const ctx = canvas.getContext("2d")!
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  )
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.95))
}

type Props = {
  imageUrl: string
  fileName: string
  onConfirm: (blob: Blob) => void
  onClose: () => void
}

export default function CropModal({ imageUrl, fileName, onConfirm, onClose }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [square, setSquare] = useState(true)

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels)
  }, [])

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return
    const blob = await getCroppedBlob(imageUrl, croppedAreaPixels)
    onConfirm(blob)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md space-y-4 overflow-hidden">
        <div className="px-5 pt-5 flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Crop image</h2>
            <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{fileName}</p>
          </div>

          {/* Aspect ratio toggle */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium shrink-0">
            <button
              onClick={() => { setSquare(true); setCrop({ x: 0, y: 0 }); setZoom(1) }}
              className={`px-3 py-1.5 transition-colors cursor-pointer ${square ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}
            >
              1:1
            </button>
            <button
              onClick={() => { setSquare(false); setCrop({ x: 0, y: 0 }); setZoom(1) }}
              className={`px-3 py-1.5 transition-colors cursor-pointer ${!square ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}
            >
              Free
            </button>
          </div>
        </div>

        {/* Crop area */}
        <div className="relative h-72 bg-slate-900 mx-5 rounded-xl overflow-hidden">
          <Cropper
            key={square ? "square" : "free"}
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={square ? 1 : undefined}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        {/* Zoom slider */}
        <div className="px-5 flex items-center gap-3">
          <span className="text-xs text-slate-400 shrink-0">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-blue-600"
          />
        </div>

        {/* Buttons */}
        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Skip
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer"
          >
            Apply crop
          </button>
        </div>
      </div>
    </div>
  )
}
