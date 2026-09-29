<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { ArrowRight, Mail, Send, ShieldCheck } from 'lucide-svelte';

  let mode: 'login' | 'register' = 'login';
  let name = '';
  let email = '';
  let password = '';
  let busy = false;
  let error = '';

  onMount(async () => {
    try {
      const response = await fetch('/auth/me');
      if (response.ok) await goto('/');
    } catch {
      error = 'The server is unavailable. Please try again in a moment.';
    }
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    error = '';
    busy = true;

    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
      const payload = mode === 'login' ? { email, password } : { name, email, password };
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to sign in.');
      await goto('/');
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Request failed. Please try again.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head>
  <title>{mode === 'login' ? 'Sign in' : 'Create account'} · Letterpress</title>
  <meta name="description" content="Sign in to manage your email campaigns." />
</svelte:head>

<main class="auth-page">
  <section class="auth-story" aria-label="Letterpress">
    <div class="brand-lockup"><span class="brand-mark"><Send size={19} /></span><span>letterpress</span></div>
    <div class="story-copy">
      <span class="eyebrow">CAMPAIGN WORKSPACE / 01</span>
      <h1>Good mail<br />moves things.</h1>
      <p>Make each send count.</p>
    </div>
    <div class="story-foot"><ShieldCheck size={16} /><span>Private workspace · Session protected</span></div>
    <div class="orbit orbit-one"></div><div class="orbit orbit-two"></div>
    <div class="story-stamp"><span>LP</span><small>EST. FOR<br />BETTER MAIL</small></div>
  </section>

  <section class="auth-main">
    <div class="auth-form-wrap">
      <div class="mobile-brand"><span class="brand-mark"><Send size={17} /></span> letterpress</div>
      <div class="auth-heading">
        <span class="eyebrow">YOUR DESK IS READY</span>
        <h2>{mode === 'login' ? 'Welcome back' : 'Make an account'}</h2>
        <p>{mode === 'login' ? 'Sign in to pick up where you left off.' : 'Create a workspace for your campaigns.'}</p>
      </div>

      <div class="mode-switch" role="tablist" aria-label="Account access">
        <button class:active={mode === 'login'} role="tab" aria-selected={mode === 'login'} onclick={() => { mode = 'login'; error = ''; }}>Sign in</button>
        <button class:active={mode === 'register'} role="tab" aria-selected={mode === 'register'} onclick={() => { mode = 'register'; error = ''; }}>Create account</button>
      </div>

      {#if error}<div class="auth-error" role="alert">{error}</div>{/if}

      <form onsubmit={submit}>
        {#if mode === 'register'}
          <label class="auth-field"><span>Full name</span><input bind:value={name} name="name" autocomplete="name" placeholder="Your name" required /></label>
        {/if}
        <label class="auth-field"><span>Email address</span><div class="input-icon"><Mail size={17} /><input bind:value={email} name="email" type="email" autocomplete="email" placeholder="you@company.com" required /></div></label>
        <label class="auth-field"><span>Password</span><input bind:value={password} name="password" type="password" autocomplete={mode === 'login' ? 'current-password' : 'new-password'} minlength="6" placeholder="At least 6 characters" required /></label>
        <button class="submit-button" type="submit" disabled={busy}>
          {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
          {#if !busy}<ArrowRight size={17} />{/if}
        </button>
      </form>
      <p class="auth-legal">Your credentials are encrypted and never displayed in the workspace.</p>
    </div>
    <footer>LETTERPRESS <span>•</span> PRIVATE MAIL OPERATIONS</footer>
  </section>
</main>

<style>
  .auth-page { display: grid; min-height: 100vh; grid-template-columns: minmax(320px, 1fr) minmax(410px, .95fr); background: #fff; }
  .auth-story { position: relative; display: flex; min-height: 100vh; flex-direction: column; justify-content: space-between; overflow: hidden; padding: 35px 7.5%; color: #f6f8f5; background: #14291f; }
  .brand-lockup, .mobile-brand { position: relative; z-index: 2; display: flex; align-items: center; gap: 10px; font: 600 1rem 'Space Grotesk', sans-serif; }
  .brand-mark { display: inline-grid; width: 35px; height: 35px; place-items: center; border-radius: 6px; color: #183226; background: #a6dfbc; }
  .story-copy { position: relative; z-index: 2; margin-top: -20px; }
  .story-copy .eyebrow { color: #93baa1; }
  .story-copy h1 { margin: 24px 0 13px; font: 600 clamp(3rem, 5vw, 5.2rem)/.98 'Space Grotesk', sans-serif; letter-spacing: 0; }
  .story-copy p { color: #bfd0c4; font-size: 1rem; }
  .story-foot { position: relative; z-index: 2; display: flex; align-items: center; gap: 9px; color: #afc2b4; font-size: .76rem; }
  .orbit { position: absolute; right: -155px; bottom: 7%; width: 450px; aspect-ratio: 1; border: 1px solid #7fb39435; border-radius: 50%; }
  .orbit-two { right: -80px; bottom: -3%; width: 300px; border-color: #ed704e50; }
  .story-stamp { position: absolute; right: 13%; bottom: 26%; display: flex; align-items: center; gap: 10px; width: 110px; height: 110px; justify-content: center; border: 1px solid #a4c9ad7d; border-radius: 50%; color: #aed5b7; transform: rotate(-14deg); }
  .story-stamp span { font: 700 1.5rem 'Space Grotesk', sans-serif; }
  .story-stamp small { font-size: .48rem; line-height: 1.4; letter-spacing: .07em; }
  .auth-main { display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 42px 9%; }
  .auth-form-wrap { width: min(100%, 390px); }
  .mobile-brand { display: none; margin-bottom: 50px; color: var(--ink); }
  .auth-heading { margin-bottom: 30px; }
  .auth-heading h2 { margin: 12px 0 6px; font: 600 2rem 'Space Grotesk', sans-serif; letter-spacing: 0; }
  .auth-heading p { margin: 0; color: var(--muted); font-size: .9rem; }
  .mode-switch { display: grid; grid-template-columns: 1fr 1fr; margin-bottom: 25px; padding: 4px; border-radius: 6px; background: #f0f4f1; }
  .mode-switch button { min-height: 37px; border: 0; border-radius: 4px; color: #69766e; background: transparent; font-size: .8rem; font-weight: 700; }
  .mode-switch button.active { color: var(--ink); background: white; box-shadow: 0 1px 4px #13281c12; }
  .auth-field { display: grid; gap: 8px; margin-bottom: 19px; color: #46554b; font-size: .77rem; font-weight: 700; }
  .auth-field input { width: 100%; height: 48px; padding: 0 13px; border: 1px solid #dce5de; border-radius: 5px; color: var(--ink); background: white; outline: none; font-size: .86rem; }
  .auth-field input:focus { border-color: #67a781; box-shadow: 0 0 0 3px #18835d16; }
  .input-icon { position: relative; }
  .input-icon :global(svg) { position: absolute; top: 15px; left: 13px; color: #87938a; }
  .input-icon input { padding-left: 40px; }
  .submit-button { display: flex; width: 100%; height: 48px; align-items: center; justify-content: space-between; margin-top: 9px; padding: 0 16px; border: 0; border-radius: 5px; color: white; background: var(--green); font-size: .88rem; font-weight: 700; }
  .submit-button:hover { background: var(--green-dark); }
  .auth-legal { margin-top: 24px; color: #89948d; font-size: .72rem; text-align: center; }
  .auth-error { margin-bottom: 16px; padding: 10px 12px; border: 1px solid #f0ceca; border-radius: 5px; color: #a43f38; background: #fff5f3; font-size: .8rem; }
  .auth-main footer { margin-top: auto; padding-top: 40px; color: #9aa49d; font-size: .62rem; font-weight: 700; letter-spacing: .08em; }
  .auth-main footer span { padding: 0 5px; color: var(--coral); }
  @media (max-width: 760px) { .auth-page { display: block; } .auth-story { display: none; } .auth-main { min-height: 100vh; padding: 28px 24px; } .mobile-brand { display: flex; margin-bottom: 56px; } .auth-main footer { padding-top: 55px; } }
</style>