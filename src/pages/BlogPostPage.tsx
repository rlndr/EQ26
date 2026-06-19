import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { marked } from 'marked'
import { getPostBySlug } from '../lib/blog'

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const post = getPostBySlug(slug ?? '')

  if (!post) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-zinc-400 mb-4">Post not found.</p>
        <button onClick={() => navigate('/blog')} className="text-rose-500 hover:text-rose-400 text-sm transition-colors">
          Back to blog
        </button>
      </div>
    )
  }

  const html = marked(post.content, { async: false })

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <button
        onClick={() => navigate('/blog')}
        className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-8"
      >
        <ArrowLeft size={14} />
        All posts
      </button>

      <header className="mb-8">
        <h1 className="text-3xl font-bold text-zinc-100 mb-2">{post.title}</h1>
        {post.date && (
          <p className="text-sm text-zinc-500">
            {new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        )}
      </header>

      <div
        className="prose prose-invert prose-zinc max-w-none"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
