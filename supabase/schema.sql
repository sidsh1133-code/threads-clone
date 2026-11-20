-- Threads clone database. Run once in Supabase SQL Editor on a fresh project.
create extension if not exists pg_trgm with schema extensions;

do $$ begin
  create type public.reply_permission as enum ('anyone', 'following', 'mentioned');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.media_kind as enum ('image', 'gif', 'audio');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.notification_type as enum ('follow', 'reply', 'mention', 'quote', 'repost', 'like');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9_.]{3,30}$'),
  display_name text not null default '' check (char_length(display_name) <= 50),
  bio text not null default '' check (char_length(bio) <= 150),
  link text,
  avatar_url text,
  is_verified boolean not null default false,
  follower_count integer not null default 0,
  following_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null default '' check (char_length(content) <= 500),
  parent_id uuid references public.posts(id) on delete cascade,
  root_id uuid references public.posts(id) on delete cascade,
  quote_of_id uuid references public.posts(id) on delete set null,
  reply_permission public.reply_permission not null default 'anyone',
  hide_like_count boolean not null default false,
  like_count integer not null default 0,
  reply_count integer not null default 0,
  repost_count integer not null default 0,
  quote_count integer not null default 0,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create table if not exists public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  kind public.media_kind not null,
  url text not null,
  position smallint not null default 0,
  width integer,
  height integer,
  duration_ms integer,
  created_at timestamptz not null default now()
);
create table if not exists public.polls (
  post_id uuid primary key references public.posts(id) on delete cascade,
  ends_at timestamptz not null
);
create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.polls(post_id) on delete cascade,
  label text not null check (char_length(label) between 1 and 25),
  position smallint not null default 0,
  vote_count integer not null default 0
);
create table if not exists public.poll_votes (
  post_id uuid not null references public.polls(post_id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  option_id uuid not null references public.poll_options(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create table if not exists public.post_hashtags (
  post_id uuid not null references public.posts(id) on delete cascade,
  tag text not null,
  primary key (post_id, tag)
);
create table if not exists public.post_mentions (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (post_id, user_id)
);
create table if not exists public.likes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create table if not exists public.reposts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create table if not exists public.bookmarks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create table if not exists public.mutes (
  muter_id uuid not null references public.profiles(id) on delete cascade,
  muted_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (muter_id, muted_id), check (muter_id <> muted_id)
);
create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id), check (blocker_id <> blocked_id)
);
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  type public.notification_type not null,
  post_id uuid references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists posts_author_created_idx on public.posts(author_id, created_at desc);
create index if not exists posts_parent_created_idx on public.posts(parent_id, created_at);
create index if not exists posts_top_created_idx on public.posts(created_at desc) where parent_id is null;
create index if not exists likes_post_idx on public.likes(post_id);
create index if not exists reposts_post_idx on public.reposts(post_id);
create index if not exists notifications_recipient_idx on public.notifications(recipient_id, created_at desc);
create index if not exists hashtags_tag_idx on public.post_hashtags(tag);

create or replace function public.has_block_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() in (a,b) and exists (
    select 1 from public.blocks x where (x.blocker_id=a and x.blocked_id=b) or (x.blocker_id=b and x.blocked_id=a)
  );
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare base_handle text; new_handle text; attempt integer := 0;
begin
  base_handle := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'handle', split_part(coalesce(new.email,''),'@',1), 'user'), '[^a-z0-9_.]', '', 'g'));
  if char_length(base_handle) < 3 then base_handle := 'user' || base_handle; end if;
  base_handle := left(base_handle, 24); new_handle := base_handle;
  while exists(select 1 from public.profiles where handle=new_handle) loop
    attempt := attempt + 1; new_handle := base_handle || (1000 + floor(random()*9000)::int)::text;
    if attempt > 10 then new_handle := 'user' || left(replace(new.id::text,'-',''),20); exit; end if;
  end loop;
  insert into public.profiles(id, handle, display_name, avatar_url)
  values(new.id, new_handle, left(coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', new_handle),50), coalesce(new.raw_user_meta_data->>'avatar_url',new.raw_user_meta_data->>'picture'));
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.set_post_root()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.parent_id is null then new.root_id := null;
  else select coalesce(root_id,id) into new.root_id from public.posts where id=new.parent_id;
       if new.root_id is null then raise exception 'Parent post not found'; end if;
  end if;
  return new;
end; $$;
drop trigger if exists posts_set_root on public.posts;
create trigger posts_set_root before insert on public.posts for each row execute function public.set_post_root();

create or replace function public.update_post_counts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name='likes' then
    if tg_op='INSERT' then update public.posts set like_count=like_count+1 where id=new.post_id;
    else update public.posts set like_count=greatest(0,like_count-1) where id=old.post_id; end if;
  elsif tg_table_name='reposts' then
    if tg_op='INSERT' then update public.posts set repost_count=repost_count+1 where id=new.post_id;
    else update public.posts set repost_count=greatest(0,repost_count-1) where id=old.post_id; end if;
  elsif tg_table_name='follows' then
    if tg_op='INSERT' then
      update public.profiles set following_count=following_count+1 where id=new.follower_id;
      update public.profiles set follower_count=follower_count+1 where id=new.following_id;
    else
      update public.profiles set following_count=greatest(0,following_count-1) where id=old.follower_id;
      update public.profiles set follower_count=greatest(0,follower_count-1) where id=old.following_id;
    end if;
  elsif tg_table_name='posts' then
    if tg_op='INSERT' and new.parent_id is not null then update public.posts set reply_count=reply_count+1 where id=new.parent_id;
    elsif tg_op='DELETE' and old.parent_id is not null then update public.posts set reply_count=greatest(0,reply_count-1) where id=old.parent_id;
    end if;
  end if;
  return null;
end; $$;

drop trigger if exists likes_count on public.likes;
create trigger likes_count after insert or delete on public.likes for each row execute function public.update_post_counts();
drop trigger if exists reposts_count on public.reposts;
create trigger reposts_count after insert or delete on public.reposts for each row execute function public.update_post_counts();
drop trigger if exists follows_count on public.follows;
create trigger follows_count after insert or delete on public.follows for each row execute function public.update_post_counts();
drop trigger if exists posts_reply_count on public.posts;
create trigger posts_reply_count after insert or delete on public.posts for each row execute function public.update_post_counts();

create or replace function public.feed_for_you(p_limit integer default 20, p_offset integer default 0)
returns table(post_id uuid, rank_score double precision) language sql stable as $$
  select p.id,
    (p.like_count + 2*p.reply_count + 3*p.repost_count + 1)::double precision /
    power(extract(epoch from (now()-p.created_at))/3600.0 + 2.0, 1.5) as score
  from public.posts p
  where p.parent_id is null and p.created_at > now()-interval '30 days'
    and not exists(select 1 from public.mutes m where m.muter_id=auth.uid() and m.muted_id=p.author_id)
  order by score desc, p.created_at desc limit greatest(p_limit,1) offset greatest(p_offset,0);
$$;
create or replace function public.feed_following(p_limit integer default 20, p_before timestamptz default now())
returns table(post_id uuid, sort_at timestamptz, reposted_by uuid) language sql stable as $$
  with followed as (
    select following_id as uid from public.follows where follower_id=auth.uid()
    union select auth.uid()
  ), items as (
    select p.id as pid,p.created_at as ts,null::uuid as rb from public.posts p
      where p.parent_id is null and p.author_id in(select uid from followed)
    union all
    select r.post_id,r.created_at,r.user_id from public.reposts r where r.user_id in(select uid from followed)
  )
  select i.pid,i.ts,i.rb from items i join public.posts p on p.id=i.pid
  where i.ts < p_before
    and not exists(select 1 from public.mutes m where m.muter_id=auth.uid() and m.muted_id=p.author_id)
  order by i.ts desc limit greatest(p_limit,1);
$$;
create or replace function public.trending_tags(p_limit integer default 10, p_hours integer default 48)
returns table(tag text, post_count bigint) language sql stable as $$
  select h.tag,count(*) from public.post_hashtags h join public.posts p on p.id=h.post_id
  where p.created_at > now()-make_interval(hours=>p_hours)
  group by h.tag order by count(*) desc,h.tag limit greatest(p_limit,1);
$$;

alter table public.profiles enable row level security;
alter table public.follows enable row level security;
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
alter table public.post_hashtags enable row level security;
alter table public.post_mentions enable row level security;
alter table public.likes enable row level security;
alter table public.reposts enable row level security;
alter table public.bookmarks enable row level security;
alter table public.mutes enable row level security;
alter table public.blocks enable row level security;
alter table public.notifications enable row level security;

-- Public profile discovery; users can edit only their own profile.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to anon, authenticated using(true);
drop policy if exists profiles_edit on public.profiles;
create policy profiles_edit on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());

-- Follows.
drop policy if exists follows_read on public.follows;
create policy follows_read on public.follows for select to authenticated using(true);
drop policy if exists follows_add on public.follows;
create policy follows_add on public.follows for insert to authenticated with check(follower_id=auth.uid() and not public.has_block_between(auth.uid(),following_id));
drop policy if exists follows_remove on public.follows;
create policy follows_remove on public.follows for delete to authenticated using(follower_id=auth.uid());

-- Posts are readable unless the viewer is blocked by or has blocked the author.
drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts for select to authenticated using(not public.has_block_between(auth.uid(),author_id));
drop policy if exists posts_add on public.posts;
create policy posts_add on public.posts for insert to authenticated with check(author_id=auth.uid());
drop policy if exists posts_edit on public.posts;
create policy posts_edit on public.posts for update to authenticated using(author_id=auth.uid()) with check(author_id=auth.uid());
drop policy if exists posts_remove on public.posts;
create policy posts_remove on public.posts for delete to authenticated using(author_id=auth.uid());

-- User interactions.
drop policy if exists likes_read on public.likes;
create policy likes_read on public.likes for select to authenticated using(true);
drop policy if exists likes_add on public.likes;
create policy likes_add on public.likes for insert to authenticated with check(user_id=auth.uid());
drop policy if exists likes_remove on public.likes;
create policy likes_remove on public.likes for delete to authenticated using(user_id=auth.uid());
drop policy if exists reposts_read on public.reposts;
create policy reposts_read on public.reposts for select to authenticated using(true);
drop policy if exists reposts_add on public.reposts;
create policy reposts_add on public.reposts for insert to authenticated with check(user_id=auth.uid());
drop policy if exists reposts_remove on public.reposts;
create policy reposts_remove on public.reposts for delete to authenticated using(user_id=auth.uid());
drop policy if exists bookmarks_read on public.bookmarks;
create policy bookmarks_read on public.bookmarks for select to authenticated using(user_id=auth.uid());
drop policy if exists bookmarks_add on public.bookmarks;
create policy bookmarks_add on public.bookmarks for insert to authenticated with check(user_id=auth.uid());
drop policy if exists bookmarks_remove on public.bookmarks;
create policy bookmarks_remove on public.bookmarks for delete to authenticated using(user_id=auth.uid());

-- Replies, media, polls and notification ownership.
drop policy if exists media_read on public.post_media;
create policy media_read on public.post_media for select to authenticated using(exists(select 1 from public.posts p where p.id=post_id));
drop policy if exists media_add on public.post_media;
create policy media_add on public.post_media for insert to authenticated with check(exists(select 1 from public.posts p where p.id=post_id and p.author_id=auth.uid()));
drop policy if exists polls_read on public.polls;
create policy polls_read on public.polls for select to authenticated using(true);
drop policy if exists polls_add on public.polls;
create policy polls_add on public.polls for insert to authenticated with check(exists(select 1 from public.posts p where p.id=post_id and p.author_id=auth.uid()));
drop policy if exists poll_options_read on public.poll_options;
create policy poll_options_read on public.poll_options for select to authenticated using(true);
drop policy if exists poll_options_add on public.poll_options;
create policy poll_options_add on public.poll_options for insert to authenticated with check(exists(select 1 from public.posts p where p.id=post_id and p.author_id=auth.uid()));
drop policy if exists poll_votes_read on public.poll_votes;
create policy poll_votes_read on public.poll_votes for select to authenticated using(user_id=auth.uid());
drop policy if exists poll_votes_add on public.poll_votes;
create policy poll_votes_add on public.poll_votes for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.polls pl where pl.post_id=post_id and pl.ends_at>now()));
drop policy if exists hashtags_read on public.post_hashtags;
create policy hashtags_read on public.post_hashtags for select to authenticated using(true);
drop policy if exists mentions_read on public.post_mentions;
create policy mentions_read on public.post_mentions for select to authenticated using(true);
drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications for select to authenticated using(recipient_id=auth.uid());
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated using(recipient_id=auth.uid()) with check(recipient_id=auth.uid());
drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications for delete to authenticated using(recipient_id=auth.uid());

