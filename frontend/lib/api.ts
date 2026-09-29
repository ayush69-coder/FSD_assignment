export interface ApiResult<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface SmtpConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  fromEmail: string;
  fromName?: string;
  isDefault: boolean;
  createdAt?: string;
}

export interface Contact {
  [key: string]: string | number | null | undefined;
}

export interface EmailLog {
  email: string;
  status: string;
  firstName?: string;
  company?: string;
  subject?: string;
  timestamp: string;
  messageId?: string;
  message?: string;
}

export interface EmailStats {
  total: number;
  sent: number;
  failed: number;
  errors: number;
}

export interface ScheduledJob {
  id: string;
  status: string;
  scheduled_time?: string;
  scheduledTime?: string;
  scheduledAt?: string;
  contact_count?: number;
  contactCount?: number;
  subject?: string;
  config_name?: string;
  configName?: string;
  [key: string]: unknown;
}

export interface BatchStatus {
  isRunning: boolean;
  currentJob?: {
    status?: string;
    totalContacts?: number;
    currentBatch?: number;
    totalBatches?: number;
    emailsSent?: number;
    emailsFailed?: number;
  } | null;
  totalJobs?: number;
  completedJobs?: number;
  [key: string]: unknown;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options
  });

  const contentType = response.headers.get('content-type') ?? '';
  const result: unknown = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof result === 'object' && result !== null && 'message' in result
        ? String(result.message)
        : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return result as T;
}