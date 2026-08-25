import { Component } from 'react'

// Minimal root-level React error boundary (5E.2): a render exception must not
// blank the entire app. Safe recovery path = reload. Never exposes stack
// traces; does not intercept API/network errors (those are handled inline).
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error) {
    console.error('[UI] render error:', error?.message)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="bg-white shadow rounded-lg p-8 max-w-md w-full text-center">
            <h1 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h1>
            <p className="text-sm text-gray-600 mb-6">
              An unexpected error occurred while rendering the page.
            </p>
            <button
              onClick={this.handleReload}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Reload page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
