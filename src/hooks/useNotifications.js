import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient";

/**
 * useNotifications — Real-time notification system
 *
 * Features:
 *  - Fetches unread + recent notifications
 *  - Realtime subscription for new notifications
 *  - Mark as read (single / all)
 *  - Unread count badge
 */

const NOTIF_SELECT = `
  *,
  actor:actor_id(id, identity, avatar_url, level, xp, verified),
  post:post_id(id, content, type)
`;

const NOTIF_ICONS = {
  like: "❤️",
  comment: "💬",
  repost: "🔁",
  follow: "👤",
  mention: "@",
  comment_like: "💜",
  achievement: "🏆",
  streak_milestone: "🔥",
  level_up: "⬆️",
};

const NOTIF_TEXT = {
  like: "liked your post",
  comment: "commented on your post",
  repost: "reposted your post",
  follow: "started following you",
  mention: "mentioned you",
  comment_like: "liked your comment",
  achievement: "You earned an achievement",
  streak_milestone: "Streak milestone reached",
  level_up: "You leveled up!",
};

export function useNotifications(userId) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef(null);

  // ── Fetch notifications ──
  const fetchNotifications = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    try {
      const { data, error } = await supabase
        .from("notifications")
        .select(NOTIF_SELECT)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setNotifications(data || []);
      setUnreadCount((data || []).filter((n) => !n.is_read).length);
    } catch (err) {
      console.error("[useNotifications] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // ── Initial fetch ──
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // ── Realtime subscription ──
  useEffect(() => {
    if (!userId) return;
    if (channelRef.current) supabase.removeChannel(channelRef.current);

    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          // Fetch the full notification with joins
          const { data } = await supabase
            .from("notifications")
            .select(NOTIF_SELECT)
            .eq("id", payload.new.id)
            .single();

          if (data) {
            setNotifications((prev) => [data, ...prev]);
            setUnreadCount((c) => c + 1);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId]);

  // ── Mark single as read ──
  const markRead = useCallback(async (notifId) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notifId ? { ...n, is_read: true } : n))
    );
    setUnreadCount((c) => Math.max(c - 1, 0));

    try {
      await supabase.from("notifications").update({ is_read: true }).eq("id", notifId);
    } catch (err) {
      console.error("[useNotifications] markRead error:", err);
    }
  }, []);

  // ── Mark all as read ──
  const markAllRead = useCallback(async () => {
    if (!userId) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);

    try {
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", userId)
        .eq("is_read", false);
    } catch (err) {
      console.error("[useNotifications] markAllRead error:", err);
    }
  }, [userId]);

  return {
    notifications,
    unreadCount,
    loading,
    markRead,
    markAllRead,
    refresh: fetchNotifications,
    NOTIF_ICONS,
    NOTIF_TEXT,
  };
}
