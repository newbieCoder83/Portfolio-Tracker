import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [environment, setEnvironment] = useState(null);
  const [lastSync, setLastSync] = useState(null);

  const checkAuth = useCallback(async () => {
    try {
      const { data } = await api.get('/api/auth/status');
      setIsAuthenticated(data.authenticated);
      setEnvironment(data.environment || null);
      setLastSync(data.lastSync || null);
    } catch {
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (apiKey, apiSecret, env) => {
    const { data } = await api.post('/api/auth/login', {
      apiKey,
      apiSecret,
      environment: env,
    });
    setIsAuthenticated(true);
    setEnvironment(env);
    return data;
  };

  const logout = async () => {
    await api.delete('/api/auth/logout');
    setIsAuthenticated(false);
    setEnvironment(null);
    setLastSync(null);
  };

  return (
    <AuthContext.Provider value={{
      isAuthenticated, loading, environment, lastSync,
      setLastSync, login, logout, checkAuth,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
