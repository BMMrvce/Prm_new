import type { Metadata } from 'next'
import { HelpCentre } from '@/modules/help/help-centre'

export const metadata: Metadata = { title: 'Help centre' }

export default function HelpPage() {
  return <HelpCentre />
}
