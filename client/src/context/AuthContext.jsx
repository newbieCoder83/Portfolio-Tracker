import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);
const EMPTY_SYNC_STATUS = {
  syncing: false,
  syncType: null,
  syncStartedAt: null,
};

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [environment, setEnvironment] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [syncStatus, setSyncStatus] = useState(EMPTY_SYNC_STATUS);

  const fetchSyncStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/api/sync/status');
      setSyncStatus({
        syncing: Boolean(data.syncing),
        syncType: data.syncType || null,
        syncStartedAt: data.syncStartedAt || null,
      });
      setLastSync(data.lastSync || null);
      return data;
    } catch (err) {
      if (err.response?.status === 401) {
        setSyncStatus(EMPTY_SYNC_STATUS);
        return EMPTY_SYNC_STATUS;
      }
      throw err;
    }
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const { data } = await api.get('/api/auth/status');
      setIsAuthenticated(data.authenticated);
      setEnvironment(data.environment || null);
      setLastSync(data.lastSync || null);
      if (data.authenticated) {
        try {
          await fetchSyncStatus();
        } catch {
          setSyncStatus(EMPTY_SYNC_STATUS);
        }
      } else {
        setSyncStatus(EMPTY_SYNC_STATUS);
      }
    } catch {
      setIsAuthenticated(false);
      setSyncStatus(EMPTY_SYNC_STATUS);
    } finally {
      setLoading(false);
    }
  }, [fetchSyncStatus]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isAuthenticated || !syncStatus.syncing) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      fetchSyncStatus().catch(() => {});
    }, 2000);

    return () => clearInterval(intervalId);
  }, [fetchSyncStatus, isAuthenticated, syncStatus.syncing]);

  const login = async (apiKey, apiSecret, env) => {
    const { data } = await api.post('/api/auth/login', {
      apiKey,
      apiSecret,
      environment: env,
    });
    setIsAuthenticated(true);
    setEnvironment(env);
    setSyncStatus({
      syncing: Boolean(data.syncing),
      syncType: data.syncType || null,
      syncStartedAt: data.syncStartedAt || null,
    });
    return data;
  };

  const logout = async () => {
    await api.delete('/api/auth/logout');
    setIsAuthenticated(false);
    setEnvironment(null);
    setLastSync(null);
    setSyncStatus(EMPTY_SYNC_STATUS);
  };

  return (
    <AuthContext.Provider value={{
      isAuthenticated, loading, environment, lastSync,
      syncStatus, setSyncStatus, fetchSyncStatus,
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
