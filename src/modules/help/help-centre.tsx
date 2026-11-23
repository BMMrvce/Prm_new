'use client'

import { AlertTriangle, ArrowLeft, BookOpen, Lightbulb, Search } from 'lucide-react'
import Link from 'next/link'
import { useDeferredValue, useState } from 'react'
import { PageHeader } from '@/ui/misc'
import { ARTICLES, CATEGORIES, searchArticles, type Article, type Block } from './articles'

export function HelpCentre() {
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)
  const results = deferred.trim() ? searchArticles(deferred) : null

  return (
    <div className="max-w-6xl">
      <PageHeader title="Help centre" description="Guides for every part of ಸKala², in plain language." />
      <label className="neo-card mb-8 flex h-12 items-center gap-3 rounded-xl px-4 focus-within:ring-2 focus-within:ring-primary/25">
        <Search size={18} className="text-ink-3" aria-hidden />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search the help centre, e.g. “invite”, “PIN”, “board columns”"
          aria-label="Search the help centre"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3"
          autoFocus
        />
      </label>
      {results ? (
        <section aria-live="polite">
          <h2 className="mb-3 text-xs font-semibold text-ink-2">
            {results.length} result{results.length === 1 ? '' : 's'}
          </h2>
          {results.length ? (
            <ArticleList articles={results} />
          ) : (
            <p className="text-ui text-ink-2">No guide matches “{deferred}”. Try a different word, or browse the topics below.</p>
          )}
        </section>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {CATEGORIES.map((category) => (
            <section key={category} className="neo-card rounded-xl p-5">
              <h2 className="mb-3 text-card font-semibold">{category}</h2>
              <ArticleList articles={ARTICLES.filter((article) => article.category === category)} compact />
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function ArticleList({ articles, compact }: { articles: Article[]; compact?: boolean }) {
  return (
    <ul className={compact ? 'space-y-1' : 'space-y-2'}>
      {articles.map((article) => (
        <li key={article.slug}>
          <Link href={`/help/${article.slug}`} className="group flex gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2">
            <BookOpen size={15} className="mt-0.5 shrink-0 text-ink-3 group-hover:text-primary-ink" aria-hidden />
            <span>
              <span className="block text-ui font-medium text-ink group-hover:text-primary-ink">{article.title}</span>
              <span className="block text-xs text-ink-2">{article.summary}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function HelpArticle({ article }: { article: Article }) {
  const related = ARTICLES.filter((entry) => entry.category === article.category && entry.slug !== article.slug).slice(0, 4)
  return (
    <div className="max-w-3xl">
      <Link href="/help" className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-primary-ink">
        <ArrowLeft size={14} aria-hidden /> Help centre
      </Link>
      <article className="neo-card rounded-2xl p-6 sm:p-8">
        <p className="text-xs font-medium text-primary-ink">{article.category}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{article.title}</h1>
        <p className="mt-2 text-ui text-ink-2">{article.summary}</p>
        <div className="mt-6 space-y-4 text-sm leading-7 text-ink">
          {article.body.map((block, index) => (
            <BlockView key={index} block={block} />
          ))}
        </div>
      </article>
      {related.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-xs font-semibold text-ink-2">Related guides</h2>
          <ArticleList articles={related} compact />
        </section>
      )}
    </div>
  )
}

function BlockView({ block }: { block: Block }) {
  if ('p' in block) return <p>{block.p}</p>
  if ('h' in block) return <h2 className="pt-2 text-base font-semibold">{block.h}</h2>
  if ('list' in block)
    return (
      <ul className="list-disc space-y-1.5 pl-5">
        {block.list.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    )
  if ('steps' in block)
    return (
      <ol className="space-y-2">
        {block.steps.map((item, index) => (
          <li key={item} className="flex gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-light text-xs font-semibold text-primary-ink">{index + 1}</span>
            <span className="pt-0.5">{item}</span>
          </li>
        ))}
      </ol>
    )
  if ('tip' in block)
    return (
      <p className="flex gap-2.5 rounded-xl bg-accent-light px-4 py-3 text-ui text-accent-ink">
        <Lightbulb size={16} className="mt-0.5 shrink-0" aria-hidden /> {block.tip}
      </p>
    )
  if ('warn' in block)
    return (
      <p className="flex gap-2.5 rounded-xl bg-warning-light px-4 py-3 text-ui text-warning-ink" role="note">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /> {block.warn}
      </p>
    )
  return (
    <dl className="divide-y divide-line-soft">
      {block.qa.map(([question, answer]) => (
        <div key={question} className="py-3">
          <dt className="font-medium">{question}</dt>
          <dd className="mt-1 text-ui text-ink-2">{answer}</dd>
        </div>
      ))}
    </dl>
  )
}
