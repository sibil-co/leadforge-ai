import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    const savedUser = localStorage.getItem('user')
    
    if (token && savedUser) {
      setUser(JSON.parse(savedUser))
    }
    setLoading(false)
  }, [])

  const login = async (email, password) => {
    // Mock login for demo - replace with actual API call
    const mockUser = {
      id: '1',
      email,
      name: email.split('@')[0],
      company: 'Demo Company'
    }
    const mockToken = 'mock-jwt-token-12345'
    
    localStorage.setItem('token', mockToken)
    localStorage.setItem('user', JSON.stringify(mockUser))
    setUser(mockUser)
    return mockUser
  }

  const register = async (data) => {
    const mockUser = {
      id: '1',
      email: data.email,
      name: data.name,
      company: data.company
    }
    const mockToken = 'mock-jwt-token-12345'
    
    localStorage.setItem('token', mockToken)
    localStorage.setItem('user', JSON.stringify(mockUser))
    setUser(mockUser)
    return mockUser
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
