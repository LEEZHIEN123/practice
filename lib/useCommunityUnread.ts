import { auth } from "@/firebaseConfig";
import { subscribeChats, subscribeNotifications } from "@/lib/communityService";
import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useState } from "react";

export function useCommunityUnread() {
  const [notificationCount, setNotificationCount] = useState(0);
  const [chatCount, setChatCount] = useState(0);
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => setUid(user?.uid ?? null));
    return unsubAuth;
  }, []);

  useEffect(() => {
    if (!uid) {
      setNotificationCount(0);
      setChatCount(0);
      return;
    }

    const unsubNotif = subscribeNotifications((items) => {
      setNotificationCount(items.filter((n) => !n.read).length);
    });

    const unsubChats = subscribeChats((chats) => {
      setChatCount(
        chats.reduce((sum, chat) => sum + (chat.unreadCount[uid] ?? 0), 0)
      );
    });

    return () => {
      unsubNotif();
      unsubChats();
    };
  }, [uid]);

  return {
    notificationCount,
    chatCount,
    totalUnread: notificationCount + chatCount,
  };
}
