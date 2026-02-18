import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient";

/**
 * useNotificationsEngine — Rebuilt notification system
 *
 * Notification types: like, comment, follow, repost, mention
 * Realtime subscription for instant updates
 * Mark read (single / all)
 */

const NOTIF_SELECT = `
  *,
  actor:profiles!notifications_actor_id_fkey(id, identity, avatar_url, level, xp, verified),
  post:posts!notifications_post_id_fkey(id, content, type)
`;

export function useNotificationsEngine(userId) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    try {
      // Try with joins first, fallback to simple query
      let data = null;
      let error = null;

      try {
        const res = await supabase
          .from("notifications")
          .select(NOTIF_SELECT)
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50);
        data = res.data;
        error = res.error;
      } catch {
        // Fallback without joins
        const res = await supabase
          .from("notifications")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50);
        data = res.data;
        error = res.error;
      }

      if (error) throw error;
      setNotifications(data || []);
      setUnreadCount((data || []).filter((n) => !n.is_read).length);
    } catch (err) {
      console.error("[NotificationsEngine] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Realtime
  useEffect(() => {
    if (!userId) return;
    if (channelRef.current) supabase.removeChannel(channelRef.current);

    const channel = supabase
      .channel("notif-engine-rt")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      }, () => {
        fetchNotifications();
      })
      .subscribe();

    channelRef.current = channel;
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId, fetchNotifications]);

  const markRead = useCallback(async (notifId) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notifId ? { ...n, is_read: true } : n))
    );
    setUnreadCount((c) => Math.max(c - 1, 0));
    await supabase.from("notifications").update({ is_read: true }).eq("id", notifId);
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);
  }, [userId]);

  return {
    notifications,
    unreadCount,
    loading,
    markRead,
    markAllRead,
    refresh: fetchNotifications,
  };
}
