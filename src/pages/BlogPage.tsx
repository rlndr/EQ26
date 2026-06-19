import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { getAllPosts } from '../lib/blog'

const posts = getAllPosts()

export default function BlogPage() {
  const navigate = useNavigate()

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-zinc-100 mb-2">Blog</h1>
      <p className="text-zinc-400 mb-10">Thoughts and notes.</p>

      {posts.length === 0 ? (
        <p className="text-zinc-500">No posts yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {posts.map((post) => (
            <li key={post.slug}>
              <button
                onClick={() => navigate(`/blog/${post.slug}`)}
                className="w-full text-left p-5 rounded-xl border border-zinc-800 bg-zinc-900 hover:border-zinc-700 hover:bg-zinc-800/60 transition-colors group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-semibold text-zinc-100 text-base mb-1">{post.title}</h2>
                    {post.description && (
                      <p className="text-zinc-400 text-sm leading-relaxed">{post.description}</p>
                    )}
                  </div>
                  <ArrowRight size={16} className="text-zinc-600 group-hover:text-zinc-300 transition-colors mt-1 shrink-0" />
                </div>
                {post.date && (
                  <p className="text-xs text-zinc-600 mt-3">
                    {new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
