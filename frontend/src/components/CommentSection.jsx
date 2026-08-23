import { useState, useEffect, useRef } from 'react'
import { messageApi } from '../services/api'
import { CommentItem } from './CommentItem'

export function CommentSection({ taskId, currentUserId }) {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(1)

  const loadComments = async (pageNum = 1, append = false) => {
    try {
      setLoading(true)
      const response = await messageApi.getTaskComments(taskId, { 
        page: pageNum, 
        limit: 50 
      })
      const newComments = response.data.items
      const pagination = response.data.pagination
      
      if (append) {
        setComments(prev => [...prev, ...newComments])
      } else {
        setComments(newComments)
      }
      setHasMore(pagination.hasMore)
      setPage(pageNum)
    } catch (err) {
      console.error('Failed to load comments:', err)
      setError('Failed to load comments')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadComments(1, false)
  }, [taskId])

  const loadMore = () => {
    if (!loading && hasMore) {
      loadComments(page + 1, true)
    }
  }

  const handleAddComment = async () => {
    if (!newComment.trim() || sending) return
    
    setSending(true)
    setError('')
    
    try {
      const response = await messageApi.addTaskComment(taskId, { content: newComment.trim() })
      setComments(prev => [...prev, response.data.item])
      setNewComment('')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add comment')
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAddComment()
    }
  }

  const handleEdit = async (comment) => {
    const newContent = prompt('Edit comment:', comment.content)
    if (newContent && newContent.trim() && newContent !== comment.content) {
      try {
        const response = await messageApi.updateMessage(comment.id, { content: newContent.trim() })
        setComments(prev => prev.map(c => c.id === comment.id ? response.data.item : c))
      } catch (err) {
        alert('Failed to update comment')
      }
    }
  }

  const handleDelete = async (comment) => {
    if (!confirm('Delete this comment?')) return
    
    try {
      await messageApi.deleteMessage(comment.id)
      setComments(prev => prev.filter(c => c.id !== comment.id))
    } catch (err) {
      alert('Failed to delete comment')
    }
  }

  if (loading && comments.length === 0) {
    return (
      <div className="py-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
      </div>
    )
  }

  return (
    <div className="bg-white shadow rounded-lg border">
      <div className="p-4 border-b bg-gray-50">
        <h3 className="text-lg font-semibold text-gray-900">Comments</h3>
      </div>
      
      <div className="max-h-96 overflow-y-auto p-4 space-y-4">
        {comments.length === 0 && !loading && (
          <div className="text-center text-gray-500 py-8">
            <p>No comments yet. Be the first to add one!</p>
          </div>
        )}
        
{comments.map(comment => (
            <CommentItem
              key={comment.id}
              comment={comment}
              currentUserId={comment.senderId}
              onEdit={handleEdit}
              onDelete={handleDelete}
              canEdit={comment.senderId === currentUserId}
              canDelete={comment.senderId === currentUserId}
            />
          ))}
          
          {hasMore && !loading && (
          <div className="text-center py-2">
            <button
              onClick={() => loadComments(page + 1, true)}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Load more comments
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 border-t border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}

      <div className="p-4 border-t bg-gray-50">
        <div className="flex gap-2">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleAddComment()
              }
            }}
            placeholder="Add a comment..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            rows={2}
          />
          <button
            onClick={handleAddComment}
            disabled={!newComment.trim() || sending}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? 'Posting...' : 'Comment'}
          </button>
        </div>
        {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
      </div>
    </div>
  )
}

export default CommentSection