'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity, Bookmark, Check, Compass, Heart, Home, Image as ImageIcon,
  LogOut, MessageCircle, MoreHorizontal, Plus, Repeat2, Search,
  Settings2, Sparkles, UserRound, X
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import type { Post, Profile } from '@/lib/types';

const demoPosts: Post[] = [
  { id: 'demo-1', author_id: 'a1', content: 'The internet feels better when people are curious instead of trying to win every conversation.', created_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(), like_count: 248, reply_count: 19, repost_count: 32, quote_count: 4, author: { id: 'a1', handle: 'mira.builds', display_name: 'Mira Patel', avatar_url: 'https://i.pravatar.cc/120?img=47', is_verified: true } },
  { id: 'demo-2', author_id: 'a2', content: 'Small reminder: you are allowed to make something just because it is interesting. It does not need to become a side hustle.', created_at: new Date(Date.now() - 1000 * 60 * 54).toISOString(), like_count: 186, reply_count: 12, repost_count: 21, quote_count: 2, author: { id: 'a2', handle: 'arjunwrites', display_name: 'Arjun Rao', avatar_url: 'https://i.pravatar.cc/120?img=12' } },
  { id: 'demo-3', author_id: 'a3', content: 'What is one app you use every day that you think is genuinely well designed? Not the most popular one — the one that gets the details right.', created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), like_count: 94, reply_count: 37, repost_count: 8, quote_count: 1, author: { id: 'a3', handle: 'designnotes', display_name: 'Design Notes', avatar_url: 'https://i.pravatar.cc/120?img=32' } },
  { id: 'demo-4', author_id: 'a4', content: 'A good question is often more useful than a confident answer. Trying to ask better ones this week.', created_at: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(), like_count: 73, reply_count: 9, repost_count: 6, quote_count: 0, author: { id: 'a4', handle: 'neha.codes', display_name: 'Neha Kulkarni', avatar_url: 'https://i.pravatar.cc/120?img=44' } }
];

const suggestions = [
  { name: 'Kunal Shah', handle: 'kunal', avatar: 'https://i.pravatar.cc/100?img=11', note: 'Product & ideas' },
  { name: 'Aditi Singh', handle: 'aditi.designs', avatar: 'https://i.pravatar.cc/100?img=49', note: 'Design researcher' },
  { name: 'The Pragmatic Engineer', handle: 'pragmatic.engineer', avatar: 'https://i.pravatar.cc/100?img=13', note: 'Engineering notes' }
];

