import React, { createContext, useContext, useEffect, useState } from "react";

type AuthContextType = {
  user: any;
  isAuthenticated: boolean | undefined;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  register: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthContextProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    const t = setTimeout(() => {
      setIsAuthenticated(false); // simulate NOT logged in
    }, 4000);

    return () => clearTimeout(t);
  }, []);

  const login = async () => {};
  const logout = async () => {};
  const register = async () => {};

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthContextProvider");
  return value;
};
