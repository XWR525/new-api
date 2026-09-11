import { Link, useNavigate, useParams } from '@tanstack/react-router'
import axios from 'axios'
import { Check, Copy, X } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

import { ShikiCodeBlock } from './shiki-code-block'

type DocItem = {
  slug: string
  title: string
}

/* ── Image Lightbox ── */
let setLightbox: ((v: { src: string; alt: string } | null) => void) | null =
  null

function ImageLightbox() {
  const [image, setImage] = useState<{ src: string; alt: string } | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLightbox = setImage
    return () => {
      setLightbox = null
    }
  }, [])

  useEffect(() => {
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
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8 backdrop-blur-sm'
      onClick={() => setImage(null)}
    >
      <button
        className='bg-background/20 hover:bg-background/40 absolute top-4 right-4 rounded-full p-2 text-white transition-colors'
        onClick={() => setImage(null)}
      >
        <X className='size-5' />
      </button>
      <img
        src={image.src}
        alt={image.alt}
        className='max-h-full max-w-full rounded-lg object-contain'
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
    const text = children.map((c) => (typeof c === 'string' ? c : '')).join('')
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
const BlockCodeContext = createContext<{ code: string; lang: string } | null>(
  null
)

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
    <div className='flex items-center justify-between rounded-t-lg border-b border-[#3E4452] bg-[#21252B] px-5 py-2 font-mono text-xs text-[#ABB2BF]'>
      <span>{lang || 'text'}</span>
      <button
        onClick={handleCopy}
        className='flex items-center gap-1 transition-colors hover:text-white'
        title={copied ? 'Copied!' : 'Copy code'}
      >
        {copied ? (
          <Check className='size-3.5' />
        ) : (
          <Copy className='size-3.5' />
        )}
        <span>{copied ? '已复制' : '复制'}</span>
      </button>
    </div>
  )
}

