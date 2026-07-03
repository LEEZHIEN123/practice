import { isFavourite, toggleFavourite, type FavouriteItemInput } from "@/lib/favourites";
import { onAuthStateChanged } from "firebase/auth";
import { useCallback, useEffect, useState } from "react";
import { auth } from "../firebaseConfig";

export function useFavourite(item: FavouriteItemInput | null) {
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [favourited, setFavourited] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setUid(user?.uid ?? null));
    return unsub;
  }, []);

  const refresh = useCallback(async () => {
    if (!uid || !item?.id) {
      setFavourited(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setFavourited(await isFavourite(uid, item.id));
    } finally {
      setLoading(false);
    }
  }, [item?.id, uid]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggle = useCallback(async () => {
    if (!uid || !item) return false;
    const next = await toggleFavourite(uid, item);
    setFavourited(next);
    return next;
  }, [item, uid]);

  return { favourited, loading, toggle, refresh, signedIn: Boolean(uid) };
}
