import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "../supabaseClient";

/**
 * useOnlineUsers — Fetches list of online users from user_sessions.
 *
 * Joins with profiles to get username, focus, level.
 *
 * Subscribes to INSERT/UPDATE/DELETE on user_sessions.
 *
 * Returns: { onlineUsers: Array<{ userId, username, focus, level }> }
 */
export function useOnlineUsers() {
  const [onlineUsers, setOnlineUsers] = useState([]);
  const channelRef = useRef(null);

  const fetchOnlineUsers = useCallback(async () => {
    try {
      const cutoff = new Date(Date.now() - 30_000).toISOString();

      // Get active sessions
      const { data: sessions } = await supabase
        .from("user_sessions")
        .select("user_id")
        .gte("last_seen", cutoff);

      if (!sessions || sessions.length === 0) {
        setOnlineUsers([]);
        return;
      }

      const userIds = sessions.map((s) => s.user_id);

      // Fetch profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, identity, becoming, level")
        .in("id", userIds);

      const users = (profiles || []).map((p) => ({
        userId: p.id,
        username: p.identity || p.becoming || "Anonymous",
        focus: p.becoming || "—",
        level: p.level || 0,
      }));

      setOnlineUsers(users);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    fetchOnlineUsers();

    channelRef.current = supabase
      .channel("online-users-sessions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_sessions" },
        () => {
          fetchOnlineUsers();
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [fetchOnlineUsers]);

  return { onlineUsers };
}
