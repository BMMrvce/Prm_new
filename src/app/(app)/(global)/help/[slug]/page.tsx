import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ARTICLES, articleBySlug } from '@/modules/help/articles'
import { HelpArticle } from '@/modules/help/help-centre'

export function generateStaticParams() {
  return ARTICLES.map((article) => ({ slug: article.slug }))
}

export async function generateMetadata({ params }: PageProps<'/help/[slug]'>): Promise<Metadata> {
  const article = articleBySlug((await params).slug)
  return { title: article ? `${article.title} · Help` : 'Help' }
}

export default async function HelpArticlePage({ params }: PageProps<'/help/[slug]'>) {
  const article = articleBySlug((await params).slug)
  if (!article) notFound()
  return <HelpArticle article={article} />
}
