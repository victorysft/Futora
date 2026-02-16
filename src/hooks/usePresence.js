import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "../supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * usePresence — Online presence via user_sessions table.
 *
 * - Upserts a session row on mount
 * - Heartbeats every 20 s
 * - Removes session on unmount / tab close
 * - Subscribes to realtime changes on user_sessions
 *   and recalculates online count from DB
 *
 * Returns: { onlineCount: number }
 */
export function usePresence(userId) {
  const [onlineCount, setOnlineCount] = useState(0);
  const heartbeatRef = useRef(null);
  const channelRef = useRef(null);

  /* ── Count online users (last_seen within 30 s) ── */
  const fetchOnlineCount = useCallback(async () => {
    try {
      const cutoff = new Date(Date.now() - 30_000).toISOString();
      const { count } = await supabase
        .from("user_sessions")
        .select("id", { count: "exact", head: true })
        .gte("last_seen", cutoff);
      setOnlineCount(count ?? 0);
    } catch {
      /* silent */
    }
  }, []);

  /* ── Upsert session (insert or update last_seen) ── */
  const upsertSession = useCallback(async () => {
    if (!userId) return;
    try {
      await supabase.from("user_sessions").upsert(
        { user_id: userId, last_seen: new Date().toISOString() },
        { onConflict: "user_id" }
      );
    } catch {
      /* silent */
    }
  }, [userId]);

  /* ── Remove session ── */
  const removeSession = useCallback(async () => {
    if (!userId) return;
    try {
      await supabase.from("user_sessions").delete().eq("user_id", userId);
    } catch {
      /* silent */
    }
  }, [userId]);

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
      const url = `${SUPABASE_URL}/rest/v1/user_sessions?user_id=eq.${userId}`;
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

  return { onlineCount };
}