function timeAgo(date: string) {
  const mins = Math.max(1, Math.floor((Date.now() - new Date(date).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}
function compact(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n); }

export default function ThreadsApp() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>(demoPosts);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'for-you' | 'following'>('for-you');
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showComposer, setShowComposer] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const [liked, setLiked] = useState<string[]>([]);
  const [reposted, setReposted] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    const { data: auth } = await supabase.auth.getUser();
    const current = auth.user;
    setUser(current ? { id: current.id, email: current.email } : null);
    if (!current) { setLoading(false); return; }
    const [{ data: me }, feed] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', current.id).maybeSingle(),
      mode === 'for-you'
        ? supabase.rpc('feed_for_you', { p_limit: 30, p_offset: 0 })
        : supabase.rpc('feed_following', { p_limit: 30, p_before: new Date().toISOString() })
    ]);
    if (me) setProfile(me as Profile);
    if (!feed.error && feed.data) {
      const ids = feed.data.map((item: { post_id: string }) => item.post_id);
      if (ids.length) {
        const { data } = await supabase.from('posts').select('*, author:profiles!posts_author_id_fkey(*), post_media(*)').in('id', ids).order('created_at', { ascending: false });
        if (data) {
          const { data: myLikes } = await supabase.from('likes').select('post_id').eq('user_id', current.id).in('post_id', ids);
          const { data: myReposts } = await supabase.from('reposts').select('post_id').eq('user_id', current.id).in('post_id', ids);
          setLiked((myLikes || []).map(x => x.post_id));
          setReposted((myReposts || []).map(x => x.post_id));
          setPosts(data as Post[]);
        }
      } else setPosts([]);
    } else if (feed.error) toast.error(feed.error.message);
    setLoading(false);
  }, [supabase, mode]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!supabase) return;
    const { data: listener } = supabase.auth.onAuthStateChange(() => { void load(); });
    return () => listener.subscription.unsubscribe();
  }, [supabase, load]);

  async function publish(e: FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;
    if (!supabase || !user) return toast.error('Sign in to publish a post.');
    setPosting(true);
    const { error } = await supabase.from('posts').insert({ author_id: user.id, content });
    setPosting(false);
    if (error) return toast.error(error.message);
    setDraft(''); setShowComposer(false); toast.success('Posted.'); void load();
  }

  async function toggleLike(post: Post) {
    if (!supabase || !user) return toast.error('Sign in to like posts.');
    const active = liked.includes(post.id);
    setLiked(prev => active ? prev.filter(id => id !== post.id) : [...prev, post.id]);
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, like_count: Math.max(0, p.like_count + (active ? -1 : 1)) } : p));
    const result = active
      ? await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', user.id)
      : await supabase.from('likes').insert({ post_id: post.id, user_id: user.id });
    if (result.error) { toast.error(result.error.message); void load(); }
  }

  async function toggleRepost(post: Post) {
    if (!supabase || !user) return toast.error('Sign in to repost.');
    const active = reposted.includes(post.id);
    setReposted(prev => active ? prev.filter(id => id !== post.id) : [...prev, post.id]);
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, repost_count: Math.max(0, p.repost_count + (active ? -1 : 1)) } : p));
    const result = active
      ? await supabase.from('reposts').delete().eq('post_id', post.id).eq('user_id', user.id)
      : await supabase.from('reposts').insert({ post_id: post.id, user_id: user.id });
    if (result.error) { toast.error(result.error.message); void load(); }
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setUser(null); setProfile(null); setPosts(demoPosts); toast.success('Signed out.'); router.refresh();
  }

  const filteredPosts = posts.filter(p => !searchTerm || p.content.toLowerCase().includes(searchTerm.toLowerCase()) || p.author.handle.toLowerCase().includes(searchTerm.toLowerCase()));
  const isDemo = !supabase || !user;

  return <div className="app-shell">
    <Toaster position="top-center" richColors />
    <aside className="left-rail">
      <Link href="/" className="brand-mark" aria-label="Threads home">@</Link>
      <nav className="primary-nav" aria-label="Main navigation">
        <button className="nav-item active" aria-label="Home"><Home /><span>Home</span></button>
        <button className="nav-item" onClick={() => document.getElementById('feed-search')?.focus()}><Search /><span>Search</span></button>
        <button className="nav-item" onClick={() => toast('Your activity will appear here.')}><Activity /><span>Activity</span></button>
        <button className="nav-item" onClick={() => user ? toast('Profile page is next on the build list.') : router.push('/auth')}><UserRound /><span>Profile</span></button>
      </nav>
      <div className="rail-bottom">
        <button className="nav-item" onClick={() => toast('Settings are coming next.')}><Settings2 /><span>Settings</span></button>
        <button className="avatar-button" onClick={() => user ? void signOut() : router.push('/auth')} title={user ? 'Sign out' : 'Sign in'}>
          {profile?.avatar_url ? <img src={profile.avatar_url} alt="Your avatar" /> : <span>{profile?.display_name?.[0] || 'S'}</span>}
        </button>
      </div>
    </aside>

    <header className="mobile-header"><Link href="/" className="brand-mark">@</Link><span>threads</span><button onClick={() => user ? void signOut() : router.push('/auth')}>{user ? <LogOut size={19} /> : <UserRound size={19} />}</button></header>

    <main className="feed-column">
      <div className="feed-heading"><h1>Home</h1><button className="icon-button" onClick={() => void load()} aria-label="Refresh feed"><Sparkles size={19} /></button></div>
      {isDemo && <div className="demo-banner"><span className="demo-dot" /> Preview mode <span>Connect Supabase and sign in to use the live feed.</span><Link href="/auth">Sign in</Link></div>}
      <div className="feed-tabs"><button className={mode === 'for-you' ? 'selected' : ''} onClick={() => setMode('for-you')}>For you</button><button className={mode === 'following' ? 'selected' : ''} onClick={() => setMode('following')}>Following</button></div>

      <form className="composer" onSubmit={publish}>
        <div className="composer-avatar">{profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : <span>{profile?.display_name?.[0] || 'S'}</span>}</div>
        <div className="composer-main"><textarea aria-label="Write a post" maxLength={500} value={draft} onChange={e => setDraft(e.target.value)} placeholder="What's happening?" rows={2} /><div className="composer-actions"><span className="composer-hint">{draft.length}/500</span><div><button type="button" className="icon-button attach-button" onClick={() => toast('Media uploads are the next integration step.')} aria-label="Add media"><ImageIcon size={19} /></button><button className="primary-button" disabled={!draft.trim() || posting}>{posting ? 'Posting…' : 'Post'}</button></div></div></div>
      </form>

      <div className="feed-list" aria-live="polite">
        {loading ? <div className="loading-state">Loading conversations…</div> : filteredPosts.length === 0 ? <div className="empty-state"><div className="empty-icon"><MessageCircle /></div><h2>No conversations yet</h2><p>Follow a few people or start the first conversation.</p><button className="primary-button" onClick={() => setShowComposer(true)}>Write a post</button></div> : filteredPosts.map(post => <article className="post" key={post.id}>
          <div className="post-avatar">{post.author.avatar_url ? <img src={post.author.avatar_url} alt={`${post.author.display_name} avatar`} /> : <span>{post.author.display_name?.[0] || '?'}</span>}</div>
          <div className="post-body">
            <div className="post-topline"><div className="post-author"><strong>{post.author.display_name || post.author.handle}</strong>{post.author.is_verified && <span className="verified"><Check size={10} /></span>}<span className="handle">@{post.author.handle}</span><span className="post-time">{timeAgo(post.created_at)}</span></div><button className="icon-button more-button" aria-label="More post options" onClick={() => toast('More post actions are coming soon.')}><MoreHorizontal size={19} /></button></div>
            <p className="post-copy">{post.content}</p>
            {post.post_media?.map(media => media.kind === 'image' || media.kind === 'gif' ? <img className="post-media" src={media.url} alt="Post attachment" key={media.id} /> : null)}
            <div className="post-actions">
              <button className={liked.includes(post.id) ? 'action liked' : 'action'} onClick={() => void toggleLike(post)} aria-label="Like post"><Heart size={18} fill={liked.includes(post.id) ? 'currentColor' : 'none'} /><span>{compact(post.like_count)}</span></button>
              <button className="action" onClick={() => toast('Reply composer is coming next.')} aria-label="Reply"><MessageCircle size={18} /><span>{compact(post.reply_count)}</span></button>
              <button className={reposted.includes(post.id) ? 'action reposted' : 'action'} onClick={() => void toggleRepost(post)} aria-label="Repost"><Repeat2 size={18} /><span>{compact(post.repost_count)}</span></button>
              <button className={saved.includes(post.id) ? 'action saved' : 'action'} onClick={() => setSaved(prev => prev.includes(post.id) ? prev.filter(id => id !== post.id) : [...prev, post.id])} aria-label="Save post"><Bookmark size={18} fill={saved.includes(post.id) ? 'currentColor' : 'none'} /></button>
            </div>
          </div>
        </article>)}
      </div>
      <footer className="feed-footer">A little more signal, a little less noise.</footer>
    </main>

    <aside className="right-column">
      <div className="search-box"><Search size={18} /><input id="feed-search" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search conversations" /></div>
      <section className="side-section"><div className="side-title"><h2>People to follow</h2><button onClick={() => toast('More suggestions coming soon.')}>See all</button></div>{suggestions.map(person => <div className="suggestion" key={person.handle}><img src={person.avatar} alt="" /><div className="suggestion-info"><strong>{person.name}</strong><span>@{person.handle}</span><small>{person.note}</small></div><button className="follow-button" onClick={() => user ? toast(`Follow for ${person.name} will be connected next.`) : router.push('/auth')}>Follow</button></div>)}</section>
      <section className="side-section trend-section"><div className="side-title"><h2>Worth exploring</h2><Compass size={17} /></div><button className="trend" onClick={() => setSearchTerm('design')}><span>Design</span><strong>Thoughtful interfaces</strong><small>Explore conversations</small></button><button className="trend" onClick={() => setSearchTerm('app')}><span>Technology</span><strong>Things people are building</strong><small>Explore conversations</small></button><button className="trend" onClick={() => setSearchTerm('question')}><span>Open questions</span><strong>Ideas looking for answers</strong><small>Explore conversations</small></button></section>
      <div className="right-footer"><span>About</span><span>Privacy</span><span>Terms</span><span>© 2026 Threads clone</span></div>
    </aside>

    <button className="mobile-compose" onClick={() => setShowComposer(true)} aria-label="Create post"><Plus size={23} /></button>
    {showComposer && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowComposer(false); }}><section className="compose-modal"><div className="modal-heading"><h2>New conversation</h2><button className="icon-button" onClick={() => setShowComposer(false)} aria-label="Close"><X /></button></div><form onSubmit={publish}><textarea autoFocus maxLength={500} value={draft} onChange={e => setDraft(e.target.value)} placeholder="What's happening?" /><div className="modal-bottom"><span>{draft.length}/500</span><button className="primary-button" disabled={!draft.trim() || posting}>{posting ? 'Posting…' : 'Post'}</button></div></form></section></div>}
  </div>;
}
