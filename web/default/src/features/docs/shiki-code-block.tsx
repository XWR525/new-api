import {
  type ComponentPropsWithoutRef,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { BundledLanguage, BundledTheme } from 'shiki'

// ─── singleton highlighter ───────────────────────────────────────
type Highlighter = Awaited<ReturnType<typeof import('shiki').createHighlighter>>

let highlighterPromise: Promise<Highlighter> | null = null

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki').then(({ createHighlighter }) =>
      createHighlighter({
        themes: ['github-dark'],
        langs: [
          'bash',
          'shell',
          'sh',
          'python',
          'javascript',
          'typescript',
          'tsx',
          'jsx',
          'java',
          'go',
          'rust',
          'c',
          'cpp',
          'csharp',
          'json',
          'yaml',
          'yml',
          'xml',
          'html',
          'css',
          'scss',
          'sql',
          'markdown',
          'md',
          'dockerfile',
          'toml',
          'ini',
          'plaintext',
          'text',
        ],
      })
    )
  }
  return highlighterPromise
}

// ─── component ───────────────────────────────────────────────────
type ShikiCodeBlockProps = {
  code: string
  lang?: string
  /** When true, strips the outer &lt;pre&gt; wrapper from shiki's output.
   *  Use this when the code block is already wrapped by a parent &lt;pre&gt;. */
  inline?: boolean
} & ComponentPropsWithoutRef<'span'>

const languageMap: Record<string, string> = {
  py: 'python',
  js: 'javascript',
  ts: 'typescript',
  rb: 'ruby',
  rs: 'rust',
  cs: 'csharp',
  kt: 'kotlin',
  yml: 'yaml',
  sh: 'bash',
  zsh: 'bash',
  ps1: 'powershell',
  markdown: 'md',
}

// shiki v4 的 BundledLanguage 不含纯文本语言，未声明语言时返回 null，
// 由调用方跳过高亮并直接渲染 <code>。
function resolveLang(raw?: string): BundledLanguage | null {
  if (!raw) return null
  const cleaned = raw.replace(/^language-/, '')
  return (languageMap[cleaned] ?? cleaned) as BundledLanguage
}

export function ShikiCodeBlock({
  code,
  lang: rawLang,
  inline = false,
  ...rest
}: ShikiCodeBlockProps) {
  const [html, setHtml] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    const resolvedLang = resolveLang(rawLang)
    // 未声明语言：不做高亮，直接使用下方的 <code> 兜底渲染
    if (!resolvedLang) {
      setHtml(null)
      return
    }
    const trimmedCode = code.trimEnd()

    getHighlighter().then((highlighter) => {
      if (!mountedRef.current) return
      try {
        let result = highlighter.codeToHtml(trimmedCode, {
          lang: resolvedLang,
          theme: 'github-dark' as BundledTheme,
        })
        // Strip outer <pre class="shiki">...</pre> when inline mode
        if (inline) {
          result = result
            .replace(/^<pre[^>]*>/i, '')
            .replace(/<\/pre>\s*$/i, '')
        }
        setHtml(result)
      } catch {
        setHtml(null)
      }
    })

    return () => {
      mountedRef.current = false
    }
  }, [code, rawLang, inline])

  if (!html) {
    return <code {...rest}>{code}</code>
  }

  return <span dangerouslySetInnerHTML={{ __html: html }} {...rest} />
}
