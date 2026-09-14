type Props = {
  name: string
  foldo: string
}

function formatName(name: string) {
  const match = name.match(/mapping_(\d+)/)
  return match ? `Mapping ${match[1]}` : name
}

export default function MappingCard({ name, foldo }: Props) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
        {formatName(name)}
      </h3>
      <img
        src={foldo}
        alt={`Foldo ${name}`}
        className="w-full aspect-square object-cover rounded-xl border border-slate-100"
      />
    </div>
  )
}
