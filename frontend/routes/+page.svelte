<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { tweened } from 'svelte/motion';
  import type Quill from 'quill';
  import {
    Activity, AlertCircle, ArrowDownToLine, ArrowRight, Check, CheckCircle2,
    ChevronDown, CircleHelp, Clock3, FileSpreadsheet, FileText, Gauge,
    LayoutDashboard, LoaderCircle, LogOut, Mail, MoreHorizontal, Pause,
    Play, Plus, RefreshCw, Search, Send, Settings2, ShieldCheck,
    SlidersHorizontal, Sparkles, Trash2, Upload, Users, X
  } from 'lucide-svelte';
  import { apiRequest } from '../lib/api';
  import type { BatchStatus, Contact, EmailLog, EmailStats, ScheduledJob, SmtpConfig } from '../lib/api';

  type Tab = 'overview' | 'compose' | 'mailboxes' | 'reports';
  type User = { id: string; name: string; email: string };
  type ConfigForm = {
    id?: string;
    name: string;
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    fromEmail: string;
    fromName: string;
    isDefault: boolean;
  };

  const emptyForm = (): ConfigForm => ({
    name: '', host: '', port: 587, secure: false, user: '', pass: '',
    fromEmail: '', fromName: '', isDefault: false
  });
  const emptyStats: EmailStats = { total: 0, sent: 0, failed: 0, errors: 0 };
  const totalValue = tweened(0, { duration: 480 });
  const sentValue = tweened(0, { duration: 480 });
  const failedValue = tweened(0, { duration: 480 });
  const errorValue = tweened(0, { duration: 480 });

  let user: User | null = null;
  let activeTab: Tab = 'overview';
  let isLoading = true;
  let apiStatus: 'checking' | 'connected' | 'offline' = 'checking';
  let lastSynced = '';
  let refreshing = false;
  let busy = false;
  let busyAction = '';
  let toast = '';
  let toastError = false;
  let smtpConfigs: SmtpConfig[] = [];
  let selectedConfigId = '';
  let stats = { ...emptyStats };
  let logs: EmailLog[] = [];
  let scheduledJobs: ScheduledJob[] = [];
  let batch: BatchStatus | null = null;
  let reportSearch = '';
  let configModalOpen = false;
  let editingConfig = false;
  let configForm = emptyForm();
  let totalContacts = 0;
  let previewContacts: Contact[] = [];
  let excelFile: File | null = null;
  let htmlTemplate: File | null = null;
  let parseBusy = false;
  let subject = '';
  let htmlContent = '<p>Hi {{FirstName}},</p><p>I wanted to share an update with you.</p><p>Best,<br />Your name</p>';
  let useBatch = false;
  let batchSize = 20;
  let batchDelay = 60;
  let emailDelay = 45;
  let scheduleCampaign = false;
  let scheduledTime = '';
  let notifyEmail = '';
  let notifyBrowser = false;
  let sendDelay = 20;
  let rangeMode: 'all' | 'first' | 'custom' = 'all';
  let firstCount = 50;
  let rangeFrom = 1;
  let rangeTo = 50;
  let showPreview = false;
  let editor: Quill | null = null;
  let providerLimit = '';
  let toastTimer: ReturnType<typeof setTimeout>;

  $: filteredLogs = logs.filter((log) => {
    const query = reportSearch.trim().toLowerCase();
    return !query || [log.email, log.firstName, log.company, log.subject, log.status, log.message]
      .some((value) => value?.toLowerCase().includes(query));
  });
  $: deliveredRate = stats.total ? Math.round((stats.sent / stats.total) * 100) : 0;
  $: chosenCount = getSelectedRange().count;

  onMount(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    void initialize().then(() => {
      if (user) interval = setInterval(() => void refreshLive(), 7000);
    });
    return () => {
      if (interval) clearInterval(interval);
      if (toastTimer) clearTimeout(toastTimer);
    };
  });

  async function initialize() {
    try {
      const result = await apiRequest<{ success: boolean; user: User }>('/auth/me');
      if (!result.success) throw new Error('Please sign in to continue.');
      user = result.user;
      const results = await Promise.allSettled([loadConfigs(), loadReports(), loadJobs(), loadBatch()]);
      apiStatus = results.every((result) => result.status === 'fulfilled') ? 'connected' : 'offline';
      lastSynced = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch {
      window.location.replace('/login');
    } finally {
      isLoading = false;
    }
  }

  async function loadConfigs() {
    const result = await apiRequest<{
      success: boolean;
      userConfigs: SmtpConfig[];
    }>('/config/smtp');
    smtpConfigs = result.userConfigs ?? [];
    if (!smtpConfigs.some((config) => config.id === selectedConfigId)) {
      selectedConfigId = smtpConfigs.find((config) => config.isDefault)?.id ?? smtpConfigs[0]?.id ?? '';
    }
    if (selectedConfigId) void loadProviderLimit();
  }

  async function loadReports() {
    const result = await apiRequest<{ success: boolean; data: { logs: EmailLog[]; stats: EmailStats } }>('/report');
    logs = result.data.logs ?? [];
    stats = result.data.stats ?? { ...emptyStats };
    void totalValue.set(stats.total);
    void sentValue.set(stats.sent);
    void failedValue.set(stats.failed);
    void errorValue.set(stats.errors);
  }

  async function loadJobs() {
    const result = await apiRequest<{ success: boolean; data: ScheduledJob[] }>('/scheduled-jobs');
    scheduledJobs = result.data ?? [];
  }

  async function loadBatch() {
    const result = await apiRequest<{ success: boolean; data: BatchStatus }>('/batch-status');
    batch = result.data;
  }

  async function refreshLive() {
    if (refreshing) return;
    refreshing = true;
    const results = await Promise.allSettled([loadReports(), loadJobs(), loadBatch()]);
    apiStatus = results.every((result) => result.status === 'fulfilled') ? 'connected' : 'offline';
    lastSynced = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    refreshing = false;
  }

  async function selectTab(tab: Tab) {
    activeTab = tab;
    if (tab === 'compose') {
      await tick();
      await setupEditor();
    }
    if (tab === 'reports') void loadReports();
    if (tab === 'mailboxes') void loadConfigs();
  }

  async function setupEditor() {
    const mountPoint = document.getElementById('campaign-editor');
    if (!mountPoint || mountPoint.querySelector('.ql-editor')) return;
    const { default: QuillEditor } = await import('quill');
    editor = new QuillEditor(mountPoint, {
      theme: 'snow',
      placeholder: 'Write your message. Personalize it with {{FirstName}}, {{Email}}, or {{Company}}.',
      modules: { toolbar: [['bold', 'italic', 'underline'], [{ list: 'ordered' }, { list: 'bullet' }], ['link']] }
    });
    editor.root.innerHTML = htmlContent;
    editor.on('text-change', () => {
      htmlContent = editor?.root.innerHTML ?? '';
    });
  }

  function notify(message: string, isError = false) {
    toast = message;
    toastError = isError;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = ''), 4200);
  }

  async function logout() {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
      window.location.replace('/login');
    } catch (error) {
      notify(errorMessage(error), true);
    }
  }

  function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
  }

  function getSelectedRange() {
    if (rangeMode === 'first') {
      const count = Math.min(Math.max(1, Number(firstCount) || 1), totalContacts);
      return { start: 0, count };
    }
    if (rangeMode === 'custom') {
      const start = Math.max(0, Math.min(totalContacts - 1, Number(rangeFrom) - 1));
      const end = Math.max(start + 1, Math.min(totalContacts, Number(rangeTo)));
      return { start, count: end - start };
    }
    return { start: 0, count: totalContacts };
  }

  async function chooseExcel(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    excelFile = input.files?.[0] ?? null;
    totalContacts = 0;
    previewContacts = [];
    providerLimit = '';
    if (!excelFile) return;
    const data = new FormData();
    data.append('excelFile', excelFile);
    parseBusy = true;
    try {
      const result = await apiRequest<{ success: boolean; contacts: Contact[]; totalCount: number }>('/parse-excel', {
        method: 'POST', body: data
      });
      totalContacts = result.totalCount;
      previewContacts = result.contacts ?? [];
      rangeTo = Math.max(1, result.totalCount);
      rangeFrom = 1;
      if (selectedConfigId) await loadProviderLimit();
      notify(`${result.totalCount} contacts found in ${excelFile.name}.`);
    } catch (error) {
      excelFile = null;
      input.value = '';
      notify(errorMessage(error), true);
    } finally {
      parseBusy = false;
    }
  }

  async function loadProviderLimit() {
    const config = smtpConfigs.find((item) => item.id === selectedConfigId);
    if (!config) return;
    try {
      const form = new FormData();
      form.set('smtpHost', config.host);
      form.set('hasNotification', notifyEmail ? 'true' : 'false');
      const result = await apiRequest<{ success: boolean; data: { provider: string; maxContacts: number } }>('/provider-info', {
        method: 'POST', body: form
      });
      providerLimit = `${result.data.provider} · up to ${result.data.maxContacts.toLocaleString()} contacts per send`;
    } catch {
      providerLimit = '';
    }
  }

  async function sendCampaign(event: SubmitEvent) {
    event.preventDefault();
    if (!selectedConfigId) return notify('Add an SMTP mailbox before composing a campaign.', true);
    if (!excelFile) return notify('Choose a contact spreadsheet first.', true);
    if (!subject.trim()) return notify('Add a subject line first.', true);
    htmlContent = editor?.root.innerHTML ?? htmlContent;
    if (!htmlTemplate && (!htmlContent.trim() || htmlContent === '<p><br></p>')) {
      return notify('Write a message or attach an HTML template.', true);
    }
    if (totalContacts < 1 || chosenCount < 1) return notify('The selected contact range is empty.', true);
    if (scheduleCampaign && (!scheduledTime || new Date(scheduledTime) <= new Date())) {
      return notify('Choose a future date and time to schedule this campaign.', true);
    }

    const form = new FormData();
    const range = getSelectedRange();
    form.set('configId', selectedConfigId);
    form.set('subject', subject.trim());
    form.set('htmlContent', htmlContent);
    form.set('delay', String(sendDelay));
    form.set('useBatch', useBatch ? 'on' : 'off');
    form.set('batchSize', String(batchSize));
    form.set('batchDelay', String(batchDelay));
    form.set('emailDelay', String(emailDelay));
    form.set('scheduleEmail', scheduleCampaign ? 'on' : 'off');
    form.set('emailRangeStart', String(range.start));
    form.set('emailRangeCount', String(range.count));
    form.set('excelFile', excelFile);
    if (htmlTemplate) form.set('htmlTemplate', htmlTemplate);
    if (scheduleCampaign) {
      form.set('scheduledTime', new Date(scheduledTime).toISOString());
      if (notifyEmail) form.set('notifyEmail', notifyEmail);
      if (notifyBrowser) form.set('notifyBrowser', 'on');
    }

    busy = true;
    busyAction = 'send';
    try {
      const result = await apiRequest<{ success: boolean; message: string; contactCount: number; scheduledMode?: boolean; batchMode?: boolean }>('/send', {
        method: 'POST', body: form
      });
      notify(result.message || `Campaign accepted for ${result.contactCount} contacts.`);
      await Promise.allSettled([loadReports(), loadJobs(), loadBatch()]);
      if (result.scheduledMode) await selectTab('overview');
    } catch (error) {
      notify(errorMessage(error), true);
    } finally {
      busy = false;
      busyAction = '';
    }
  }

  function openConfig(config?: SmtpConfig) {
    editingConfig = !!config;
    configForm = config
      ? { ...emptyForm(), ...config, pass: '' }
      : emptyForm();
    configModalOpen = true;
  }

  async function saveConfig(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    busyAction = 'config';
    const body: Record<string, string | number | boolean> = {
      name: configForm.name,
      host: configForm.host,
      port: Number(configForm.port),
      secure: configForm.secure,
      user: configForm.user,
      fromEmail: configForm.fromEmail,
      fromName: configForm.fromName,
      isDefault: configForm.isDefault
    };
    if (configForm.pass) body.pass = configForm.pass;
    try {
      await apiRequest(editingConfig ? `/config/smtp/${configForm.id}` : '/config/smtp', {
        method: editingConfig ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      configModalOpen = false;
      notify(editingConfig ? 'Mailbox updated.' : 'Mailbox added.');
      await loadConfigs();
    } catch (error) {
      notify(errorMessage(error), true);
    } finally {
      busy = false;
      busyAction = '';
    }
  }

  async function testConfig() {
    if (!configForm.pass && editingConfig) return notify('Enter the mailbox password to test its connection.', true);
    busy = true;
    busyAction = 'test';
    try {
      const result = await apiRequest<{ success: boolean; message: string }>('/config/smtp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: configForm.host, port: Number(configForm.port), secure: configForm.secure,
          user: configForm.user, pass: configForm.pass
        })
      });
      notify(result.message, !result.success);
    } catch (error) {
      notify(errorMessage(error), true);
    } finally {
      busy = false;
      busyAction = '';
    }
  }

  async function setDefault(config: SmtpConfig) {
    try {
      await apiRequest(`/config/smtp/${config.id}/default`, { method: 'POST' });
      selectedConfigId = config.id;
      await loadConfigs();
      notify(`${config.name} is now the default mailbox.`);
    } catch (error) {
      notify(errorMessage(error), true);
    }
  }

  async function deleteConfig(config: SmtpConfig) {
    if (!window.confirm(`Delete the ${config.name} mailbox?`)) return;
    try {
      await apiRequest(`/config/smtp/${config.id}`, { method: 'DELETE' });
      if (selectedConfigId === config.id) selectedConfigId = '';
      await loadConfigs();
      notify('Mailbox deleted.');
    } catch (error) {
      notify(errorMessage(error), true);
    }
  }

  async function batchAction(action: 'pause' | 'resume' | 'cancel') {
    const options: RequestInit = action === 'cancel' ? { method: 'DELETE' } : { method: 'POST' };
    try {
      await apiRequest(`/batch-${action}`, options);
      await loadBatch();
      notify(action === 'pause' ? 'Batch paused.' : action === 'resume' ? 'Batch resumed.' : 'Batch cancelled.');
    } catch (error) {
      notify(errorMessage(error), true);
    }
  }

  async function cancelJob(job: ScheduledJob) {
    if (!window.confirm('Cancel this scheduled campaign?')) return;
    try {
      await apiRequest(`/scheduled-jobs/${job.id}`, { method: 'DELETE' });
      await loadJobs();
      notify('Scheduled campaign cancelled.');
    } catch (error) {
      notify(errorMessage(error), true);
    }
  }

  async function exportReport(format: 'csv' | 'json') {
    try {
      const response = await fetch(`/report/export/${format}`, { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Could not export this report.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `email-logs.${format}`;
      link.click();
      URL.revokeObjectURL(url);
      notify(`Report downloaded as ${format.toUpperCase()}.`);
    } catch (error) {
      notify(errorMessage(error), true);
    }
  }

  async function clearReport() {
    if (!window.confirm('Clear all email logs? This cannot be undone.')) return;
    try {
      await apiRequest('/report/clear', { method: 'DELETE' });
      await loadReports();
      notify('Email logs cleared.');
    } catch (error) {
      notify(errorMessage(error), true);
    }
  }

  function contactField(contact: Contact, names: string[]) {
    const key = Object.keys(contact).find((item) => names.includes(item.toLowerCase()));
    return key ? String(contact[key] ?? '') : '—';
  }

  function jobDate(job: ScheduledJob) {
    const date = job.scheduled_time ?? job.scheduledTime ?? job.scheduledAt;
    return date ? new Date(date).toLocaleString() : '—';
  }

  function batchProgress() {
    const job = batch?.currentJob;
    if (!job?.totalContacts) return 0;
    return Math.min(100, Math.round(((job.emailsSent ?? 0) / job.totalContacts) * 100));
  }
</script>

<svelte:head>
  <title>Letterpress · Campaign workspace</title>
  <meta name="description" content="Manage email campaigns, mailboxes, and delivery reports." />
</svelte:head>

{#if isLoading}
  <div class="loading-screen"><span class="loading-mark"><Send size={21} /></span><LoaderCircle size={18} class="spin" /> Preparing your desk</div>
{:else if user}
  <div class="workspace">
    <aside class="sidebar">
      <a class="brand" href="/" aria-label="Letterpress home"><span class="brand-mark"><Send size={17} /></span><span>letterpress</span><span class="edition">MAIL OPS</span></a>
      <div class="sidebar-label">WORKSPACE</div>
      <nav aria-label="Workspace navigation">
        <button class:active={activeTab === 'overview'} onclick={() => selectTab('overview')}><LayoutDashboard size={17} /><span>Overview</span></button>
        <button class:active={activeTab === 'compose'} onclick={() => selectTab('compose')}><Send size={17} /><span>Compose</span><span class="nav-count">01</span></button>
        <button class:active={activeTab === 'mailboxes'} onclick={() => selectTab('mailboxes')}><Settings2 size={17} /><span>Mailboxes</span></button>
        <button class:active={activeTab === 'reports'} onclick={() => selectTab('reports')}><Activity size={17} /><span>Delivery reports</span></button>
      </nav>
      <div class="sidebar-bottom">
        <div class="sidebar-rule"></div>
        <div class="sidebar-user"><div class="avatar">{user.name.slice(0, 1).toUpperCase()}</div><div class="sidebar-user-copy"><strong>{user.name}</strong><span>{user.email}</span></div><button class="side-logout" title="Sign out" aria-label="Sign out" onclick={logout}><LogOut size={16} /></button></div>
        <div class="secure-label"><ShieldCheck size={13} /> PRIVATE WORKSPACE</div>
      </div>
    </aside>

    <main class="main-area">
      <header class="topbar">
        <div class="crumb"><span>Workspace</span><span class="crumb-slash">/</span><strong>{activeTab === 'reports' ? 'Delivery reports' : activeTab === 'mailboxes' ? 'Mailboxes' : activeTab === 'compose' ? 'Compose campaign' : 'Overview'}</strong></div>
        <div class="topbar-right"><span class="server-state" class:offline={apiStatus === 'offline'} class:checking={apiStatus === 'checking'}><i></i> {apiStatus === 'connected' ? 'Live' : apiStatus === 'offline' ? 'Offline' : 'Connecting'}{#if lastSynced}<span class="sync-time">· {lastSynced}</span>{/if}</span><button class="icon-button" title="Refresh workspace" aria-label="Refresh workspace" disabled={refreshing} onclick={refreshLive}><RefreshCw size={16} class={refreshing ? 'spin' : undefined} /></button><div class="top-avatar">{user.name.slice(0, 1).toUpperCase()}</div></div>
      </header>

      <div class="page-content">
        {#if activeTab === 'overview'}
          <section class="page-intro"><div><div class="eyebrow">TUESDAY, {new Date().toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}</div><h1 class="display-font">Your sending desk</h1><p>Welcome back, {user.name.split(' ')[0]}. Here’s the latest from your workspace.</p></div><button class="primary-button" onclick={() => selectTab('compose')}><Plus size={17} /> New campaign</button></section>

          <section class="metric-grid" aria-label="Email performance">
            <article class="metric-card"><div class="metric-top"><span>Total emails</span><span class="metric-icon green"><Mail size={16} /></span></div><strong class="display-font">{Math.round($totalValue).toLocaleString()}</strong><small>All recorded activity</small></article>
            <article class="metric-card"><div class="metric-top"><span>Delivered</span><span class="metric-icon coral"><CheckCircle2 size={16} /></span></div><strong class="display-font">{Math.round($sentValue).toLocaleString()}</strong><small><span class="positive">{deliveredRate}%</span> delivery rate</small></article>
            <article class="metric-card"><div class="metric-top"><span>Needs attention</span><span class="metric-icon amber"><AlertCircle size={16} /></span></div><strong class="display-font">{Math.round($failedValue + $errorValue).toLocaleString()}</strong><small>Failed or errored messages</small></article>
            <article class="metric-card"><div class="metric-top"><span>Mailboxes</span><span class="metric-icon dark"><Settings2 size={16} /></span></div><strong class="display-font">{smtpConfigs.length}</strong><small>{smtpConfigs.find((config) => config.isDefault)?.name ?? 'No default mailbox'}</small></article>
          </section>

          <section class="overview-grid">
            <article class="panel activity-panel">
              <div class="panel-heading"><div><span class="eyebrow">LIVE MONITOR</span><h2>Batch activity</h2></div><span class:badge={true} class:pending={batch?.isRunning || batch?.currentJob?.status === 'Paused'}>{batch?.currentJob?.status === 'Paused' ? 'PAUSED' : batch?.isRunning ? 'IN PROGRESS' : 'IDLE'}</span></div>
              {#if batch?.currentJob && (batch.isRunning || batch.currentJob.status === 'Paused')}
                <div class="panel-body batch-body"><div class="batch-readout"><div><strong class="display-font">{(batch.currentJob.emailsSent ?? 0).toLocaleString()}<span> / {(batch.currentJob.totalContacts ?? 0).toLocaleString()}</span></strong><small>messages processed</small></div><div class="batch-pct">{batchProgress()}%</div></div><div class="progress-track"><span style={`width:${batchProgress()}%`}></span></div><div class="batch-footer"><span>Batch {batch.currentJob.currentBatch ?? 1} of {batch.currentJob.totalBatches ?? '—'}</span><div class="inline-actions"><button class="icon-button" title={batch.currentJob.status === 'Paused' ? 'Resume batch' : 'Pause batch'} aria-label={batch.currentJob.status === 'Paused' ? 'Resume batch' : 'Pause batch'} onclick={() => batchAction(batch?.currentJob?.status === 'Paused' ? 'resume' : 'pause')}>{#if batch.currentJob.status === 'Paused'}<Play size={15} />{:else}<Pause size={15} />{/if}</button><button class="icon-button stop-button" title="Cancel batch" aria-label="Cancel batch" onclick={() => batchAction('cancel')}><X size={15} /></button></div></div></div>
              {:else}
                <div class="empty-state"><span class="idle-ring"><Gauge size={21} /></span><strong>No active batch</strong><span>Batch sends will appear here while they run.</span><button class="text-button" onclick={() => selectTab('compose')}>Start a campaign <ArrowRight size={14} /></button></div>
              {/if}
            </article>

            <article class="panel scheduled-panel">
              <div class="panel-heading"><div><span class="eyebrow">UP NEXT</span><h2>Scheduled campaigns</h2></div><button class="icon-button" title="Refresh scheduled jobs" aria-label="Refresh scheduled jobs" onclick={loadJobs}><RefreshCw size={15} /></button></div>
              {#if scheduledJobs.length}
                <div class="job-list">{#each scheduledJobs.slice(0, 4) as job (job.id)}<div class="job-row"><span class="job-clock"><Clock3 size={16} /></span><div class="job-info"><strong>{job.subject || 'Email campaign'}</strong><span>{jobDate(job)}</span></div><span class="badge pending">{job.status}</span><button class="icon-button job-cancel" title="Cancel scheduled campaign" aria-label="Cancel scheduled campaign" onclick={() => cancelJob(job)}><X size={15} /></button></div>{/each}</div>
              {:else}
                <div class="empty-state short"><span class="idle-ring"><Clock3 size={20} /></span><strong>Nothing on the calendar</strong><span>Scheduled campaigns will be listed here.</span></div>
              {/if}
              <button class="scheduled-cta" onclick={() => selectTab('compose')}>Schedule a campaign <ArrowRight size={14} /></button>
            </article>
          </section>

          <article class="panel recent-panel">
            <div class="panel-heading"><div><span class="eyebrow">THE PAPER TRAIL</span><h2>Recent deliveries</h2></div><button class="text-button" onclick={() => selectTab('reports')}>Open reports <ArrowRight size={14} /></button></div>
            {#if logs.length}
              <div class="table-wrap"><table><thead><tr><th>Recipient</th><th>Subject</th><th>Status</th><th>Sent at</th></tr></thead><tbody>{#each logs.slice(0, 5) as log}<tr><td class="recipient-cell">{log.email}</td><td>{log.subject || '—'}</td><td><span class="status-dot" class:sent={log.status.toLowerCase() === 'sent'}></span>{log.status}</td><td>{new Date(log.timestamp).toLocaleString()}</td></tr>{/each}</tbody></table></div>
            {:else}<div class="empty-inline">No emails have been recorded yet.</div>{/if}
          </article>
        {:else if activeTab === 'compose'}
          <section class="page-intro"><div><div class="eyebrow">CAMPAIGN BUILDER / NEW SEND</div><h1 class="display-font">Compose campaign</h1><p>Prepare your message, audience, and delivery schedule.</p></div><button class="secondary-button" onclick={() => selectTab('overview')}><ArrowRight size={16} class="back-arrow" /> Overview</button></section>
          {#if !smtpConfigs.length}<div class="notice"><CircleHelp size={17} /><span>No mailbox configured yet. <button class="text-button" onclick={() => selectTab('mailboxes')}>Add an SMTP mailbox</button> to begin sending.</span></div>{/if}
          <form class="compose-layout" onsubmit={sendCampaign}>
            <div class="compose-main">
              <article class="panel compose-section"><div class="panel-heading"><div class="section-title"><span class="section-number">01</span><div><h2>Campaign details</h2><p>Choose where this message will come from.</p></div></div><button type="button" class="text-button" onclick={() => selectTab('mailboxes')}>Manage mailboxes</button></div><div class="panel-body"><div class="field"><label for="campaign-mailbox">Send from</label><select id="campaign-mailbox" bind:value={selectedConfigId} onchange={loadProviderLimit}><option value="">Select a mailbox</option>{#each smtpConfigs as config (config.id)}<option value={config.id}>{config.name}{config.isDefault ? ' · Default' : ''} — {config.fromEmail}</option>{/each}</select>{#if providerLimit}<small>{providerLimit}</small>{/if}</div><div class="field subject-field"><label for="campaign-subject">Subject line</label><input id="campaign-subject" bind:value={subject} maxlength="250" placeholder="A subject your readers will open" required /><small>Personalize with spreadsheet fields such as &#123;&#123;FirstName&#125;&#125;.</small></div></div></article>

              <article class="panel compose-section"><div class="panel-heading"><div class="section-title"><span class="section-number">02</span><div><h2>Your message</h2><p>Write the email or attach an HTML template.</p></div></div><button type="button" class="secondary-button small-action" onclick={() => (showPreview = true)}><FileText size={15} /> Preview</button></div><div class="panel-body"><div class="editor-frame"><div id="campaign-editor" aria-label="Email message editor"></div></div><div class="template-upload"><label class="upload-inline" for="html-template"><Upload size={15} /><span>{htmlTemplate ? htmlTemplate.name : 'Use an HTML template instead'}</span></label><input id="html-template" class="visually-hidden" type="file" accept=".html,.htm,text/html" onchange={(event) => (htmlTemplate = (event.currentTarget as HTMLInputElement).files?.[0] ?? null)} />{#if htmlTemplate}<button class="icon-button" type="button" title="Remove HTML template" aria-label="Remove HTML template" onclick={() => (htmlTemplate = null)}><X size={15} /></button>{/if}</div></div></article>

              <article class="panel compose-section"><div class="panel-heading"><div class="section-title"><span class="section-number">03</span><div><h2>Audience</h2><p>Upload an Excel or CSV contact list.</p></div></div><a class="sample-link" href="/public/samples/sample-contacts.xlsx" download><ArrowDownToLine size={14} /> Sample file</a></div><div class="panel-body"><label class="drop-zone" for="contacts-file"><span class="upload-icon"><FileSpreadsheet size={21} /></span><strong>{excelFile ? excelFile.name : 'Drop your contact list here'}</strong><small>{parseBusy ? 'Reading contacts…' : excelFile ? `${totalContacts.toLocaleString()} contacts found` : 'or choose a file · XLSX, XLS, CSV'}</small><input id="contacts-file" class="visually-hidden" type="file" accept=".xlsx,.xls,.csv" onchange={chooseExcel} /></label>{#if totalContacts}<div class="audience-summary"><div><Users size={16} /><strong>{chosenCount.toLocaleString()}</strong><span>of {totalContacts.toLocaleString()} contacts selected</span></div><label class="range-select"><span>Send to</span><select bind:value={rangeMode}><option value="all">All contacts</option><option value="first">First N contacts</option><option value="custom">Custom range</option></select></label>{#if rangeMode === 'first'}<div class="field range-field"><label for="first-count">Number of contacts</label><input id="first-count" type="number" min="1" max={totalContacts} bind:value={firstCount} /></div>{:else if rangeMode === 'custom'}<div class="range-custom"><label class="field"><span>From</span><input type="number" min="1" max={totalContacts} bind:value={rangeFrom} /></label><span class="range-dash">to</span><label class="field"><span>To</span><input type="number" min={rangeFrom} max={totalContacts} bind:value={rangeTo} /></label></div>{/if}</div><div class="contact-preview"><div class="preview-caption">FIRST {Math.min(previewContacts.length, 5)} CONTACTS</div><div class="table-wrap"><table><thead><tr><th>Email</th><th>Name</th><th>Company</th></tr></thead><tbody>{#each previewContacts.slice(0, 5) as contact}<tr><td>{contactField(contact, ['email', 'e-mail'])}</td><td>{contactField(contact, ['firstname', 'first name', 'name'])}</td><td>{contactField(contact, ['company', 'organization'])}</td></tr>{/each}</tbody></table></div></div>{/if}</div></article>
            </div>

            <aside class="compose-side">
              <article class="panel send-panel"><div class="panel-heading"><div><span class="eyebrow">DELIVERY</span><h2>Send options</h2></div><SlidersHorizontal size={17} class="heading-icon" /></div><div class="panel-body"><div class="toggle-row"><label for="batch-mode">Batch delivery</label><input id="batch-mode" class="switch" type="checkbox" bind:checked={useBatch} /></div>{#if useBatch}<div class="settings-grid"><label class="field"><span>Emails per batch</span><input type="number" min="1" max="1000" bind:value={batchSize} /></label><label class="field"><span>Delay between emails (sec)</span><input type="number" min="0" bind:value={emailDelay} /></label><label class="field"><span>Delay between batches (min)</span><input type="number" min="0" bind:value={batchDelay} /></label></div>{:else}<label class="field compact-field"><span>Delay between emails (sec)</span><input type="number" min="0" bind:value={sendDelay} /></label>{/if}<div class="option-rule"></div><div class="toggle-row"><label for="schedule-mode">Schedule for later</label><input id="schedule-mode" class="switch" type="checkbox" bind:checked={scheduleCampaign} /></div>{#if scheduleCampaign}<div class="settings-grid"><label class="field"><span>Date and time</span><input type="datetime-local" bind:value={scheduledTime} required /></label><label class="field"><span>Completion notification email</span><input type="email" bind:value={notifyEmail} placeholder="optional" /></label><label class="toggle-row notify-browser"><span>Browser notification</span><input class="switch" type="checkbox" bind:checked={notifyBrowser} /></label></div>{/if}</div></article>
              <div class="send-summary"><span class="eyebrow">READY TO SEND</span><div class="summary-count display-font">{chosenCount.toLocaleString()} <small>recipients</small></div><div class="summary-line"><span>Mailbox</span><strong>{smtpConfigs.find((config) => config.id === selectedConfigId)?.name ?? 'Not selected'}</strong></div><div class="summary-line"><span>Delivery</span><strong>{scheduleCampaign ? 'Scheduled' : useBatch ? 'Batch mode' : 'Immediate'}</strong></div><button class="primary-button send-button" type="submit" disabled={busy || !smtpConfigs.length || !excelFile}>{#if busy}<LoaderCircle size={17} class="spin" />{:else}<Send size={16} />{/if}{scheduleCampaign ? 'Schedule campaign' : 'Start sending'}</button><small class="safe-note"><ShieldCheck size={13} /> Sending uses your selected SMTP account.</small></div>
            </aside>
          </form>
        {:else if activeTab === 'mailboxes'}
          <section class="page-intro"><div><div class="eyebrow">SENDER IDENTITY / SMTP</div><h1 class="display-font">Mailboxes</h1><p>Manage the SMTP accounts used by your campaigns.</p></div><button class="primary-button" onclick={() => openConfig()}><Plus size={17} /> Add mailbox</button></section>
          <div class="mailbox-intro"><div class="notice info"><ShieldCheck size={17} /><span>Mailbox credentials are stored by the existing backend. Passwords are never shown after saving.</span></div></div>
          {#if smtpConfigs.length}
            <section class="mailbox-grid">{#each smtpConfigs as config (config.id)}<article class="mailbox-card"><div class="mailbox-card-top"><div class="mailbox-provider"><span class="provider-icon"><Mail size={19} /></span><div><h2>{config.name}</h2><span>{config.host}:{config.port}</span></div></div>{#if config.isDefault}<span class="badge"><Check size={12} /> DEFAULT</span>{/if}</div><div class="mailbox-address"><span>FROM ADDRESS</span><strong>{config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail}</strong></div><div class="mailbox-account"><span>ACCOUNT</span><strong>{config.user}</strong></div><div class="mailbox-card-footer"><button class="secondary-button" onclick={() => openConfig(config)}>Edit</button>{#if !config.isDefault}<button class="text-button" onclick={() => setDefault(config)}>Set as default</button>{/if}<button class="icon-button delete-config" title="Delete mailbox" aria-label="Delete mailbox" onclick={() => deleteConfig(config)}><Trash2 size={15} /></button></div></article>{/each}</section>
          {:else}
            <article class="panel mailbox-empty"><div class="empty-state"><span class="idle-ring"><Mail size={22} /></span><strong>No mailboxes yet</strong><span>Add an SMTP account to start a campaign.</span><button class="primary-button" onclick={() => openConfig()}><Plus size={16} /> Add first mailbox</button></div></article>
          {/if}
        {:else}
          <section class="page-intro"><div><div class="eyebrow">DELIVERY / HISTORY</div><h1 class="display-font">Reports</h1><p>Review delivery outcomes and export your email logs.</p></div><button class="secondary-button" onclick={loadReports}><RefreshCw size={15} /> Refresh</button></section>
          <section class="report-metrics"><article class="report-metric"><span>Total logged</span><strong>{Math.round($totalValue).toLocaleString()}</strong></article><article class="report-metric"><span>Sent successfully</span><strong class="green-text">{Math.round($sentValue).toLocaleString()}</strong></article><article class="report-metric"><span>Failed</span><strong class="red-text">{Math.round($failedValue).toLocaleString()}</strong></article><article class="report-metric"><span>Errors</span><strong class="amber-text">{Math.round($errorValue).toLocaleString()}</strong></article></section>
          <article class="panel report-panel"><div class="panel-heading report-toolbar"><div><span class="eyebrow">DELIVERY LOG</span><h2>{filteredLogs.length.toLocaleString()} records</h2></div><div class="report-actions"><label class="search-wrap"><Search size={16} /><input bind:value={reportSearch} placeholder="Search recipients, subject…" aria-label="Search delivery logs" /></label><button class="secondary-button export-button" onclick={() => exportReport('csv')}><ArrowDownToLine size={15} /> CSV</button><button class="secondary-button export-button" onclick={() => exportReport('json')}><ArrowDownToLine size={15} /> JSON</button><button class="icon-button clear-button" title="Clear all logs" aria-label="Clear all logs" onclick={clearReport}><Trash2 size={15} /></button></div></div>
            {#if filteredLogs.length}<div class="table-wrap"><table><thead><tr><th>Recipient</th><th>Status</th><th>First name</th><th>Company</th><th>Subject</th><th>Timestamp</th><th>Message</th></tr></thead><tbody>{#each filteredLogs as log}<tr><td class="recipient-cell">{log.email}</td><td><span class="badge" class:failed={['failed', 'error'].includes(log.status.toLowerCase())}>{log.status}</span></td><td>{log.firstName || '—'}</td><td>{log.company || '—'}</td><td>{log.subject || '—'}</td><td>{new Date(log.timestamp).toLocaleString()}</td><td class="message-cell" title={log.message}>{log.message || '—'}</td></tr>{/each}</tbody></table></div>{:else}<div class="empty-state"><span class="idle-ring"><FileText size={21} /></span><strong>{reportSearch ? 'No matching deliveries' : 'No delivery history yet'}</strong><span>{reportSearch ? 'Try another recipient, company, or subject.' : 'Your email activity will appear here after a campaign.'}</span></div>{/if}
          </article>
        {/if}
      </div>
      <footer class="page-footer"><span>LETTERPRESS</span><span>PRIVATE MAIL OPERATIONS</span><span>v2.1</span></footer>
    </main>
  </div>
{:else}
  <div class="loading-screen">Redirecting to sign in…</div>
{/if}

{#if configModalOpen}
  <div class="modal-backdrop" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) configModalOpen = false; }}>
    <div class="config-modal" role="dialog" aria-modal="true" aria-labelledby="config-title" tabindex="-1">
      <div class="modal-head"><div><span class="eyebrow">SMTP ACCOUNT</span><h2 id="config-title">{editingConfig ? 'Edit mailbox' : 'Add mailbox'}</h2></div><button class="icon-button" aria-label="Close dialog" onclick={() => (configModalOpen = false)}><X size={18} /></button></div>
      <form onsubmit={saveConfig}><div class="modal-fields"><label class="field"><span>Mailbox name</span><input bind:value={configForm.name} placeholder="Work account" required /></label><div class="form-row"><label class="field"><span>SMTP host</span><input bind:value={configForm.host} placeholder="smtp.example.com" required /></label><label class="field port-field"><span>Port</span><input type="number" bind:value={configForm.port} min="1" max="65535" required /></label></div><label class="field"><span>Username</span><input bind:value={configForm.user} autocomplete="off" required /></label><label class="field"><span>{editingConfig ? 'New password (optional)' : 'Password'}</span><input type="password" bind:value={configForm.pass} autocomplete="new-password" required={!editingConfig} placeholder={editingConfig ? 'Leave blank to keep current' : 'SMTP password or app password'} /></label><div class="form-row"><label class="field"><span>From email</span><input type="email" bind:value={configForm.fromEmail} required /></label><label class="field"><span>From name</span><input bind:value={configForm.fromName} /></label></div><div class="toggle-row tls-row"><label for="smtp-secure">Use secure connection (SSL/TLS)</label><input id="smtp-secure" class="switch" type="checkbox" bind:checked={configForm.secure} /></div><div class="toggle-row"><label for="smtp-default">Set as default mailbox</label><input id="smtp-default" class="switch" type="checkbox" bind:checked={configForm.isDefault} /></div></div><div class="modal-actions"><button class="secondary-button" type="button" onclick={testConfig} disabled={busy}>{#if busyAction === 'test'}<LoaderCircle size={15} class="spin" />{:else}<RefreshCw size={15} />{/if} Test connection</button><span class="modal-actions-spacer"></span><button class="secondary-button" type="button" onclick={() => (configModalOpen = false)}>Cancel</button><button class="primary-button" type="submit" disabled={busy}>{#if busyAction === 'config'}<LoaderCircle size={15} class="spin" />{/if}Save mailbox</button></div></form>
    </div>
  </div>
{/if}

{#if showPreview}
  <div class="modal-backdrop preview-backdrop" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) showPreview = false; }}>
    <div class="preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-title" tabindex="-1"><div class="modal-head"><div><span class="eyebrow">MESSAGE PREVIEW</span><h2 id="preview-title">{subject || 'Untitled campaign'}</h2></div><button class="icon-button" aria-label="Close preview" onclick={() => (showPreview = false)}><X size={18} /></button></div><iframe title="Email message preview" sandbox="" srcdoc={htmlTemplate ? 'Preview for uploaded templates is available when the campaign is sent.' : htmlContent || '<p>Start writing your message to preview it.</p>'}></iframe></div>
  </div>
{/if}

{#if toast}<div class="toast" class:error={toastError} role="status">{#if toastError}<AlertCircle size={17} />{:else}<CheckCircle2 size={17} />{/if}{toast}</div>{/if}

<style>
  .loading-screen { display: flex; min-height: 100vh; align-items: center; justify-content: center; gap: 12px; color: #68766d; font-size: .86rem; }
  .loading-mark { display: grid; width: 40px; height: 40px; place-items: center; border-radius: 7px; color: #173025; background: #a6dfbc; }
  :global(.spin) { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .workspace { display: grid; min-height: 100vh; grid-template-columns: 238px minmax(0, 1fr); }
  .sidebar { position: sticky; top: 0; display: flex; height: 100vh; flex-direction: column; padding: 24px 15px 18px; color: #e7f0e9; background: var(--forest); }
  .brand { display: flex; align-items: center; gap: 9px; padding: 0 7px 31px; color: white; text-decoration: none; font: 600 1.06rem 'Space Grotesk', sans-serif; }
  .brand .brand-mark { width: 31px; height: 31px; }
  .edition { align-self: center; margin-left: auto; color: #8eaa97; font: 700 .56rem 'DM Sans', sans-serif; letter-spacing: .08em; }
  .sidebar-label { padding: 0 11px 10px; color: #73917c; font-size: .59rem; font-weight: 700; letter-spacing: .11em; }
  .sidebar nav { display: grid; gap: 4px; }
  .sidebar nav button { display: flex; min-height: 43px; align-items: center; gap: 12px; padding: 0 11px; border: 0; border-radius: 5px; color: #b2c6b8; background: transparent; text-align: left; font-size: .81rem; }
  .sidebar nav button:hover { color: white; background: #ffffff0c; }
  .sidebar nav button.active { color: #f4fff7; background: #ffffff17; box-shadow: inset 2px 0 #92d4a9; }
  .nav-count { margin-left: auto; color: #8da897; font: 600 .66rem 'Space Grotesk', sans-serif; }
  .sidebar-bottom { margin-top: auto; }
  .sidebar-rule { height: 1px; margin: 0 5px 17px; background: #ffffff1a; }
  .sidebar-user { display: flex; align-items: center; gap: 9px; padding: 0 5px; }
  .avatar, .top-avatar { display: grid; width: 32px; height: 32px; flex: 0 0 auto; place-items: center; border-radius: 50%; color: #18412d; background: #bde2c8; font: 700 .8rem 'Space Grotesk', sans-serif; }
  .sidebar-user-copy { display: grid; min-width: 0; gap: 3px; }
  .sidebar-user-copy strong { overflow: hidden; color: #eff7f0; font-size: .72rem; text-overflow: ellipsis; white-space: nowrap; }
  .sidebar-user-copy span { overflow: hidden; color: #8fa998; font-size: .62rem; text-overflow: ellipsis; white-space: nowrap; }
  .side-logout { display: grid; width: 29px; height: 29px; flex: 0 0 auto; place-items: center; margin-left: auto; border: 0; border-radius: 4px; color: #9bb2a2; background: transparent; }
  .side-logout:hover { color: white; background: #ffffff12; }
  .secure-label { display: flex; align-items: center; gap: 7px; padding: 17px 5px 0; color: #6f8c79; font-size: .56rem; font-weight: 700; letter-spacing: .08em; }
  .main-area { min-width: 0; }
  .topbar { position: sticky; z-index: 4; top: 0; display: flex; height: 62px; align-items: center; justify-content: space-between; padding: 0 34px; border-bottom: 1px solid var(--line); background: #f8faf8ed; backdrop-filter: blur(14px); }
  .crumb { display: flex; align-items: center; gap: 10px; color: #89948d; font-size: .76rem; }
  .crumb strong { color: #38473e; font-weight: 700; }
  .crumb-slash { color: #c0c9c2; }
  .topbar-right { display: flex; align-items: center; gap: 15px; }
  .server-state { display: flex; align-items: center; gap: 7px; color: #738077; font-size: .7rem; }
  .server-state i { width: 7px; height: 7px; border-radius: 50%; background: #46a873; box-shadow: 0 0 0 3px #46a87320; animation: live-pulse 2s ease-out infinite; }
  .server-state.offline i { background: #c94b43; box-shadow: 0 0 0 3px #c94b4320; animation: none; }
  .server-state.checking i { background: #c58a30; box-shadow: 0 0 0 3px #c58a3020; animation: none; }
  .sync-time { color: #9aa49d; font-size: .66rem; }
  @keyframes live-pulse { 50% { box-shadow: 0 0 0 5px #46a8730a; } }
  .top-avatar { width: 30px; height: 30px; }
  .page-content { width: min(100%, 1390px); margin: 0 auto; padding: 30px 34px 35px; }
  .page-intro { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 22px; }
  .page-intro .eyebrow { margin-bottom: 9px; }
  .page-intro h1 { margin: 0; font-size: 1.82rem; line-height: 1.12; letter-spacing: 0; }
  .page-intro p { margin: 7px 0 0; color: var(--muted); font-size: .83rem; }
  .metric-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 13px; margin-bottom: 17px; }
  .metric-card { min-height: 126px; padding: 16px 17px 14px; border: 1px solid var(--line); border-radius: 6px; background: white; }
  .metric-top { display: flex; align-items: center; justify-content: space-between; color: #69776e; font-size: .73rem; font-weight: 600; }
  .metric-icon { display: grid; width: 30px; height: 30px; place-items: center; border-radius: 5px; }
  .metric-icon.green { color: #198258; background: #e0f2e6; }
  .metric-icon.coral { color: #cf6044; background: #fae8e0; }
  .metric-icon.amber { color: #a76a1b; background: #fbf0d9; }
  .metric-icon.dark { color: #456452; background: #e8eeea; }
  .metric-card > strong { display: block; margin-top: 7px; color: #23342a; font-size: 1.75rem; line-height: 1.1; }
  .metric-card > small { display: block; overflow: hidden; margin-top: 5px; color: #879289; font-size: .68rem; text-overflow: ellipsis; white-space: nowrap; }
  .positive, .green-text { color: #21855b !important; }
  .overview-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(330px, .8fr); gap: 15px; margin-bottom: 17px; }
  .activity-panel, .scheduled-panel { min-height: 260px; }
  .panel-heading h2 { margin-top: 4px; }
  .panel-heading > .badge { margin-left: auto; }
  .activity-panel > .panel-heading, .scheduled-panel > .panel-heading { min-height: 68px; }
  .batch-body { display: grid; gap: 16px; }
  .batch-readout { display: flex; align-items: end; justify-content: space-between; }
  .batch-readout strong { display: block; color: var(--ink); font-size: 1.7rem; }
  .batch-readout strong span { color: #87948b; font-size: .96rem; }
  .batch-readout small { color: var(--muted); font-size: .72rem; }
  .batch-pct { color: var(--green); font: 600 1.2rem 'Space Grotesk', sans-serif; }
  .batch-footer { display: flex; align-items: center; justify-content: space-between; color: var(--muted); font-size: .73rem; }
  .inline-actions { display: flex; gap: 6px; }
  .stop-button:hover { color: var(--danger); border-color: #e4b0ac; }
  .idle-ring { display: grid; width: 42px; height: 42px; place-items: center; margin-bottom: 2px; border: 1px solid #dce8df; border-radius: 50%; color: #759381; background: #f4f8f5; }
  .empty-state .text-button { display: inline-flex; align-items: center; gap: 5px; margin-top: 4px; font-size: .76rem; }
  .empty-state.short { min-height: 145px; }
  .job-list { padding: 3px 17px 0; }
  .job-row { display: flex; align-items: center; gap: 10px; min-height: 48px; border-bottom: 1px solid #edf1ee; }
  .job-row:last-child { border: 0; }
  .job-clock { display: grid; width: 30px; height: 30px; flex: 0 0 auto; place-items: center; border-radius: 5px; color: #4b805f; background: #e7f2e9; }
  .job-info { display: grid; min-width: 0; flex: 1; gap: 3px; }
  .job-info strong { overflow: hidden; color: #36453b; font-size: .73rem; text-overflow: ellipsis; white-space: nowrap; }
  .job-info span { color: #89948d; font-size: .64rem; }
  .job-row .badge { font-size: .6rem; }
  .job-cancel { width: 29px; height: 29px; }
  .scheduled-cta { display: flex; width: 100%; align-items: center; justify-content: space-between; padding: 12px 18px; border: 0; border-top: 1px solid var(--line); color: var(--green); background: transparent; text-align: left; font-size: .73rem; font-weight: 700; }
  .scheduled-cta:hover { background: #f8fbf8; }
  .recent-panel .panel-heading { min-height: 67px; }
  .recent-panel td { white-space: nowrap; }
  .recipient-cell { color: #2f4938; font-weight: 600; }
  .status-dot { display: inline-block; width: 7px; height: 7px; margin-right: 7px; border-radius: 50%; background: #dda84e; }
  .status-dot.sent { background: #39a16b; }
  .empty-inline { padding: 24px 19px; color: var(--muted); font-size: .8rem; }
  .page-footer { display: flex; justify-content: space-between; padding: 0 34px 19px; color: #9aa59d; font-size: .59rem; font-weight: 700; letter-spacing: .07em; }
  .page-footer span:first-child { color: #607065; }
  .compose-layout { display: grid; grid-template-columns: minmax(0, 1fr) 315px; align-items: start; gap: 16px; }
  .compose-main { display: grid; gap: 14px; }
  .compose-section .panel-heading { min-height: 72px; }
  .compose-section .panel-heading p { margin: 4px 0 0; color: var(--muted); font-size: .72rem; }
  .section-title { display: flex; align-items: center; gap: 11px; }
  .section-number { display: grid; width: 30px; height: 30px; flex: 0 0 auto; place-items: center; border: 1px solid #dce9df; border-radius: 50%; color: var(--green); background: #f5faf6; font: 600 .72rem 'Space Grotesk', sans-serif; }
  .compose-section .panel-body { display: grid; gap: 17px; }
  .subject-field { margin-top: 3px; }
  .small-action { min-height: 34px; padding: 0 10px; font-size: .73rem; }
  .editor-frame { overflow: hidden; border: 1px solid #dce4de; border-radius: 5px; }
  #campaign-editor { min-height: 230px; border: 0; }
  :global(.ql-toolbar.ql-snow) { border: 0; border-bottom: 1px solid var(--line); background: #f8faf8; }
  :global(.ql-container.ql-snow) { min-height: 190px; border: 0; font: .88rem/1.6 'DM Sans', sans-serif; }
  :global(.ql-editor) { min-height: 190px; padding: 17px; }
  .template-upload { display: flex; align-items: center; gap: 8px; }
  .upload-inline { display: inline-flex; align-items: center; gap: 7px; color: var(--green); font-size: .73rem; font-weight: 700; cursor: pointer; }
  .upload-inline:hover { color: var(--green-dark); }
  .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; clip-path: inset(50%); }
  .sample-link { display: inline-flex; align-items: center; gap: 6px; color: var(--green); text-decoration: none; font-size: .72rem; font-weight: 700; }
  .sample-link:hover { text-decoration: underline; }
  .drop-zone { display: flex; min-height: 125px; flex-direction: column; align-items: center; justify-content: center; gap: 7px; border: 1px dashed #bfd4c4; border-radius: 5px; background: #f9fcfa; cursor: pointer; }
  .drop-zone:hover { border-color: var(--green); background: #f3faf5; }
  .upload-icon { display: grid; width: 36px; height: 36px; place-items: center; border-radius: 50%; color: #42835c; background: #e8f4eb; }
  .drop-zone strong { color: #415247; font-size: .78rem; }
  .drop-zone small { color: #8c9890; font-size: .67rem; }
  .audience-summary { display: flex; align-items: center; gap: 15px; padding: 13px; border: 1px solid var(--line); border-radius: 5px; background: #fafcfb; }
  .audience-summary > div:first-child { display: flex; align-items: center; gap: 6px; color: #738078; font-size: .72rem; }
  .audience-summary > div:first-child strong { color: var(--green); font: 700 1rem 'Space Grotesk', sans-serif; }
  .range-select { display: flex; align-items: center; gap: 8px; margin-left: auto; color: #77847b; font-size: .7rem; }
  .range-select select { max-width: 145px; min-height: 34px; padding: 0 8px; border: 1px solid #dce4de; border-radius: 4px; color: #3c4c41; background: white; font-size: .7rem; }
  .range-field { width: 128px; }
  .range-field label, .range-custom .field span { color: #77847b; font-size: .65rem; }
  .range-field input, .range-custom input { min-height: 34px; padding: 6px 8px; font-size: .72rem; }
  .range-custom { display: flex; align-items: end; gap: 8px; }
  .range-custom .field { width: 82px; }
  .range-dash { padding-bottom: 10px; color: #839088; }
  .preview-caption { padding: 4px 0 8px; color: #87938a; font-size: .6rem; font-weight: 700; letter-spacing: .08em; }
  .contact-preview { overflow: hidden; border: 1px solid var(--line); border-radius: 5px; }
  .contact-preview .preview-caption { padding: 10px 12px 8px; }
  .contact-preview th, .contact-preview td { padding: 8px 12px; font-size: .68rem; }
  .compose-side { position: sticky; top: 78px; display: grid; gap: 13px; }
  .compose-side .panel-heading { min-height: 65px; }
  :global(.heading-icon) { color: #819087; }
  .send-panel .panel-body { padding: 11px 17px 16px; }
  .toggle-row { border-bottom: 1px solid #edf1ee; }
  .toggle-row label { color: #435249; font-size: .76rem; }
  .settings-grid { display: grid; gap: 12px; padding: 13px 0; }
  .settings-grid .field { gap: 6px; }
  .settings-grid .field span { color: #7a867e; font-size: .66rem; }
  .settings-grid input { min-height: 37px; padding: 7px 9px; font-size: .73rem; }
  .compact-field { padding: 13px 0; }
  .compact-field > span { color: #7a867e; font-size: .68rem; }
  .compact-field input { min-height: 37px; }
  .option-rule { border-top: 1px solid #edf1ee; }
  .notify-browser { justify-content: start; border: 0; }
  .send-summary { display: grid; gap: 12px; padding: 18px; border: 1px solid #d5e4d8; border-radius: 6px; background: #f6fbf7; }
  .summary-count { color: #1d3828; font-size: 1.55rem; font-weight: 600; }
  .summary-count small { color: #728078; font: 500 .73rem 'DM Sans', sans-serif; }
  .summary-line { display: flex; align-items: center; justify-content: space-between; gap: 9px; color: #7b8980; font-size: .7rem; }
  .summary-line strong { overflow: hidden; color: #3a4b40; text-overflow: ellipsis; white-space: nowrap; }
  .send-button { width: 100%; margin-top: 3px; }
  .safe-note { display: flex; align-items: center; justify-content: center; gap: 5px; color: #829087; font-size: .63rem; }
  :global(.back-arrow) { transform: rotate(180deg); }
  .mailbox-intro { margin-bottom: 17px; }
  .mailbox-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
  .mailbox-card { padding: 18px; border: 1px solid var(--line); border-radius: 6px; background: white; }
  .mailbox-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
  .mailbox-provider { display: flex; align-items: center; gap: 11px; min-width: 0; }
  .provider-icon { display: grid; width: 39px; height: 39px; flex: 0 0 auto; place-items: center; border-radius: 6px; color: #26744d; background: #e6f2e9; }
  .mailbox-provider h2 { overflow: hidden; margin: 0 0 4px; color: #26382d; font: 600 .96rem 'Space Grotesk', sans-serif; text-overflow: ellipsis; white-space: nowrap; }
  .mailbox-provider span:not(.provider-icon) { color: #849087; font-size: .7rem; }
  .mailbox-address, .mailbox-account { display: grid; gap: 5px; margin-top: 19px; }
  .mailbox-address > span, .mailbox-account > span { color: #8a968e; font-size: .59rem; font-weight: 700; letter-spacing: .07em; }
  .mailbox-address strong, .mailbox-account strong { overflow: hidden; color: #47564c; font-size: .75rem; text-overflow: ellipsis; white-space: nowrap; }
  .mailbox-card-footer { display: flex; align-items: center; gap: 12px; margin-top: 20px; padding-top: 14px; border-top: 1px solid #edf1ee; }
  .mailbox-card-footer .secondary-button { min-height: 33px; padding: 0 12px; font-size: .72rem; }
  .mailbox-card-footer .text-button { font-size: .71rem; }
  .delete-config { width: 33px; height: 33px; margin-left: auto; }
  .delete-config:hover { color: var(--danger); border-color: #e6bfbb; }
  .mailbox-empty { padding: 22px; }
  .mailbox-empty .primary-button { margin-top: 5px; }
  .report-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
  .report-metric { display: grid; gap: 10px; padding: 15px 16px; border: 1px solid var(--line); border-radius: 5px; background: white; }
  .report-metric span { color: #7c8980; font-size: .7rem; }
  .report-metric strong { color: #26382c; font: 600 1.45rem 'Space Grotesk', sans-serif; }
  .red-text { color: #c44e47 !important; }
  .amber-text { color: #b27420 !important; }
  .report-panel .panel-heading { min-height: 76px; }
  .report-toolbar { flex-wrap: wrap; }
  .report-toolbar h2 { font-size: .94rem; }
  .report-actions { display: flex; align-items: center; gap: 7px; }
  .search-wrap { position: relative; display: flex; width: min(270px, 28vw); align-items: center; }
  .search-wrap :global(svg) { position: absolute; left: 10px; color: #859189; }
  .search-wrap input { width: 100%; height: 35px; padding: 0 10px 0 33px; border: 1px solid var(--line); border-radius: 5px; outline: none; font-size: .7rem; }
  .search-wrap input:focus { border-color: #78b695; }
  .export-button { min-height: 35px; padding: 0 10px; font-size: .69rem; }
  .clear-button:hover { color: var(--danger); border-color: #e6bfbb; }
  .message-cell { max-width: 185px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .modal-backdrop { position: fixed; z-index: 20; inset: 0; display: grid; place-items: center; overflow-y: auto; padding: 20px; background: #13271fb5; backdrop-filter: blur(3px); }
  .config-modal, .preview-modal { width: min(100%, 600px); max-height: min(92vh, 850px); overflow-y: auto; border-radius: 7px; background: white; box-shadow: 0 20px 70px #06150c35; animation: modal-in .18s ease-out; }
  @keyframes modal-in { from { opacity: 0; transform: translateY(8px) scale(.99); } to { opacity: 1; transform: translateY(0) scale(1); } }
  .modal-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 19px 22px; border-bottom: 1px solid var(--line); }
  .modal-head h2 { margin: 5px 0 0; color: #26372d; font: 600 1.15rem 'Space Grotesk', sans-serif; }
  .modal-fields { display: grid; gap: 13px; padding: 20px 22px; }
  .form-row { display: grid; grid-template-columns: 1.3fr .7fr; gap: 13px; }
  .port-field { max-width: 140px; }
  .tls-row { border-bottom: 1px solid #edf1ee; }
  .modal-actions { display: flex; align-items: center; gap: 8px; padding: 14px 22px; border-top: 1px solid var(--line); background: #fafcfb; }
  .modal-actions .secondary-button, .modal-actions .primary-button { min-height: 36px; padding: 0 11px; font-size: .72rem; }
  .modal-actions-spacer { flex: 1; }
  .preview-modal { width: min(100%, 780px); }
  .preview-modal iframe { display: block; width: calc(100% - 40px); height: min(64vh, 560px); margin: 20px; border: 1px solid var(--line); border-radius: 4px; background: white; }
  .toast.error { background: #9f3e37; }
  @media (max-width: 1100px) {
    .workspace { grid-template-columns: 210px minmax(0, 1fr); }
    .page-content { padding-right: 22px; padding-left: 22px; }
    .topbar { padding: 0 22px; }
    .compose-layout { grid-template-columns: minmax(0, 1fr) 285px; gap: 12px; }
    .audience-summary { flex-wrap: wrap; }
    .range-select { margin-left: 0; }
    .report-actions { flex-wrap: wrap; justify-content: flex-end; }
  }
  @media (max-width: 860px) {
    .workspace { display: block; }
    .sidebar { position: sticky; z-index: 5; top: 0; display: flex; width: 100%; height: auto; flex-direction: row; align-items: center; padding: 0 16px; }
    .brand { flex: 0 0 auto; padding: 12px 10px 12px 0; }
    .edition, .sidebar-label, .sidebar-bottom { display: none; }
    .sidebar nav { display: flex; flex: 1; justify-content: flex-end; overflow-x: auto; padding: 8px 0; }
    .sidebar nav button { min-height: 37px; gap: 7px; padding: 0 10px; font-size: .72rem; white-space: nowrap; }
    .sidebar nav button :global(svg) { width: 15px; }
    .nav-count { display: none; }
    .topbar { height: 53px; }
    .overview-grid { grid-template-columns: minmax(0, 1fr) minmax(280px, .9fr); }
    .compose-layout { grid-template-columns: minmax(0, 1fr); }
    .compose-side { position: static; grid-template-columns: minmax(0, 1fr) minmax(230px, .8fr); align-items: start; }
    .send-summary { position: sticky; top: 70px; }
  }
  @media (max-width: 640px) {
    .sidebar { overflow: hidden; padding: 0 10px; }
    .brand { gap: 7px; padding-right: 8px; font-size: .88rem; }
    .brand .brand-mark { width: 28px; height: 28px; }
    .sidebar nav { justify-content: flex-start; }
    .sidebar nav button { min-width: 36px; justify-content: center; padding: 0 8px; font-size: 0; }
    .sidebar nav button :global(svg) { width: 17px; height: 17px; }
    .topbar { padding: 0 14px; }
    .server-state { display: none; }
    .page-content { padding: 23px 14px 27px; }
    .page-intro { align-items: flex-start; }
    .page-intro h1 { font-size: 1.52rem; }
    .page-intro p { max-width: 270px; font-size: .75rem; line-height: 1.5; }
    .page-intro > .primary-button, .page-intro > .secondary-button { min-height: 36px; gap: 5px; padding: 0 10px; font-size: .7rem; white-space: nowrap; }
    .metric-grid, .report-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .metric-card { min-height: 112px; padding: 12px; }
    .metric-card > strong { font-size: 1.5rem; }
    .metric-top { font-size: .66rem; }
    .metric-icon { width: 26px; height: 26px; }
    .overview-grid { grid-template-columns: minmax(0, 1fr); gap: 12px; }
    .activity-panel, .scheduled-panel { min-height: 0; }
    .panel-heading { padding: 14px; }
    .panel-body { padding: 15px; }
    .page-intro .eyebrow { font-size: .59rem; }
    .compose-side { grid-template-columns: minmax(0, 1fr); }
    .send-summary { position: static; }
    .audience-summary { align-items: flex-start; }
    .audience-summary > div:first-child { flex-wrap: wrap; }
    .range-select { width: 100%; justify-content: space-between; }
    .range-select select { max-width: none; }
    .range-custom { margin-left: auto; }
    .mailbox-grid { grid-template-columns: minmax(0, 1fr); }
    .report-toolbar { align-items: flex-start; }
    .report-actions { display: grid; width: 100%; grid-template-columns: 1fr auto auto auto; justify-content: stretch; }
    .search-wrap { width: auto; grid-column: 1 / -1; }
    .report-actions .clear-button { justify-self: end; }
    .report-panel .panel-heading { min-height: 0; }
    .report-metric { padding: 12px; }
    .report-metric strong { font-size: 1.25rem; }
    .page-footer { padding: 0 14px 15px; font-size: .52rem; }
    .page-footer span:nth-child(2) { display: none; }
    .modal-backdrop { align-items: end; padding: 0; }
    .config-modal, .preview-modal { width: 100%; max-height: 94vh; border-radius: 9px 9px 0 0; }
    .modal-fields { padding: 16px; }
    .modal-head { padding: 16px; }
    .modal-actions { flex-wrap: wrap; padding: 12px 16px; }
    .modal-actions .secondary-button, .modal-actions .primary-button { flex: 1; }
    .modal-actions-spacer { display: none; }
    .form-row { gap: 9px; }
    .toast { right: 12px; bottom: 12px; }
  }
</style>