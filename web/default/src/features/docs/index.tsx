import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import axios from 'axios'
import { Check, Copy, X } from 'lucide-react'

import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { ShikiCodeBlock } from './shiki-code-block'

type DocItem = {
  slug: string
  title: string
}

/* ── Image Lightbox ── */
let activeLightbox: { src: string; alt: string } | null = null
let setLightbox: ((v: { src: string; alt: string } | null) => void) | null = null

function ImageLightbox() {
  const [image, setImage] = useState<{ src: string; alt: string } | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLightbox = setImage
    return () => { setLightbox = null }
  }, [])

  useEffect(() => {
    activeLightbox = image
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setImage(null)
    }
    if (image) {
      document.addEventListener('keydown', onKeyDown)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [image])

  if (!image) return null

  return (
    <div
      ref={overlayRef}
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-8'
      onClick={() => setImage(null)}
    >
      <button
        className='absolute top-4 right-4 p-2 rounded-full bg-background/20 hover:bg-background/40 text-white transition-colors'
        onClick={() => setImage(null)}
      >
        <X className='size-5' />
      </button>
      <img
        src={image.src}
        alt={image.alt}
        className='max-w-full max-h-full object-contain rounded-lg'
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}

function openLightbox(src: string, alt: string) {
  setLightbox?.({ src, alt })
}

/* ── Helpers ── */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fff\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function getHeadingId(children: React.ReactNode): string {
  if (typeof children === 'string') return slugify(children)
  if (Array.isArray(children)) {
    const text = children
      .map((c) => (typeof c === 'string' ? c : ''))
      .join('')
    return slugify(text)
  }
  return ''
}

type TocItem = {
  id: string
  text: string
  level: number
}

function parseHeadings(markdown: string): TocItem[] {
  const headingRegex = /^(#{1,4})\s+(.+)$/gm
  const items: TocItem[] = []
  let match
  while ((match = headingRegex.exec(markdown)) !== null) {
    const text = match[2].trim()
    const id = slugify(text)
    items.push({ id, text, level: match[1].length })
  }
  return items
}

/* ── Code Block Header ── */
const BlockCodeContext = createContext<{ code: string; lang: string } | null>(null)

function CodeBlockHeader({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
    }
  }

  return (
    <div className='flex items-center justify-between px-5 py-2 bg-[#21252B] rounded-t-lg border-b border-[#3E4452] text-xs font-mono text-[#ABB2BF]'>
      <span>{lang || 'text'}</span>
      <button
        onClick={handleCopy}
        className='flex items-center gap-1 hover:text-white transition-colors'
        title={copied ? 'Copied!' : 'Copy code'}
      >
        {copied ? <Check className='size-3.5' /> : <Copy className='size-3.5' />}
        <span>{copied ? '已复制' : '复制'}</span>
      </button>
    </div>
  )
}

/* ── Custom renderers with Tailwind classes ── */
function createMarkdownComponents(): Record<string, React.FC<any>> {
  return {
  h1: ({ children, ...props }) => (
    <h1 id={getHeadingId(children)} className='text-3xl font-bold mt-0 mb-4 pb-2 border-b scroll-mt-20' {...props}>{children}</h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 id={getHeadingId(children)} className='text-2xl font-semibold mt-10 mb-3 scroll-mt-20' {...props}>{children}</h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 id={getHeadingId(children)} className='text-xl font-semibold mt-7 mb-2 scroll-mt-20' {...props}>{children}</h3>
  ),
  h4: ({ children, ...props }) => (
    <h4 id={getHeadingId(children)} className='text-base font-semibold mt-5 mb-2 scroll-mt-20' {...props}>{children}</h4>
  ),
  p: ({ children, ...props }) => (
    <p className='mb-4 leading-relaxed' {...props}>{children}</p>
  ),
  a: ({ children, href, ...props }) => (
    <a href={href} className='text-primary underline underline-offset-2' target='_blank' rel='noopener noreferrer' {...props}>{children}</a>
  ),
  ul: ({ children, ...props }) => (
    <ul className='list-disc mb-4 pl-6' {...props}>{children}</ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className='list-decimal mb-4 pl-6' {...props}>{children}</ol>
  ),
  li: ({ children, ...props }) => (
    <li className='mb-1 pl-1' {...props}>{children}</li>
  ),
  code: function CodeRenderer({ className, children, ...props }: any) {
    const blockInfo = useContext(BlockCodeContext)
    const isInline = !blockInfo && !className

    if (isInline) {
      return (
        <code className='bg-muted px-1.5 py-0.5 rounded text-sm font-mono' {...props}>
          {children}
        </code>
      )
    }

    // Block code — use context if available, otherwise standalone
    const code = blockInfo?.code ?? String(children).trimEnd()
    const lang = blockInfo?.lang ?? className?.replace('language-', '') ?? ''

    return <ShikiCodeBlock code={code} lang={lang} inline />
  },
  pre: function PreRenderer({ children, ...props }: any) {
    // Extract code content from the child code element
    const codeChild = children?.props
    const rawCode = codeChild?.children
    const code = typeof rawCode === 'string' ? rawCode.trimEnd() : String(rawCode ?? '')
    const lang = codeChild?.className?.replace('language-', '') ?? ''

    return (
      <BlockCodeContext.Provider value={{ code, lang }}>
        <div className='mb-5'>
          <CodeBlockHeader lang={lang} code={code} />
          <pre className='bg-[#282C34] border border-[#3E4452] border-t-0 rounded-b-lg px-5 py-4 overflow-x-auto text-sm font-mono leading-relaxed text-[#ABB2BF] m-0' {...props}>
            {children}
          </pre>
        </div>
      </BlockCodeContext.Provider>
    )
  },
  table: ({ children, ...props }) => (
    <div className='overflow-x-auto mb-5'>
      <table className='w-full border-collapse border border-border rounded-lg overflow-hidden text-sm' {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead className='bg-muted' {...props}>{children}</thead>
  ),
  tbody: ({ children, ...props }) => (
    <tbody {...props}>{children}</tbody>
  ),
  tr: ({ children, ...props }) => (
    <tr className='border-b border-border last:border-b-0' {...props}>{children}</tr>
  ),
  th: ({ children, ...props }) => (
    <th className='border border-border px-4 py-2.5 text-left font-semibold text-xs' {...props}>{children}</th>
  ),
  td: ({ children, ...props }) => (
    <td className='border border-border px-4 py-2' {...props}>{children}</td>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote className='border-l-[3px] border-primary px-4 py-2 my-5 text-muted-foreground bg-muted/30 rounded-r' {...props}>
      {children}
    </blockquote>
  ),
  hr: (props) => (
    <hr className='border-0 border-t my-8' {...props} />
  ),
  strong: ({ children, ...props }) => (
    <strong className='font-semibold' {...props}>{children}</strong>
  ),
  em: ({ children, ...props }) => (
    <em className='italic' {...props}>{children}</em>
  ),
  img: ({ src, alt, ...props }) => (
    <img
      src={src}
      alt={alt}
      className='max-w-full rounded-lg border cursor-pointer hover:opacity-90 transition-opacity'
      onClick={() => openLightbox(src, alt || '')}
      {...props}
    />
  ),
  del: ({ children, ...props }) => (
    <del className='line-through opacity-60' {...props}>{children}</del>
  ),
  }
}

/* ── Fetch docs from API ── */
async function fetchDocsList(): Promise<DocItem[]> {
  const res = await axios.get('/api/docs')
  return res.data?.data ?? []
}

async function fetchDocContent(slug: string): Promise<string> {
  const res = await axios.get(`/api/docs/${slug}`)
  return res.data?.data ?? ''
}

/* ── Sidebar ── */
type DocSidebarProps = {
  docs: DocItem[]
  activeSlug?: string
  onSelect?: (slug: string) => void
}

function DocSidebar({ docs, activeSlug, onSelect }: DocSidebarProps) {
  const { t } = useTranslation()

  return (
    <nav className='w-64 shrink-0 border-r bg-card flex flex-col'>
      <div className='px-4 py-3 border-b shrink-0'>
        <h2 className='font-semibold text-sm'>{t('Docs')}</h2>
      </div>
      <ScrollArea className='flex-1'>
        <div className='p-2'>
          {docs.map((doc) => (
            <Link
              key={doc.slug}
              to='/documentation/$slug'
              params={{ slug: doc.slug }}
              onClick={() => onSelect?.(doc.slug)}
              className={cn(
                'block px-3 py-2 rounded-md text-sm transition-colors',
                'hover:bg-accent hover:text-accent-foreground',
                activeSlug === doc.slug
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground'
              )}
            >
              {doc.title}
            </Link>
          ))}
        </div>
      </ScrollArea>
    </nav>
  )
}

/* ── Right-side Floating TOC ── */
function TocSidebar({ markdown }: { markdown: string }) {
  const lastHeadingsRef = useRef<TocItem[]>([])
  const headings = useMemo(() => {
    const parsed = parseHeadings(markdown)
    if (parsed.length > 0) {
      lastHeadingsRef.current = parsed
      return parsed
    }
    return lastHeadingsRef.current
  }, [markdown])
  const [activeId, setActiveId] = useState<string>('')
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }

    if (headings.length === 0) {
      setActiveId('')
      return
    }

    const frameId = requestAnimationFrame(() => {
      const ids = headings.map((h) => h.id)
      const elements = ids
        .map((id) => document.getElementById(id))
        .filter(Boolean) as HTMLElement[]

      if (elements.length === 0) {
        setActiveId(ids[0])
        return
      }

      observerRef.current = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)

          if (visible.length > 0) {
            setActiveId(visible[0].target.id)
          }
        },
        {
          rootMargin: '-80px 0px -70% 0px',
          threshold: 0,
        }
      )

      elements.forEach((el) => observerRef.current?.observe(el))
    })

    return () => {
      cancelAnimationFrame(frameId)
      observerRef.current?.disconnect()
      observerRef.current = null
    }
  }, [headings])

  const handleClick = useCallback((id: string) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  if (headings.length === 0) return null

  return (
    <aside className='w-[15rem] shrink-0 hidden xl:block'>
      <div className='sticky top-[4rem] pt-6 pr-2'>
        <h4 className='text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-2'>
          目录
        </h4>
        <nav className='border-l-2 border-muted'>
          {headings.map((h) => (
            <button
              key={h.id}
              onClick={() => handleClick(h.id)}
              className={cn(
                'block w-full text-left text-sm py-1 transition-colors border-l-2 -ml-[2px]',
                h.level === 1 && 'pl-2',
                h.level === 2 && 'pl-4',
                h.level === 3 && 'pl-6',
                h.level === 4 && 'pl-8',
                activeId === h.id
                  ? 'border-primary text-foreground font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40'
              )}
            >
              <span className='truncate block'>{h.text}</span>
            </button>
          ))}
        </nav>
      </div>
    </aside>
  )
}

