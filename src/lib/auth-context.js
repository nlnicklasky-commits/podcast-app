import { createContext } from 'react'

export const AuthContext = createContext({ session: null, user: null, loading: true })
