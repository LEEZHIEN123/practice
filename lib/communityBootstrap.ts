import { auth } from "@/firebaseConfig";
import type { CommunityPost } from "@/lib/communityTypes";
import {
  ensureSupportChatWithAdmin,
  getCurrentUserProfile,
  getUserProfile,
  resolveAdminUid,
  subscribePosts,
} from "@/lib/communityService";
import type { Unsubscribe } from "firebase/firestore";

type PostsListener = (posts: CommunityPost[]) => void;

export type CommunityBootstrapSnapshot = {
  posts: CommunityPost[];
  adminUid: string | null;
  adminUidLoaded: boolean;
  adminProfileImage: string | null;
  myProfileImage: string | null;
  postsHydrated: boolean;
};

let cachedPosts: CommunityPost[] = [];
let cachedAdminUid: string | null | undefined;
let cachedAdminProfileImage: string | null = null;
let cachedMyProfileImage: string | null | undefined;
let postsHydrated = false;
let postsUnsub: Unsubscribe | null = null;
const postListeners = new Set<PostsListener>();
let prefetchInFlight: Promise<void> | null = null;

function notifyPosts(posts: CommunityPost[]) {
  cachedPosts = posts;
  postsHydrated = true;
  for (const listener of postListeners) listener(posts);
}

/** Show a newly created post immediately while Firestore syncs. */
export function prependCommunityPost(post: CommunityPost) {
  const merged = [post, ...cachedPosts.filter((item) => item.id !== post.id)].sort(
    (a, b) => b.createdAt - a.createdAt
  );
  notifyPosts(merged);
}

/** Patch a single post in the shared community feed cache. */
export function patchCommunityPost(post: CommunityPost) {
  const merged = cachedPosts.map((item) => (item.id === post.id ? post : item));
  notifyPosts(merged);
}

let postsErrorHandler: ((error: Error) => void) | undefined;

function ensurePostsListener() {
  if (postsUnsub) return;
  postsUnsub = subscribePosts(
    (posts) => notifyPosts(posts),
    (error) => postsErrorHandler?.(error)
  );
}

export function getCommunityBootstrapSnapshot(): CommunityBootstrapSnapshot {
  return {
    posts: cachedPosts,
    adminUid: cachedAdminUid ?? null,
    adminUidLoaded: cachedAdminUid !== undefined,
    adminProfileImage: cachedAdminProfileImage,
    myProfileImage: cachedMyProfileImage ?? null,
    postsHydrated,
  };
}

export function resetCommunityBootstrapCache() {
  cachedPosts = [];
  cachedAdminUid = undefined;
  cachedAdminProfileImage = null;
  cachedMyProfileImage = undefined;
  postsHydrated = false;
  if (postsUnsub) {
    postsUnsub();
    postsUnsub = null;
  }
  postListeners.clear();
  prefetchInFlight = null;
}

/** Shared posts listener — keeps feed warm across Discover → Community navigation. */
export function subscribeCommunityPosts(
  onData: PostsListener,
  onError?: (error: Error) => void
): Unsubscribe {
  postsErrorHandler = onError;
  ensurePostsListener();
  onData(cachedPosts);
  postListeners.add(onData);
  return () => {
    postListeners.delete(onData);
  };
}

export function prefetchCommunityScreen(): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return Promise.resolve();
  if (prefetchInFlight) return prefetchInFlight;

  prefetchInFlight = (async () => {
    ensurePostsListener();

    const jobs: Promise<void>[] = [];

    if (cachedAdminUid === undefined) {
      jobs.push(
        resolveAdminUid()
          .then(async (adminUid) => {
            cachedAdminUid = adminUid;
            if (!adminUid) {
              cachedAdminProfileImage = null;
              return;
            }
            try {
              const profile = await getUserProfile(adminUid);
              cachedAdminProfileImage = profile.profileImage;
            } catch {
              cachedAdminProfileImage = null;
            }
          })
          .catch(() => {
            cachedAdminUid = null;
            cachedAdminProfileImage = null;
          })
      );
    }

    if (cachedMyProfileImage === undefined) {
      jobs.push(
        getCurrentUserProfile()
          .then(({ profile }) => {
            cachedMyProfileImage = profile.profileImage;
          })
          .catch(() => {
            cachedMyProfileImage = null;
          })
      );
    }

    await Promise.all(jobs);
    void ensureSupportChatWithAdmin().catch(() => null);
  })().finally(() => {
    prefetchInFlight = null;
  });

  return prefetchInFlight;
}
