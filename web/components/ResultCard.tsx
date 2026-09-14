type Props = {
  fileName: string
  mapping: string
  original: string
  foldo: string
  formatLabel: (name: string) => string
}

export default function ResultCard({ fileName, mapping, original, foldo, formatLabel }: Props) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-800 truncate">{fileName}</h3>
        <p className="text-xs text-slate-400 mt-0.5">{formatLabel(mapping)}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-slate-400 mb-1.5">Original</p>
          <img
            src={original}
            alt="Original"
            className="w-full aspect-square object-cover rounded-xl border border-slate-100"
          />
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-1.5">Foldo</p>
          <img
            src={foldo}
            alt="Foldo"
            className="w-full aspect-square object-cover rounded-xl border border-slate-100"
          />
        </div>
      </div>
    </div>
  )
}
