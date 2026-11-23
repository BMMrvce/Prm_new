'use client'

import { Plus, Sparkles, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { COLOR_KEYS, COLORS, color } from '@/core/colors'
import type { ColorKey } from '@/core/types'
import { Button, IconButton } from '@/ui/button'
import { cn } from '@/ui/cn'
import { Input } from '@/ui/field'
import { Card } from '@/ui/misc'
import { SCOPE_LABELS, useCategories, useDeleteCategory, useSaveCategory, useSeedCategories, type Category, type CategoryScope } from './queries'

/** Edit one user-defined list (meeting types, expense categories, habit categories…). */
export function CategoryEditor({ workspaceId, scope, disabled }: { workspaceId: string; scope: CategoryScope; disabled?: boolean }) {
  const { data: categories = [] } = useCategories(workspaceId, scope)
  const save = useSaveCategory(workspaceId, scope)
  const remove = useDeleteCategory(workspaceId, scope)
  const seed = useSeedCategories(workspaceId, scope)
  const [name, setName] = useState('')
  const meta = SCOPE_LABELS[scope]

  const add = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    await save.mutateAsync({ name, color: COLOR_KEYS[(categories.length + 1) % COLOR_KEYS.length] })
    setName('')
  }

  return (
    <Card title={meta.title} actions={categories.length ? <span className="text-2xs text-ink-3 tabular-nums">{categories.length}</span> : undefined}>
      {categories.length > 0 ? (
        <ul className="-mx-2 mb-3 divide-y divide-line-soft">
          {categories.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              disabled={disabled}
              onSave={(changes) => save.mutate({ id: category.id, name: category.name, color: category.color, ...changes })}
              onDelete={() => remove.mutate(category.id)}
            />
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-xs text-ink-3">Nothing here yet. Add your own{disabled ? '' : ', or start from suggestions'}.</p>
      )}
      {!disabled && (
        <div className="flex flex-wrap items-center gap-2">
          <form onSubmit={add} className="flex min-w-0 flex-1 gap-2">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={`Add, e.g. ${meta.examples[0]}`} aria-label={`New ${meta.title.toLowerCase()}`} maxLength={60} className="h-8 min-w-0 flex-1" />
            <Button type="submit" size="sm" variant="secondary" disabled={!name.trim()} loading={save.isPending} icon={<Plus size={14} aria-hidden />}>
              Add
            </Button>
          </form>
          {!categories.length && (
            <Button size="sm" variant="ghost" loading={seed.isPending} icon={<Sparkles size={14} aria-hidden />} onClick={() => seed.mutate()}>
              Use suggestions
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}

/** One category: colour dot (click for swatches), name (click to rename), delete on hover. */
function CategoryRow({
  category,
  disabled,
  onSave,
  onDelete,
}: {
  category: Category
  disabled?: boolean
  onSave: (changes: { name?: string; color?: ColorKey }) => void
  onDelete: () => void
}) {
  const [picking, setPicking] = useState(false)
  const tone = color(category.color)
  return (
    <li className="group px-2 py-1.5">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setPicking((value) => !value)}
          aria-label={`Colour of ${category.name}: ${category.color}. Change colour`}
          aria-expanded={picking}
          className={cn('grid size-6 shrink-0 place-items-center rounded-md hover:bg-surface-2 disabled:cursor-default', picking && 'bg-surface-2')}
        >
          <span className={cn('size-3 rounded-full', tone.dot)} />
        </button>
        <input
          aria-label={`Name of ${category.name}`}
          defaultValue={category.name}
          disabled={disabled}
          maxLength={60}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') {
              event.currentTarget.value = category.name
              event.currentTarget.blur()
            }
          }}
          onBlur={(event) => {
            const value = event.target.value.trim()
            if (!value) event.target.value = category.name
            else if (value !== category.name) onSave({ name: value })
          }}
          className="h-7 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 text-ui text-ink outline-none hover:border-line focus:border-primary focus:bg-field focus:ring-2 focus:ring-primary/20 disabled:hover:border-transparent"
        />
        <span className={cn('hidden rounded-full px-2 text-2xs leading-5 sm:inline', tone.soft, tone.ink)}>{COLORS[category.color]?.label ?? category.color}</span>
        {!disabled && (
          <span className="opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
            <IconButton label={`Delete ${category.name}`} size="sm" variant="ghost" onClick={onDelete}>
              <Trash2 size={13} />
            </IconButton>
          </span>
        )}
      </div>
      {picking && !disabled && (
        <div className="mt-1.5 ml-8 flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Colour for ${category.name}`}>
          {COLOR_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={key === category.color}
              aria-label={COLORS[key].label}
              title={COLORS[key].label}
              onClick={() => {
                onSave({ color: key })
                setPicking(false)
              }}
              className={cn('grid size-6 place-items-center rounded-full ring-offset-2 ring-offset-surface hover:scale-110', key === category.color && cn('ring-2', COLORS[key].ring))}
            >
              <span className={cn('size-4 rounded-full', COLORS[key].dot)} />
            </button>
          ))}
        </div>
      )}
    </li>
  )
}
