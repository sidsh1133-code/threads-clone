export type Profile = {
  id: string;
  handle: string;
  display_name: string;
  bio?: string;
  avatar_url?: string | null;
  is_verified?: boolean;
  follower_count?: number;
  following_count?: number;
};

export type Post = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  like_count: number;
  reply_count: number;
  repost_count: number;
  quote_count: number;
  hide_like_count?: boolean;
  parent_id?: string | null;
  author: Profile;
  post_media?: { id: string; kind: string; url: string }[];
  liked?: boolean;
  reposted?: boolean;
};
