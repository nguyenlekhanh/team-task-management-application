import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { authApi } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('token')
      const storedUser = localStorage.getItem('user')

      if (token && storedUser) {
        try {
          setUser(JSON.parse(storedUser))
        } catch {
          localStorage.removeItem('token')
          localStorage.removeItem('user')
        }
      }
      setLoading(false)
    }
    initAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const response = await authApi.getMe()
      const userData = response.data.user
      setUser(userData)
      localStorage.setItem('user', JSON.stringify(userData))
      return userData
    } catch (err) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      setUser(null)
      throw err
    }
  }

  // Refresh token handling (9.1): the refresh token is transported ONLY via
  // the httpOnly cookie - the value returned in login/register/refresh
  // responses is kept in memory solely for an explicit logout-with-revoke and
  // is never persisted to localStorage.
  const refreshTokenRef = useRef(null)

  const register = async (data) => {
    setError(null)
    try {
      const response = await authApi.register(data)
      const { token, refreshToken, user: userData } = response.data
      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(userData))
      refreshTokenRef.current = refreshToken || null
      setUser(userData)
      return response.data
    } catch (err) {
      const message = err.response?.data?.error || 'Registration failed'
      setError(message)
      throw err
    }
  }

  const login = async (data) => {
    setError(null)
    try {
      const response = await authApi.login(data)
      const { token, refreshToken, user: userData } = response.data
      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(userData))
      refreshTokenRef.current = refreshToken || null
      setUser(userData)
      return response.data
    } catch (err) {
      const message = err.response?.data?.error || 'Login failed'
      setError(message)
      throw err
    }
  }

  const logout = async () => {
    try {
      // Send the in-memory refresh token so the server can revoke the
      // session family (httpOnly cookie rides along too as a fallback).
      await authApi.logout(refreshTokenRef.current ? { refreshToken: refreshTokenRef.current } : {})
    } catch {
      // ignore logout errors
    } finally {
      refreshTokenRef.current = null
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      setUser(null)
    }
  }

  const value = {
    user,
    loading,
    error,
    register,
    login,
    logout,
    checkAuth,
    isAuthenticated: !!user,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}