/* ── Document Index ── */
function DocIndex({ docs }: { docs: DocItem[] }) {
  const { t } = useTranslation()

  return (
    <div className='flex-1 px-8 py-6'>
      <h1 className='text-2xl font-bold mb-6'>{t('Docs')}</h1>
      <p className='text-muted-foreground mb-6'>
        {t('Welcome to the documentation. Select a topic from the sidebar to get started.')}
      </p>
      <div className='grid gap-3'>
        {docs.map((doc) => (
          <Link
            key={doc.slug}
            to='/documentation/$slug'
            params={{ slug: doc.slug }}
            className={cn(
              'block p-4 rounded-lg border bg-card',
              'hover:border-primary/50 hover:bg-accent/50 transition-colors'
            )}
          >
            <h3 className='font-medium'>{doc.title}</h3>
          </Link>
        ))}
      </div>
    </div>
  )
}

/* ── Pages ── */
export function DocsIndexPage() {
  const [docs, setDocs] = useState<DocItem[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    fetchDocsList().then((list) => {
      setDocs(list)
      if (list.length > 0) {
        navigate({
          to: '/documentation/$slug',
          params: { slug: list[0].slug },
          replace: true,
        })
      }
    })
  }, [navigate])

  if (docs.length > 0) return null

  return (
    <div className='flex h-full'>
      <DocSidebar docs={docs} />
      <DocIndex docs={docs} />
    </div>
  )
}

