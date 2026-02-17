import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "../supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * usePresence — Online presence via user_sessions table.
 *
 * - Creates unique session_id per tab
 * - Upserts session row on mount
 * - Heartbeats every 20 s
 * - Removes session on unmount / tab close
 * - Subscribes to realtime changes
 * - Counts DISTINCT users (last_seen within 60 s)
 *
 * Returns: { onlineCount: number, sessionId: string }
 */
export function usePresence(userId, profile) {
  const [onlineCount, setOnlineCount] = useState(0);
  const sessionIdRef = useRef(null);
  const heartbeatRef = useRef(null);
  const channelRef = useRef(null);

  // Generate unique session ID per tab (stored in ref)
  if (!sessionIdRef.current && userId) {
    sessionIdRef.current = `${userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /* ── Count online users (DISTINCT user_id, last_seen within 60 s) ── */
  const fetchOnlineCount = useCallback(async () => {
    try {
      const cutoff = new Date(Date.now() - 60_000).toISOString();
      
      // Use RPC to count distinct users
      const { data, error } = await supabase.rpc('count_online_users', {
        cutoff_time: cutoff
      });
      
      if (error) {
        // Fallback: manual count (less efficient but works)
        const { data: sessions } = await supabase
          .from("user_sessions")
          .select("user_id")
          .gte("last_seen", cutoff);
        
        const uniqueUsers = new Set(sessions?.map(s => s.user_id) || []);
        setOnlineCount(uniqueUsers.size);
      } else {
        setOnlineCount(data || 0);
      }
    } catch {
      /* silent */
    }
  }, []);

  /* ── Upsert session (with unique session_id per tab) ── */
  const upsertSession = useCallback(async () => {
    if (!userId || !sessionIdRef.current) return;
    try {
      const row = { 
        user_id: userId, 
        session_id: sessionIdRef.current,
        last_seen: new Date().toISOString(),
      };
      if (profile?.country_code) row.country_code = profile.country_code;
      if (profile?.country) row.country_name = profile.country;
      await supabase.from("user_sessions").upsert(row, { onConflict: "session_id" });
    } catch {
      /* silent */
    }
  }, [userId, profile?.country_code, profile?.country]);

  /* ── Remove session (by session_id, not user_id) ── */
  const removeSession = useCallback(async () => {
    if (!sessionIdRef.current) return;
    try {
      await supabase.from("user_sessions").delete().eq("session_id", sessionIdRef.current);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    if (!userId) return;

    // Initial upsert + count
    upsertSession().then(fetchOnlineCount);

    // Heartbeat every 20 s
    heartbeatRef.current = setInterval(() => {
      upsertSession();
    }, 20_000);

    // Subscribe to realtime changes on user_sessions
    channelRef.current = supabase
      .channel("presence-sessions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_sessions" },
        () => {
          fetchOnlineCount();
        }
      )
      .subscribe();

    // Cleanup on unmount / tab close
    const handleUnload = () => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return;
      
      const url = `${SUPABASE_URL}/rest/v1/user_sessions?session_id=eq.${sessionId}`;
      const headers = {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      };
      // sendBeacon can only POST, so we fall back to fetch keepalive
      try {
        fetch(url, {
          method: "DELETE",
          headers,
          keepalive: true,
        });
      } catch {
        /* best-effort */
      }
    };

    window.addEventListener("beforeunload", handleUnload);

    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      clearInterval(heartbeatRef.current);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
      removeSession();
    };
  }, [userId, upsertSession, removeSession, fetchOnlineCount]);

  return { onlineCount, sessionId: sessionIdRef.current };
}
