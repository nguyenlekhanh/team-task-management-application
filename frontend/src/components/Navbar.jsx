import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { NotificationBell } from './NotificationBell'

// Shared responsive navigation bar (8.1): replaces the nine hand-duplicated
// inline navs. Desktop (md+) keeps the exact previous layout; mobile (<md)
// collapses the link cluster into a hamburger dropdown so navigation actually
// fits small viewports. Page links/log-out placement are per-page props so
// every page preserves its current behavior.
export function Navbar({ title, backTo, links = [], onLogout }) {
  const { user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  // Close on Escape (keyboard) and outside click (NotificationDropdown pattern)
  useEffect(() => {
    if (!menuOpen) return undefined
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    const handleMouseDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [menuOpen])

  return (
    <nav className="bg-white shadow-sm border-b" ref={menuRef}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center min-w-0">
            {backTo ? (
              <div className="flex flex-col justify-center min-w-0 py-2">
                <Link
                  to={backTo.to}
                  className="text-sm text-blue-600 hover:text-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                >
                  {backTo.label}
                </Link>
                <h1 className="text-xl font-bold text-gray-900 truncate" title={title}>
                  {title}
                </h1>
              </div>
            ) : (
              <h1 className="text-xl font-bold text-gray-900 truncate min-w-0" title={title}>
                {title}
              </h1>
            )}
          </div>

          <div className="flex items-center space-x-4">
            <NotificationBell />
            {/* Desktop link cluster - identical to the previous inline navs */}
            <span className="hidden md:inline text-sm text-gray-700">
              Logged in as <strong>{user?.displayName || user?.username}</strong>
            </span>
            {links.map(link => (
              <Link
                key={link.to}
                to={link.to}
                className={`hidden md:inline-block px-4 py-2 rounded-md text-sm ${link.className || 'bg-gray-600 text-white hover:bg-gray-700'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
              >
                {link.label}
              </Link>
            ))}
            {onLogout && (
              <button
                onClick={onLogout}
                className="hidden md:inline-block px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Logout
              </button>
            )}
            {/* Mobile hamburger toggle */}
            <button
              type="button"
              onClick={() => setMenuOpen(prev => !prev)}
              aria-expanded={menuOpen}
              aria-controls="nav-menu"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              className="md:hidden p-2 rounded text-gray-600 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 min-h-[36px] min-w-[36px] flex items-center justify-center"
            >
              {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu panel */}
      {menuOpen && (
        <div id="nav-menu" className="md:hidden border-t border-gray-200 bg-white">
          <div className="max-w-7xl mx-auto px-4 py-2">
            <p className="px-2 py-1 text-sm text-gray-700">
              Logged in as <strong>{user?.displayName || user?.username}</strong>
            </p>
            {links.map(link => (
              <Link
                key={link.to}
                to={link.to}
                className={`block px-4 py-2 my-1 rounded-md text-sm ${link.className || 'bg-gray-600 text-white hover:bg-gray-700'} min-h-[44px] flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
              >
                {link.label}
              </Link>
            ))}
            {onLogout && (
              <button
                onClick={onLogout}
                className="block w-full text-left px-4 py-2 my-1 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Logout
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
