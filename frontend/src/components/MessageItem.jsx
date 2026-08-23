import { formatDistanceToNow } from 'date-fns'

export function MessageItem({ message, currentUserId, onEdit, onDelete, canEdit, canDelete }) {
  const isOwn = message.senderId === currentUserId
  const timestamp = formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`flex max-w-[70%] ${isOwn ? 'flex-row-reverse' : 'flex-row'} items-end gap-2`}>
        {!isOwn && (
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <span className="text-blue-600 font-medium text-sm">
              {message.sender?.username?.charAt(0).toUpperCase() || 'U'}
            </span>
          </div>
        )}
        <div className={`relative max-w-[85%] ${isOwn ? 'text-right' : 'text-left'}`}>
          <div className={`inline-block px-4 py-2 rounded-2xl ${
            isOwn ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-100 text-gray-900 rounded-bl-none'
          }`}>
            <div className="text-sm whitespace-pre-wrap">{message.content}</div>
            <div className={`flex items-center gap-2 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
              <span className={`text-xs ${message.senderId === 1 ? 'text-blue-300' : 'text-gray-400'}`}>
                {message.sender?.displayName || message.sender?.username}
              </span>
              <span className="text-xs text-gray-400">{formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}</span>
            </div>
          </div>
          
          {(canEdit || canDelete) && (
            <div className={`absolute ${isOwn ? 'right-0' : 'left-0'} bottom-full mb-1 hidden group-hover:block z-10`}>
              <div className="bg-white rounded-md shadow-lg border py-1 min-w-[120px]">
                {canEdit && (
                  <button
                    onClick={() => onEdit?.(message)}
                    className="block w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Edit
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={() => onDelete?.(message)}
                    className="block w-full px-3 py-2 text-sm text-red-600 hover:bg-gray-100"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        {isOwn && (
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <span className="text-blue-600 font-medium text-sm">
              {message.sender?.username?.charAt(0).toUpperCase() || 'U'}
            </span>
          </div>
        )}
      </div>
      {message.messageType === 'system' && (
        <div className={`text-center text-xs text-gray-500 my-2 ${message.isOwn ? 'text-right' : ''}`}>
          <em>{message.content}</em>
        </div>
      )}
    </div>
  )
}

export default MessageItem