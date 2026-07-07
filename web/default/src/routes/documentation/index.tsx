import { createFileRoute } from '@tanstack/react-router'

import { DocsIndexPage } from '@/features/docs'

export const Route = createFileRoute('/documentation/')({
  component: DocsIndexPage,
})
