import { useState, useEffect, useRef } from 'react'
import { messageApi } from '../services/api'
import { MessageItem } from './MessageItem'

export function ChatPanel({ groupId, currentUserId, userRole }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [newMessage, setNewMessage] = useState('')
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(1)
  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)

  const canSend = true // All group members can send messages

  const loadMessages = async (pageNum = 1, append = false) => {
    try {
      setLoading(true)
      const response = await messageApi.getGroupMessages(groupId, { 
        page: pageNum, 
        limit: 50 
      })
      const newMessages = response.data.items
      const pagination = response.data.pagination
      
      if (append) {
        setMessages(prev => [...prev, ...newMessages])
      } else {
        setMessages(newMessages)
      }
      setHasMore(pagination.hasMore)
      setPage(pageNum)
    } catch (err) {
      console.error('Failed to load messages:', err)
      setError('Failed to load messages')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMessages(1, false)
  }, [groupId])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = async () => {
    if (!newMessage.trim() || sending) return
    
    setSending(true)
    setError('')
    
    try {
      const response = await messageApi.addGroupMessage(groupId, { content: newMessage.trim() })
      setMessages(prev => [...prev, response.data.item])
      setNewMessage('')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const loadMore = () => {
    if (!loading && hasMore) {
      loadMessages(page + 1, true)
    }
  }

  const handleEdit = async (message) => {
    const newContent = prompt('Edit message:', message.content)
    if (newContent && newContent.trim() && newContent !== message.content) {
      try {
        const response = await messageApi.updateMessage(message.id, { content: newContent.trim() })
        setMessages(prev => prev.map(m => m.id === message.id ? response.data.item : m))
      } catch (err) {
        alert('Failed to update message')
      }
    }
  }

  const handleDelete = async (message) => {
    if (!confirm('Delete this message?')) return
    
    try {
      await messageApi.deleteMessage(message.id)
      setMessages(prev => prev.filter(m => m.id !== message.id))
    } catch (err) {
      alert('Failed to delete message')
    }
  }

  if (loading && messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  const isOwner = userRole === 'owner'
  const isAdmin = userRole === 'admin'
  const canDeleteAny = isOwner || isAdmin

  return (
    <div className="flex flex-col h-full bg-white rounded-lg border">
      <div className="p-4 border-b bg-gray-50">
        <h3 className="text-lg font-semibold text-gray-900">Chat</h3>
      </div>
      
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
        onScroll={(e) => {
          const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
          if (scrollTop === 0 && hasMore && !loading) {
            loadMore()
          }
        }}
      >
        {messages.length === 0 && !loading && (
          <div className="text-center text-gray-500 py-12">
            <p>No messages yet. Be the first to send one!</p>
          </div>
        )}
        
        {messages.map(message => (
          <MessageItem
            key={message.id}
            message={message}
            currentUserId={message.senderId}
            onEdit={handleEdit}
            onDelete={handleDelete}
            canEdit={message.senderId === currentUserId}
            canDelete={message.senderId === currentUserId || canDeleteAny}
          />
        ))}
        
        {hasMore && !loading && (
          <div className="text-center py-2">
            <button
              onClick={loadMore}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Load more messages
            </button>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="p-4 bg-red-50 border-t border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}

      <div className="p-4 border-t bg-gray-50">
        <div className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSend}
            disabled={!newMessage.trim() || sending}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
        {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
      </div>
    </div>
  )
}

export default ChatPanel