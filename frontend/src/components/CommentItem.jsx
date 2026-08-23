import { formatDistanceToNow } from 'date-fns'

export function CommentItem({ comment, currentUserId, onEdit, onDelete, canEdit, canDelete }) {
  const isOwn = comment.senderId === currentUserId

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`flex max-w-[85%] ${isOwn ? 'flex-row-reverse' : 'flex-row'} items-start gap-2`}>
        {!isOwn && (
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-1">
            <span className="text-green-600 font-medium text-sm">
              {comment.sender?.username?.charAt(0).toUpperCase() || 'U'}
            </span>
          </div>
        )}
        <div className={`relative max-w-[85%] ${isOwn ? 'text-right' : 'text-left'}`}>
          <div className={`inline-block px-4 py-2 rounded-2xl ${
            isOwn ? 'bg-green-600 text-white rounded-br-none' : 'bg-gray-100 text-gray-900 rounded-bl-none'
          }`}>
            <div className="text-sm whitespace-pre-wrap">{comment.content}</div>
            <div className={`flex items-center gap-2 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
              <span className="text-xs text-gray-400">{formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}</span>
            </div>
          </div>
          
          {(comment.canEdit || comment.canDelete) && (
            <div className={`absolute ${isOwn ? 'right-0' : 'left-0'} bottom-full mb-1 hidden group-hover:block z-10`}>
              <div className="bg-white rounded-md shadow-lg border py-1 min-w-[120px]">
                {comment.canEdit && (
                  <button
                    onClick={() => comment.onEdit?.(comment)}
                    className="block w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Edit
                  </button>
                )}
                {comment.canDelete && (
                  <button
                    onClick={() => comment.onDelete?.(comment)}
                    className="block w-full px-3 py-2 text-sm text-red-600 hover:bg-gray-100"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-1">
          <span className="text-green-600 font-medium text-sm">
            {comment.sender?.username?.charAt(0).toUpperCase() || 'U'}
          </span>
        </div>
      </div>
    </div>
  )
}

export default CommentItem