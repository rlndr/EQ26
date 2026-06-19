export interface Post {
  slug: string
  title: string
  date: string
  description: string
  content: string
}

function parseFrontmatter(raw: string): { data: Record<string, string>; content: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) return { data: {}, content: raw }
  const data: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':')
    if (colon > 0) {
      data[line.slice(0, colon).trim()] = line.slice(colon + 1).trim()
    }
  }
  return { data, content: match[2] }
}

const files = import.meta.glob('/src/content/blog/*.md', { eager: true, query: '?raw', import: 'default' })

export function getAllPosts(): Post[] {
  return Object.entries(files)
    .map(([path, raw]) => {
      const slug = path.split('/').pop()!.replace(/\.md$/, '')
      const { data, content } = parseFrontmatter(raw as string)
      return {
        slug,
        title: data.title ?? slug,
        date: data.date ?? '',
        description: data.description ?? '',
        content,
      }
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1))
}

export function getPostBySlug(slug: string): Post | undefined {
  return getAllPosts().find((p) => p.slug === slug)
}