/* ── Custom renderers with Tailwind classes ── */
function createMarkdownComponents(): Record<string, React.FC<any>> {
  return {
    h1: ({ children, ...props }) => (
      <h1
        id={getHeadingId(children)}
        className='mt-0 mb-4 scroll-mt-20 border-b pb-2 text-3xl font-bold'
        {...props}
      >
        {children}
      </h1>
    ),
    h2: ({ children, ...props }) => (
      <h2
        id={getHeadingId(children)}
        className='mt-10 mb-3 scroll-mt-20 text-2xl font-semibold'
        {...props}
      >
        {children}
      </h2>
    ),
    h3: ({ children, ...props }) => (
      <h3
        id={getHeadingId(children)}
        className='mt-7 mb-2 scroll-mt-20 text-xl font-semibold'
        {...props}
      >
        {children}
      </h3>
    ),
    h4: ({ children, ...props }) => (
      <h4
        id={getHeadingId(children)}
        className='mt-5 mb-2 scroll-mt-20 text-base font-semibold'
        {...props}
      >
        {children}
      </h4>
    ),
    p: ({ children, ...props }) => (
      <p className='mb-4 leading-relaxed' {...props}>
        {children}
      </p>
    ),
    a: ({ children, href, ...props }) => (
      <a
        href={href}
        className='text-primary underline underline-offset-2'
        target='_blank'
        rel='noopener noreferrer'
        {...props}
      >
        {children}
      </a>
    ),
    ul: ({ children, ...props }) => (
      <ul className='mb-4 list-disc pl-6' {...props}>
        {children}
      </ul>
    ),
    ol: ({ children, ...props }) => (
      <ol className='mb-4 list-decimal pl-6' {...props}>
        {children}
      </ol>
    ),
    li: ({ children, ...props }) => (
      <li className='mb-1 pl-1' {...props}>
        {children}
      </li>
    ),
    code: function CodeRenderer({ className, children, ...props }: any) {
      const blockInfo = useContext(BlockCodeContext)
      const isInline = !blockInfo && !className

      if (isInline) {
        return (
          <code
            className='bg-muted rounded px-1.5 py-0.5 font-mono text-sm'
            {...props}
          >
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
      const code =
        typeof rawCode === 'string' ? rawCode.trimEnd() : String(rawCode ?? '')
      const lang = codeChild?.className?.replace('language-', '') ?? ''

      return (
        <BlockCodeContext.Provider value={{ code, lang }}>
          <div className='mb-5'>
            <CodeBlockHeader lang={lang} code={code} />
            <pre
              className='m-0 overflow-x-auto rounded-b-lg border border-t-0 border-[#3E4452] bg-[#282C34] px-5 py-4 font-mono text-sm leading-relaxed text-[#ABB2BF]'
              {...props}
            >
              {children}
            </pre>
          </div>
        </BlockCodeContext.Provider>
      )
    },
    table: ({ children, ...props }) => (
      <div className='mb-5 overflow-x-auto'>
        <table
          className='border-border w-full border-collapse overflow-hidden rounded-lg border text-sm'
          {...props}
        >
          {children}
        </table>
      </div>
    ),
    thead: ({ children, ...props }) => (
      <thead className='bg-muted' {...props}>
        {children}
      </thead>
    ),
    tbody: ({ children, ...props }) => <tbody {...props}>{children}</tbody>,
    tr: ({ children, ...props }) => (
      <tr className='border-border border-b last:border-b-0' {...props}>
        {children}
      </tr>
    ),
    th: ({ children, ...props }) => (
      <th
        className='border-border border px-4 py-2.5 text-left text-xs font-semibold'
        {...props}
      >
        {children}
      </th>
    ),
    td: ({ children, ...props }) => (
      <td className='border-border border px-4 py-2' {...props}>
        {children}
      </td>
    ),
    blockquote: ({ children, ...props }) => (
      <blockquote
        className='border-primary text-muted-foreground bg-muted/30 my-5 rounded-r border-l-[3px] px-4 py-2'
        {...props}
      >
        {children}
      </blockquote>
    ),
    hr: (props) => <hr className='my-8 border-0 border-t' {...props} />,
    strong: ({ children, ...props }) => (
      <strong className='font-semibold' {...props}>
        {children}
      </strong>
    ),
    em: ({ children, ...props }) => (
      <em className='italic' {...props}>
        {children}
      </em>
    ),
    img: ({ src, alt, ...props }) => (
      <img
        src={src}
        alt={alt}
        className='max-w-full cursor-pointer rounded-lg border transition-opacity hover:opacity-90'
        onClick={() => openLightbox(src, alt || '')}
        {...props}
      />
    ),
    del: ({ children, ...props }) => (
      <del className='line-through opacity-60' {...props}>
        {children}
      </del>
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
    <nav className='bg-card flex w-64 shrink-0 flex-col border-r'>
      <div className='shrink-0 border-b px-4 py-3'>
        <h2 className='text-sm font-semibold'>{t('Docs')}</h2>
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
    <aside className='hidden w-[15rem] shrink-0 xl:block'>
      <div className='sticky top-[4rem] pt-6 pr-2'>
        <h4 className='text-muted-foreground mb-3 px-2 text-xs font-semibold tracking-wider uppercase'>
          目录
        </h4>
        <nav className='border-muted border-l-2'>
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
              <span className='block truncate'>{h.text}</span>
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
      <h1 className='mb-6 text-2xl font-bold'>{t('Docs')}</h1>
      <p className='text-muted-foreground mb-6'>
        {t(
          'Welcome to the documentation. Select a topic from the sidebar to get started.'
        )}
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
      <div className='flex min-w-0 flex-1'>
        <ScrollArea className='h-full flex-1'>
          <div className='px-8 py-6'>
            {content !== null ? (
              content ? (
                <article className='text-foreground max-w-[66%] text-[0.9375rem] leading-relaxed'>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={createMarkdownComponents()}
                  >
                    {content}
                  </ReactMarkdown>
                </article>
              ) : (
                <div className='text-muted-foreground py-20 text-center'>
                  Document not found.
                </div>
              )
            ) : (
              <div className='text-muted-foreground py-20 text-center'>
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
