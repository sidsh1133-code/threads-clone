'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, AtSign, Lock, Mail } from 'lucide-react';
import { toast, Toaster } from 'sonner';

export default function AuthPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return toast.error('Add your Supabase keys to .env.local first.');
    setBusy(true);
    const result = mode === 'signin'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { data: { handle, display_name: handle } } });
    setBusy(false);
    if (result.error) return toast.error(result.error.message);
    if (mode === 'signup' && !result.data.session) {
      toast.success('Check your email to confirm your account.');
      return;
    }
    toast.success(mode === 'signin' ? 'Welcome back.' : 'Your account is ready.');
    router.push('/');
    router.refresh();
  }

  return <main className="auth-page">
    <Toaster position="top-center" />
    <Link href="/" className="back-link"><ArrowLeft size={17} /> Back to feed</Link>
    <section className="auth-panel">
      <div className="brand-mark large">@</div>
      <h1>{mode === 'signin' ? 'Welcome back.' : 'Join the conversation.'}</h1>
      <p className="auth-subtitle">{mode === 'signin' ? 'Sign in to pick up where you left off.' : 'A place for ideas, questions, and everything in between.'}</p>
      <form onSubmit={submit} className="auth-form">
        {mode === 'signup' && <label><span>Username</span><div className="field-wrap"><AtSign size={17} /><input required minLength={3} maxLength={30} pattern="[a-zA-Z0-9_.]+" value={handle} onChange={e => setHandle(e.target.value.toLowerCase())} placeholder="yourname" /></div></label>}
        <label><span>Email</span><div className="field-wrap"><Mail size={17} /><input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></div></label>
        <label><span>Password</span><div className="field-wrap"><Lock size={17} /><input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" /></div></label>
        <button className="primary-button full" disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</button>
      </form>
      <p className="switch-auth">{mode === 'signin' ? 'New here?' : 'Already have an account?'} <button onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>{mode === 'signin' ? 'Create an account' : 'Sign in'}</button></p>
    </section>
  </main>;
}