-- Private mute/block lists.
drop policy if exists mutes_owner on public.mutes;
create policy mutes_owner on public.mutes for all to authenticated using(muter_id=auth.uid()) with check(muter_id=auth.uid());
drop policy if exists blocks_owner on public.blocks;
create policy blocks_owner on public.blocks for all to authenticated using(blocker_id=auth.uid()) with check(blocker_id=auth.uid());

-- Keep server-managed counters and verification flags out of direct client updates.
revoke update on public.profiles from authenticated;
grant update(handle,display_name,bio,link,avatar_url) on public.profiles to authenticated;
revoke update on public.posts from authenticated;
grant update(content,reply_permission,hide_like_count) on public.posts to authenticated;

-- Public media buckets. Upload object names as <auth-user-id>/<filename>.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
('avatars','avatars',true,5242880,array['image/jpeg','image/png','image/webp','image/gif']),
('post-media','post-media',true,26214400,array['image/jpeg','image/png','image/webp','image/gif','audio/webm','audio/mpeg','audio/mp4','audio/ogg','audio/wav'])
on conflict(id) do nothing;
drop policy if exists threads_media_public_read on storage.objects;
create policy threads_media_public_read on storage.objects for select using(bucket_id in ('avatars','post-media'));
drop policy if exists threads_media_owner_insert on storage.objects;
create policy threads_media_owner_insert on storage.objects for insert to authenticated with check(bucket_id in ('avatars','post-media') and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists threads_media_owner_update on storage.objects;
create policy threads_media_owner_update on storage.objects for update to authenticated using(bucket_id in ('avatars','post-media') and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists threads_media_owner_delete on storage.objects;
create policy threads_media_owner_delete on storage.objects for delete to authenticated using(bucket_id in ('avatars','post-media') and (storage.foldername(name))[1]=auth.uid()::text);
