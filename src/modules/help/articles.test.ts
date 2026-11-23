import { describe, expect, it } from 'vitest'
import { MODULES } from '@/core/modules'
import { ARTICLES, articleBySlug, searchArticles } from './articles'

describe('help centre', () => {
  it('has a guide for every module', () => {
    for (const manifest of MODULES) expect(articleBySlug(manifest.help), manifest.id).toBeDefined()
  })

  it('has unique slugs', () => {
    expect(new Set(ARTICLES.map((article) => article.slug)).size).toBe(ARTICLES.length)
  })

  it('ranks title matches first', () => {
    expect(searchArticles('pin')[0].slug).toBe('vault')
    expect(searchArticles('kanban columns')[0].slug).toBe('board')
    expect(searchArticles('zzzz')).toEqual([])
  })
})
