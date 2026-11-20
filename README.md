# Threads clone

A conversation-first social app built with Next.js 14, React, TypeScript, Tailwind CSS and Supabase.

## What is included

- Responsive desktop and mobile feed layout
- Preview feed while Supabase is not configured / user is signed out
- Email + password sign-in and sign-up
- Supabase profile lookup and For You / Following feed RPC integration
- Publish posts, like posts, repost posts, search visible feed content
- Saved-post interaction in the current browser session
- Database schema for profiles, follows, posts, replies, media, polls, likes, reposts, bookmarks, mutes, blocks, notifications, storage, RLS and feed RPCs

## Run locally

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and add your Supabase project URL and anon key.
4. In Supabase SQL Editor, run `supabase/schema.sql` on a fresh project.
5. Run `npm run dev` and open http://localhost:3000.

If you leave the Supabase environment variables empty, the UI opens in preview mode with sample conversations. Preview mode does not persist posts or interactions.

## Supabase setup

Create a Supabase project, then run the SQL file once in SQL Editor. In Authentication settings, configure your site URL (for local development: `http://localhost:3000`) and enable email/password authentication. Copy the Project URL and anon/public key into `.env.local`.

Never put the Supabase service-role key in a `NEXT_PUBLIC_` variable or commit secrets.

## Current scope

This is the first integrated app pass, not a finished production social network. Reply composer/thread detail, media upload, profile editing, follow/unfollow, notification screens, poll creation/voting, and full moderation/settings flows remain to be implemented. The schema contains much of the backend foundation for those features.
