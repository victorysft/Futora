import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!isMounted) return;
      if (error) {
        console.error("Failed to get auth session", error);
        setSession(null);
        setUser(null);
      } else {
        setSession(data.session);
        setUser(data.session?.user ?? null);
      }
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setAuthLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const fetchProfile = useCallback(async () => {
    if (!user) {
      return null;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("id, identity, xp, level, streak, last_check_in, created_at")
      .eq("id", user.id)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    if (!data) {
      return null;
    }

    return data;
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    async function syncProfile() {
      if (authLoading) {
        return;
      }

      if (!user) {
        if (!cancelled) {
          setProfile(null);
          setProfileLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setProfileLoading(true);
      }

      try {
        const data = await fetchProfile();
        if (!cancelled) {
          setProfile(data);
        }
      } catch (error) {
        console.error("Failed to load profile", error);
        if (!cancelled) {
          setProfile(null);
        }
      } finally {
        if (!cancelled) {
          setProfileLoading(false);
        }
      }
    }

    syncProfile();

    return () => {
      cancelled = true;
    };
  }, [authLoading, fetchProfile, user]);

  const refreshProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      return null;
    }

    try {
      const data = await fetchProfile();
      setProfile(data);
      return data;
    } catch (error) {
      console.error("Failed to refresh profile", error);
      throw error;
    }
  }, [fetchProfile, user]);

  const signIn = async ({ email, password }) => {
    return supabase.auth.signInWithPassword({ email, password });
  };

  const signUp = async ({ email, password }) => {
    return supabase.auth.signUp({ email, password });
  };

  const signOut = async () => {
    return supabase.auth.signOut();
  };

  const value = useMemo(
    () => ({
      session,
      user,
      profile,
      loading: authLoading || profileLoading,
      profileLoading,
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }),
    [session, user, profile, authLoading, profileLoading, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
