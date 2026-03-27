interface MonthSelectorProps {
  year: number
  month: number
  onChange: (year: number, month: number) => void
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function generateOptions() {
  const options: { year: number; month: number; label: string }[] = []
  const now = new Date()
  // Previous complete month = subtract 1 month from current
  let cursor = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1))

  for (let i = 0; i < 24; i++) {
    options.push({
      year: cursor.getUTCFullYear(),
      month: cursor.getUTCMonth() + 1,
      label: `${MONTH_NAMES[cursor.getUTCMonth()]} ${cursor.getUTCFullYear()}`,
    })
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - 1, 1))
  }
  return options
}

export function getDefaultMonth(): { year: number; month: number } {
  const now = new Date()
  const prev = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1))
  return { year: prev.getUTCFullYear(), month: prev.getUTCMonth() + 1 }
}

export default function MonthSelector({ year, month, onChange }: MonthSelectorProps) {
  const options = generateOptions()
  const value = `${year}-${String(month).padStart(2, '0')}`

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const [y, m] = e.target.value.split('-').map(Number)
    onChange(y, m)
  }

  return (
    <select
      value={value}
      onChange={handleChange}
      className="bg-zinc-800 border border-zinc-700 text-zinc-100 text-sm rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-zinc-500 cursor-pointer"
    >
      {options.map((opt) => {
        const v = `${opt.year}-${String(opt.month).padStart(2, '0')}`
        return (
          <option key={v} value={v}>
            {opt.label}
          </option>
        )
      })}
    </select>
  )
}