export function DocsPage() {
  const { slug } = useParams({ from: '/documentation/$slug' })
  const [docs, setDocs] = useState<DocItem[]>([])
  const [content, setContent] = useState<string | null>(null)
  const [activeSlug, setActiveSlug] = useState(slug)

  useEffect(() => {
    fetchDocsList().then(setDocs)
  }, [])

  useEffect(() => {
    if (slug) {
      setActiveSlug(slug)
      setContent(null)
      fetchDocContent(slug).then(setContent)
    }
  }, [slug])

  const setDoc = useCallback((s: string) => {
    setActiveSlug(s)
  }, [])

  return (
    <div className='flex h-full'>
      <DocSidebar docs={docs} activeSlug={activeSlug} onSelect={setDoc} />
      <div className='flex-1 min-w-0 flex'>
        <ScrollArea className='flex-1 h-full'>
          <div className='px-8 py-6'>
            {content !== null ? (
              content ? (
                <article className='text-foreground leading-relaxed text-[0.9375rem] max-w-[66%]'>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={createMarkdownComponents()}
                  >
                    {content}
                  </ReactMarkdown>
                </article>
              ) : (
                <div className='text-center text-muted-foreground py-20'>
                  Document not found.
                </div>
              )
            ) : (
              <div className='text-center text-muted-foreground py-20'>
                Loading...
              </div>
            )}
          </div>
        </ScrollArea>
        <TocSidebar markdown={content ?? ''} />
      </div>
      <ImageLightbox />
    </div>
  )
}
