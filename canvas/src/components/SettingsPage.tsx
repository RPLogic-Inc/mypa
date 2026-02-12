import { useState, useEffect, useCallback } from 'react';
import { userSettings, teamSettingsApi, invitesApi, teamInvitesApi, crm, channels, admin, ApiError } from '../services/api';
import type { TeamInvite, ProvisioningJob } from '../types';

interface SettingsPageProps {
  onBack: () => void;
  onLogout: () => void;
  currentUserName: string;
}

type SettingsSection = 'profile' | 'pa' | 'team' | 'sharing' | 'openclaw' | 'channels_admin' | 'health' | 'provisioning' | 'account';

type SectionGroup = { label: string; sections: SettingsSection[] };

const SECTION_LABELS: Record<SettingsSection, string> = {
  profile: 'Profile',
  pa: 'My PA',
  team: 'Members & Invites',
  sharing: 'Sharing',
  openclaw: 'OpenClaw',
  channels_admin: 'Channels',
  health: 'System Health',
  provisioning: 'Provisioning',
  account: 'Account',
};

export function SettingsPage({ onBack, onLogout, currentUserName }: SettingsPageProps) {
  const [section, setSection] = useState<SettingsSection>('profile');
  const [isAdmin, setIsAdmin] = useState(false);

  // Probe admin status by trying the providers endpoint
  useEffect(() => {
    channels.providers()
      .then(() => setIsAdmin(true))
      .catch(() => setIsAdmin(false));
  }, []);

  const sectionGroups: SectionGroup[] = [
    { label: 'User', sections: ['profile', 'pa', 'account'] },
    { label: 'Team', sections: ['team', 'sharing'] },
    ...(isAdmin ? [{ label: 'Admin', sections: ['openclaw' as SettingsSection, 'channels_admin' as SettingsSection, 'health' as SettingsSection, 'provisioning' as SettingsSection] }] : []),
  ];

  return (
    <div className="flex-1 flex h-full">
      {/* Settings sidebar */}
      <div className="w-52 border-r border-zinc-200 dark:border-zinc-800 flex flex-col bg-zinc-50 dark:bg-zinc-900/50 shrink-0">
        <div className="p-3 border-b border-zinc-200 dark:border-zinc-800">
          <button onClick={onBack} className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            Settings
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {sectionGroups.map(group => (
            <div key={group.label} className="mb-3">
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider px-3 py-1">{group.label}</p>
              {group.sections.map(s => (
                <button
                  key={s}
                  onClick={() => setSection(s)}
                  className={`w-full text-left px-3 py-1.5 rounded-lg mb-0.5 text-sm ${
                    section === s
                      ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300'
                      : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  {SECTION_LABELS[s]}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Settings content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl">
          {section === 'profile' && <ProfileSection currentUserName={currentUserName} />}
          {section === 'pa' && <PASection />}
          {section === 'team' && <TeamSection />}
          {section === 'sharing' && <MirrorSection />}
          {section === 'openclaw' && isAdmin && <OpenClawSection />}
          {section === 'channels_admin' && isAdmin && <ChannelProvidersSection />}
          {section === 'health' && isAdmin && <IntegrationHealthSection />}
          {section === 'provisioning' && isAdmin && <ProvisioningSection />}
          {section === 'account' && <AccountSection onLogout={onLogout} />}
        </div>
      </div>
    </div>
  );
}

// --- Section Components ---

function ProfileSection({ currentUserName }: { currentUserName: string }) {
  const [name, setName] = useState(currentUserName);
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarPreviewOk, setAvatarPreviewOk] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwMessage, setPwMessage] = useState('');

  useEffect(() => {
    userSettings.me().then(data => {
      const u = data as Record<string, unknown>;
      if (u.name) setName(u.name as string);
      if (u.email) setEmail(u.email as string);
      if (u.avatarUrl) setAvatarUrl(u.avatarUrl as string);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setAvatarPreviewOk(true);
  }, [avatarUrl]);

  const saveProfile = async () => {
    setSaving(true);
    setMessage('');
    try {
      await userSettings.updateProfile({
        name,
        ...(avatarUrl.trim() ? { avatarUrl: avatarUrl.trim() } : {}),
      });
      setMessage('Saved');
    } catch { setMessage('Failed to save'); }
    setSaving(false);
  };

  const changePassword = async () => {
    setPwMessage('');
    try {
      await userSettings.changePassword({ currentPassword, newPassword });
      setPwMessage('Password changed');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setPwMessage(err instanceof Error ? err.message : 'Failed');
    }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">My Profile</h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">Your name and avatar are visible to team members and appear on tezits you send.</p>
      <div className="space-y-4">
        <Field label="Name" value={name} onChange={setName} />
        <Field label="Email" value={email} disabled />
        <Field label="Avatar URL" value={avatarUrl} onChange={setAvatarUrl} placeholder="https://..." />
        {avatarUrl.trim() && avatarPreviewOk && (
          <div className="flex items-center gap-3">
            <img
              src={avatarUrl.trim()}
              alt="Avatar preview"
              className="w-10 h-10 rounded-full border border-zinc-200 dark:border-zinc-700 object-cover"
              onError={() => setAvatarPreviewOk(false)}
            />
            <p className="text-xs text-zinc-500">Preview</p>
          </div>
        )}
        <div className="flex items-center gap-2">
          <button onClick={saveProfile} disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save'}</button>
          {message && <span className="text-sm text-zinc-500">{message}</span>}
        </div>
      </div>
      <hr className="my-8 border-zinc-200 dark:border-zinc-800" />
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">Change Password</h3>
      <div className="space-y-3">
        <Field label="Current Password" value={currentPassword} onChange={setCurrentPassword} type="password" />
        <Field label="New Password" value={newPassword} onChange={setNewPassword} type="password" />
        <div className="flex items-center gap-2">
          <button onClick={changePassword} disabled={!currentPassword || newPassword.length < 8} className="btn-primary">Change Password</button>
          {pwMessage && <span className="text-sm text-zinc-500">{pwMessage}</span>}
        </div>
      </div>
    </div>
  );
}

function PASection() {
  const [prefs, setPrefs] = useState<Record<string, unknown>>({});
  const [modelOptions, setModelOptions] = useState<Array<{ value: string; label: string; description: string }>>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    userSettings.paPreferences().then(res => {
      setPrefs(res.data);
      setModelOptions(res.meta.modelOptions);
    }).catch(() => {});
  }, []);

  const save = async (updates: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await userSettings.updatePaPreferences(updates);
      setPrefs(res.data);
    } catch { /* ignore */ }
    setSaving(false);
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">My PA</h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">Configure how your PA behaves when responding to you.</p>
      <div className="space-y-5">
        <SelectField label="AI Model" value={String(prefs.model || 'auto')} options={modelOptions.map(o => ({ value: o.value, label: `${o.label} — ${o.description}` }))} onChange={v => save({ model: v })} />
        <RadioField label="Tone" value={String(prefs.tone || 'friendly')} options={['professional', 'friendly', 'casual']} onChange={v => save({ tone: v })} />
        <RadioField label="Response Style" value={String(prefs.responseStyle || 'balanced')} options={['concise', 'balanced', 'detailed']} onChange={v => save({ responseStyle: v })} />
        <Field label="PA Display Name" value={String(prefs.paDisplayName || '')} onChange={v => save({ paDisplayName: v })} placeholder="e.g. Jasper, Friday, etc." />
        <Toggle label="Read Responses Aloud" checked={!!prefs.autoReadResponses} onChange={v => save({ autoReadResponses: v })} description="Automatically speak PA responses using text-to-speech" />
      </div>
      {saving && <p className="text-xs text-zinc-400 mt-2">Saving...</p>}
    </div>
  );
}

function MirrorSection() {
  const [data, setData] = useState<Record<string, unknown>>({});

  useEffect(() => {
    teamSettingsApi.mirror().then(res => setData(res.data)).catch(() => {});
  }, []);

  const save = async (updates: Record<string, unknown>) => {
    try {
      const res = await teamSettingsApi.updateMirror(updates);
      setData(res.data);
    } catch { /* ignore */ }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Mirror Defaults</h2>
      <div className="rounded-lg border border-violet-200 dark:border-violet-900 bg-violet-50 dark:bg-violet-950/30 p-4 mb-6">
        <h3 className="text-sm font-semibold text-violet-800 dark:text-violet-200 mb-2">What is a Mirror?</h3>
        <p className="text-sm text-violet-700 dark:text-violet-300 mb-3">
          A Mirror is a lossy, read-only copy of a Tez for sharing outside the platform — via text, email, Slack, etc.
          Mirrors intentionally exclude deep context to protect sensitive information.
        </p>
        <div className="space-y-2 text-sm text-violet-600 dark:text-violet-400">
          <p><strong>Teaser</strong> — Brief preview only. Recipients know something exists.</p>
          <p><strong>Surface</strong> — Main message text. The default for most sharing.</p>
          <p><strong>Surface + Facts</strong> — Message plus verified facts from context.</p>
        </div>
        <p className="text-sm text-violet-600 dark:text-violet-400 mt-3">
          <strong>Deep Link</strong>: When enabled, mirrors include an interrogation link. Recipients can click it to ask
          questions about the Tez, answered strictly from the transmitted context using your AI resources.
        </p>
      </div>
      <div className="space-y-5">
        <Toggle label="Warning on Share" checked={data.mirrorWarningsEnabled !== false} onChange={v => save({ mirrorWarningsEnabled: v })} description="Show a warning before sharing Tez mirrors externally" />
        <SelectField label="Default Template" value={String(data.mirrorDefaultTemplate || 'surface')} options={[{ value: 'teaser', label: 'Teaser' }, { value: 'surface', label: 'Surface' }, { value: 'surface_facts', label: 'Surface + Facts' }]} onChange={v => save({ mirrorDefaultTemplate: v })} />
        <Toggle label="Append Deep Link" checked={data.mirrorAppendDeeplink !== false} onChange={v => save({ mirrorAppendDeeplink: v })} description="Include an interrogation link in shared mirrors" />
      </div>
    </div>
  );
}

function TeamSection() {
  const [invEmail, setInvEmail] = useState('');
  const [invName, setInvName] = useState('');
  const [inviting, setInviting] = useState(false);
  const [invResult, setInvResult] = useState('');

  // Team invite code management
  const [teamInvites, setTeamInvites] = useState<TeamInvite[]>([]);
  const [teamInvitesLoading, setTeamInvitesLoading] = useState(true);
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [inviteGenResult, setInviteGenResult] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [myTeams, setMyTeams] = useState<Array<{ id: string; name: string; role: string }>>([]);

  const loadTeamInvites = useCallback(() => {
    setTeamInvitesLoading(true);
    teamInvitesApi.list()
      .then(res => setTeamInvites(res.invites || []))
      .catch(() => setTeamInvites([]))
      .finally(() => setTeamInvitesLoading(false));
  }, []);

  useEffect(() => {
    loadTeamInvites();
    userSettings.myTeams().then(res => setMyTeams(res.data || [])).catch(() => {});
  }, [loadTeamInvites]);

  const sendInvite = async () => {
    if (!invEmail || !invName) return;
    setInviting(true);
    setInvResult('');
    try {
      await invitesApi.send({ email: invEmail, name: invName });
      setInvResult('Invite sent!');
      setInvEmail('');
      setInvName('');
    } catch (err) {
      setInvResult(err instanceof Error ? err.message : 'Failed');
    }
    setInviting(false);
  };

  const generateTeamInviteCode = async () => {
    if (myTeams.length === 0) {
      setInviteGenResult('No teams found. Create a team first.');
      return;
    }
    setGeneratingInvite(true);
    setInviteGenResult('');
    try {
      const teamId = myTeams[0].id;
      const result = await teamInvitesApi.create({ teamId, maxUses: 10, expiresInDays: 30 });
      setInviteGenResult(`Invite code created: ${result.invite.code}`);
      loadTeamInvites();
    } catch (err) {
      setInviteGenResult(err instanceof Error ? err.message : 'Failed to generate invite');
    }
    setGeneratingInvite(false);
  };

  const revokeInvite = async (id: string) => {
    try {
      await teamInvitesApi.revoke(id);
      setTeamInvites(prev => prev.map(inv => inv.id === id ? { ...inv, status: 'revoked' as const } : inv));
    } catch { /* ignore */ }
  };

  const copyInviteLink = (code: string, id: string) => {
    const origin = window.location.origin;
    const basePath = window.location.pathname.includes('/__openclaw__/canvas')
      ? '/__openclaw__/canvas/'
      : '/';
    const link = `${origin}${basePath}?invite=${code}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => {});
  };

  const activeInvites = teamInvites.filter(inv => inv.status === 'active');

  return (
    <div>
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Team</h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">Manage team membership and invites.</p>

      {/* Invite by Email */}
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">Invite by Email</h3>
      <p className="text-xs text-zinc-400 mb-2">Send a personal invite email with a direct link to join.</p>
      <div className="flex gap-2 mb-1">
        <input value={invName} onChange={e => setInvName(e.target.value)} placeholder="Name" className="input-field flex-1" />
        <input value={invEmail} onChange={e => setInvEmail(e.target.value)} placeholder="Email" className="input-field flex-1" />
        <button onClick={sendInvite} disabled={inviting || !invEmail || !invName} className="btn-primary whitespace-nowrap">
          {inviting ? 'Sending...' : 'Send Invite'}
        </button>
      </div>
      {invResult && <p className="text-sm text-zinc-500 mb-4">{invResult}</p>}

      <hr className="my-6 border-zinc-200 dark:border-zinc-800" />

      {/* Team Invite Codes */}
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">Team Invite Links</h3>
      <p className="text-xs text-zinc-400 mb-3">Generate shareable invite links that anyone can use to join your team.</p>

      <div className="mb-3">
        <button onClick={generateTeamInviteCode} disabled={generatingInvite} className="btn-primary">
          {generatingInvite ? 'Generating...' : 'Generate Invite Link'}
        </button>
        {inviteGenResult && <p className="text-sm text-zinc-500 mt-2">{inviteGenResult}</p>}
      </div>

      {teamInvitesLoading ? (
        <p className="text-sm text-zinc-400">Loading invites...</p>
      ) : activeInvites.length === 0 ? (
        <p className="text-sm text-zinc-400">No active invite links.</p>
      ) : (
        <div className="space-y-2">
          {activeInvites.map(inv => (
            <div key={inv.id} className="flex items-center justify-between rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono text-zinc-700 dark:text-zinc-300">{inv.code}</code>
                  {inv.email && (
                    <span className="text-xs text-zinc-400 truncate">for {inv.email}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-zinc-400">
                    {inv.usedCount || 0}/{inv.maxUses} uses
                  </span>
                  {inv.expiresAt && (
                    <span className="text-xs text-zinc-400">
                      expires {new Date(inv.expiresAt).toLocaleDateString()}
                    </span>
                  )}
                  <span className="text-xs text-zinc-400">
                    created {new Date(inv.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-3 shrink-0">
                <button
                  onClick={() => copyInviteLink(inv.code, inv.id)}
                  className="px-3 py-1.5 rounded-lg text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                >
                  {copiedId === inv.id ? 'Copied!' : 'Copy Link'}
                </button>
                <button
                  onClick={() => revokeInvite(inv.id)}
                  className="px-3 py-1.5 rounded-lg text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
                >
                  Revoke
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <hr className="my-6 border-zinc-200 dark:border-zinc-800" />

      {/* Team Members & Role Management */}
      <TeamMembersSubsection myTeams={myTeams} />

    </div>
  );
}

// ============= Team Members Subsection =============

function TeamMembersSubsection({ myTeams }: { myTeams: Array<{ id: string; name: string; role: string }> }) {
  const [members, setMembers] = useState<Array<Record<string, unknown>>>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (myTeams.length === 0) return;
    const teamId = myTeams[0].id;
    setIsAdmin(myTeams[0].role === 'admin');

    Promise.all([
      userSettings.teamMembers(teamId),
      userSettings.me(),
    ]).then(([membersRes, meRes]) => {
      setMembers(Array.isArray(membersRes) ? membersRes : []);
      setCurrentUserId((meRes as Record<string, unknown>).id as string || '');
    }).catch(() => {}).finally(() => setLoading(false));
  }, [myTeams]);

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (myTeams.length === 0) return;
    setUpdatingRole(userId);
    try {
      await userSettings.updateMemberRole(myTeams[0].id, userId, newRole);
      setMembers(prev => prev.map(m =>
        (m.id as string) === userId ? { ...m, teamRole: newRole } : m
      ));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update role');
    }
    setUpdatingRole(null);
  };

  if (myTeams.length === 0) return null;

  const ROLE_OPTIONS = ['member', 'lead', 'admin'];

  return (
    <div>
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">Team Members</h3>
      {loading ? (
        <p className="text-sm text-zinc-400">Loading members...</p>
      ) : members.length === 0 ? (
        <p className="text-sm text-zinc-400">No team members found.</p>
      ) : (
        <div className="space-y-2">
          {members.map(member => {
            const id = member.id as string;
            const name = member.name as string;
            const email = member.email as string;
            const role = member.teamRole as string;
            const isMe = id === currentUserId;

            return (
              <div key={id} className="flex items-center justify-between rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 truncate">{name}</p>
                    {isMe && <span className="text-xs text-zinc-400">(you)</span>}
                  </div>
                  <p className="text-xs text-zinc-400 truncate">{email}</p>
                </div>
                <div className="ml-3 shrink-0">
                  {isAdmin && !isMe ? (
                    <select
                      value={role}
                      onChange={e => handleRoleChange(id, e.target.value)}
                      disabled={updatingRole === id}
                      className="input-field text-xs py-1 px-2"
                    >
                      {ROLE_OPTIONS.map(r => (
                        <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={`text-xs font-medium px-2 py-1 rounded capitalize ${
                      role === 'admin'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400'
                        : role === 'lead'
                          ? 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-400'
                          : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                    }`}>
                      {role}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============= OpenClaw Section (admin-only) =============

type AvailableModel = { value: string; label: string; provider: string };

function OpenClawSection() {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    teamSettingsApi.get().then(res => {
      setSettings(res.data);
      if (Array.isArray(res.data.availableModels)) {
        setAvailableModels(res.data.availableModels as AvailableModel[]);
      }
    }).catch(() => {});
  }, []);

  const save = async (updates: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await teamSettingsApi.update(updates);
      setSettings(res.data);
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await teamSettingsApi.testIntegration('openclaw');
      setTestResult((res as Record<string, unknown>).data as { success: boolean; message: string });
    } catch (err) {
      setTestResult({ success: false, message: err instanceof Error ? err.message : 'Test failed' });
    }
    setTesting(false);
  };

  const allowlist = (settings.aiModelAllowlist || []) as string[];
  const defaultModel = (settings.aiDefaultModel || '') as string;
  const maxPromptChars = (settings.aiMaxPromptChars || 50000) as number;
  const openclawConfigured = !!settings.openclawConfigured;
  const agentTemplate = (settings.openclawAgentTemplate || 'default') as string;
  const teamContext = (settings.openclawTeamContext || '') as string;
  const enabledTools = (settings.openclawEnabledTools || ['search', 'calendar', 'tasks', 'email']) as string[];

  const toggleModel = (model: string) => {
    const current = allowlist.length > 0 ? [...allowlist] : availableModels.map(m => m.value);
    const next = current.includes(model)
      ? current.filter(m => m !== model)
      : [...current, model];
    if (next.length === 0) return; // Don't allow empty allowlist
    save({ aiModelAllowlist: next });
  };

  const allTools = ['search', 'calendar', 'tasks', 'email', 'browser', 'code', 'files'];
  const toggleTool = (tool: string) => {
    const next = enabledTools.includes(tool)
      ? enabledTools.filter(t => t !== tool)
      : [...enabledTools, tool];
    save({ openclawEnabledTools: next });
  };

  // If no allowlist is set yet, all models are implicitly allowed
  const effectiveAllowlist = allowlist.length > 0 ? allowlist : availableModels.map(m => m.value);
  const allowlistOptions = effectiveAllowlist
    .map(v => availableModels.find(m => m.value === v))
    .filter(Boolean) as AvailableModel[];

  return (
    <div>
      {/* Gateway link — prominent */}
      <div className="mb-6 rounded-xl border-2 border-indigo-200 dark:border-indigo-800 bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-indigo-950/40 dark:to-violet-950/40 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-indigo-900 dark:text-indigo-100">OpenClaw Gateway</h2>
            <p className="text-sm text-indigo-700 dark:text-indigo-300 mt-1">AI brain, skills, memory, sessions, and LLM provider configuration.</p>
          </div>
          <a
            href="https://oc.mypa.chat/"
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 shrink-0 flex items-center gap-2 shadow-sm"
          >
            Open Dashboard
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
              <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
            </svg>
          </a>
        </div>
        {/* Connection status */}
        <div className="flex items-center gap-3 mt-4">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${openclawConfigured ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
          <span className="text-xs text-indigo-600 dark:text-indigo-400">{openclawConfigured ? 'Connected' : 'Not configured'}</span>
          <button onClick={handleTest} disabled={testing} className="text-xs text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 underline">
            {testing ? 'Testing...' : 'Test connection'}
          </button>
          {testResult && (
            <span className={`text-xs ${testResult.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {testResult.message}
            </span>
          )}
        </div>
      </div>

      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">Team AI Settings</h3>

      {/* Model Allowlist */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1">Model Allowlist</h3>
        <p className="text-xs text-zinc-400 mb-3">Select which models your team can use. Unchecked models will be blocked.</p>
        <div className="space-y-2">
          {availableModels.map(model => (
            <label key={model.value} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={effectiveAllowlist.includes(model.value)}
                onChange={() => toggleModel(model.value)}
                className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-zinc-700 dark:text-zinc-300">{model.label}</span>
              <span className="text-xs text-zinc-400 capitalize">({model.provider})</span>
            </label>
          ))}
        </div>
      </div>

      {/* Default Model */}
      <div className="mb-6">
        <SelectField
          label="Default Model"
          value={defaultModel || (allowlistOptions[0]?.value || '')}
          options={allowlistOptions.map(m => ({ value: m.value, label: m.label }))}
          onChange={v => save({ aiDefaultModel: v })}
        />
        <p className="text-xs text-zinc-400 mt-1">Used when no model is specified by the user.</p>
      </div>

      {/* Max Prompt Size */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">Max Prompt Size (characters)</label>
        <input
          type="number"
          value={maxPromptChars}
          onChange={e => {
            const v = parseInt(e.target.value, 10);
            if (v >= 1000 && v <= 500000) save({ aiMaxPromptChars: v });
          }}
          min={1000}
          max={500000}
          step={1000}
          className="input-field w-48"
        />
        <p className="text-xs text-zinc-400 mt-1">Maximum total prompt size per request. Default: 50,000.</p>
      </div>

      <hr className="my-6 border-zinc-200 dark:border-zinc-800" />

      {/* Agent Configuration */}
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">Agent Configuration</h3>

      <div className="mb-6">
        <Field
          label="Agent Template"
          value={agentTemplate}
          onChange={v => save({ openclawAgentTemplate: v })}
          placeholder="default"
        />
        <p className="text-xs text-zinc-400 mt-1">OpenClaw agent template for new team members.</p>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">Team Context</label>
        <textarea
          value={teamContext}
          onChange={e => save({ openclawTeamContext: e.target.value })}
          rows={4}
          placeholder="Add team-wide context that will be injected into all agent sessions..."
          className="input-field w-full resize-y"
        />
        <p className="text-xs text-zinc-400 mt-1">Injected into every agent session. Use for team rules, preferences, or domain knowledge.</p>
      </div>

      <div className="mb-6">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1">Enabled Tools</h3>
        <p className="text-xs text-zinc-400 mb-3">Tools available to your team's AI agents.</p>
        <div className="flex flex-wrap gap-2">
          {allTools.map(tool => (
            <button
              key={tool}
              onClick={() => toggleTool(tool)}
              className={`px-3 py-1.5 rounded-lg text-sm capitalize ${
                enabledTools.includes(tool)
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              {tool}
            </button>
          ))}
        </div>
      </div>

      {saving && <p className="text-xs text-zinc-400 mt-2">Saving...</p>}
    </div>
  );
}

// --- Channel Providers (Admin) ---

type ProviderInfo = {
  provider: string;
  enabled: boolean;
  configured: boolean;
  healthy: boolean;
  connectionCount: number;
};

type ProviderActionState = {
  saving?: boolean;
  testing?: boolean;
  rotating?: boolean;
  testResult?: { ok: boolean; message: string } | null;
  rotateResult?: string | null;
  error?: string | null;
  configDraft?: string;
  showConfigInput?: boolean;
};

const PROVIDER_NAMES: Record<string, string> = {
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  slack: 'Slack',
  imessage: 'iMessage',
  sms: 'SMS',
  email: 'Email',
};

function ChannelProvidersSection() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionStates, setActionStates] = useState<Record<string, ProviderActionState>>({});

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    channels.providers()
      .then(res => {
        setProviders(res.data);
        setLoading(false);
      })
      .catch(err => {
        if (err instanceof ApiError && err.status === 403) {
          // Not admin — should not happen since section is hidden, but handle gracefully
          setError(null);
          setProviders([]);
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load providers');
        }
        setLoading(false);
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  const getAction = (provider: string): ProviderActionState =>
    actionStates[provider] || {};

  const setAction = (provider: string, updates: Partial<ProviderActionState>) => {
    setActionStates(prev => ({
      ...prev,
      [provider]: { ...prev[provider], ...updates },
    }));
  };

  const handleToggleEnabled = async (provider: string, currentlyEnabled: boolean) => {
    setAction(provider, { saving: true, error: null });
    try {
      const res = await channels.updateProvider(provider, { enabled: !currentlyEnabled });
      setProviders(prev => prev.map(p =>
        p.provider === provider
          ? { ...p, enabled: res.data.enabled, configured: res.data.configured }
          : p
      ));
    } catch (err) {
      setAction(provider, { error: err instanceof Error ? err.message : 'Failed to update' });
    }
    setAction(provider, { saving: false });
  };

  const handleSaveConfig = async (provider: string) => {
    const draft = getAction(provider).configDraft || '';
    if (!draft.trim()) return;
    setAction(provider, { saving: true, error: null });
    try {
      const res = await channels.updateProvider(provider, { configRef: draft.trim() });
      setProviders(prev => prev.map(p =>
        p.provider === provider
          ? { ...p, enabled: res.data.enabled, configured: res.data.configured }
          : p
      ));
      setAction(provider, { configDraft: '', showConfigInput: false, saving: false });
    } catch (err) {
      setAction(provider, { error: err instanceof Error ? err.message : 'Failed to save config', saving: false });
    }
  };

  const handleTest = async (provider: string) => {
    setAction(provider, { testing: true, testResult: null, error: null });
    try {
      const res = await channels.testProvider(provider);
      setAction(provider, { testResult: res.data, testing: false });
    } catch (err) {
      setAction(provider, { testResult: { ok: false, message: err instanceof Error ? err.message : 'Test failed' }, testing: false });
    }
  };

  const handleRotate = async (provider: string) => {
    if (!window.confirm(`Rotate webhook secret for ${PROVIDER_NAMES[provider] || provider}? Existing integrations will need to be updated.`)) {
      return;
    }
    setAction(provider, { rotating: true, rotateResult: null, error: null });
    try {
      const res = await channels.rotateWebhookSecret(provider);
      setAction(provider, {
        rotateResult: res.data.rotated
          ? `Rotated at ${new Date(res.data.updatedAt).toLocaleString()}`
          : 'Rotation skipped',
        rotating: false,
      });
    } catch (err) {
      setAction(provider, { error: err instanceof Error ? err.message : 'Failed to rotate', rotating: false });
    }
  };

  if (loading) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-6">Channel Providers</h2>
        <p className="text-sm text-zinc-400">Loading providers...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-6">Channel Providers</h2>
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 p-4">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          <button onClick={load} className="mt-2 text-xs text-red-600 dark:text-red-400 underline">Retry</button>
        </div>
      </div>
    );
  }

  if (providers.length === 0) return null;

  return (
    <div>
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Channel Providers</h2>
      <p className="text-xs text-zinc-400 mb-6">Configure messaging providers for your team. Users can connect their accounts once a provider is enabled.</p>

      <div className="space-y-4">
        {providers.map(p => {
          const action = getAction(p.provider);
          const name = PROVIDER_NAMES[p.provider] || p.provider;

          return (
            <div key={p.provider} className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-4">
              {/* Header row */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{name}</p>
                  <div className="flex items-center gap-2">
                    {/* Enabled / Disabled badge */}
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                      p.enabled
                        ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
                        : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                    }`}>
                      {p.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    {/* Configured badge */}
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                      p.configured
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400'
                        : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                    }`}>
                      {p.configured ? 'Configured' : 'Not configured'}
                    </span>
                    {/* Health indicator */}
                    {p.configured && (
                      <span className={`inline-block h-2 w-2 rounded-full ${
                        p.healthy ? 'bg-green-500' : 'bg-red-500'
                      }`} title={p.healthy ? 'Healthy' : 'Unhealthy'} />
                    )}
                  </div>
                </div>
                {/* Enable/Disable toggle */}
                <button
                  onClick={() => handleToggleEnabled(p.provider, p.enabled)}
                  disabled={action.saving}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                    p.enabled ? 'bg-blue-600' : 'bg-zinc-300 dark:bg-zinc-700'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${p.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* Connection count */}
              <p className="text-xs text-zinc-400 mb-3">
                {p.connectionCount} {p.connectionCount === 1 ? 'user' : 'users'} connected
              </p>

              {/* Config reference */}
              <div className="mb-3">
                <div className="flex items-center gap-2">
                  {action.showConfigInput ? (
                    <>
                      <input
                        type="text"
                        value={action.configDraft || ''}
                        onChange={e => setAction(p.provider, { configDraft: e.target.value })}
                        placeholder="Enter config reference..."
                        className="input-field flex-1 text-sm"
                      />
                      <button
                        onClick={() => handleSaveConfig(p.provider)}
                        disabled={action.saving || !(action.configDraft || '').trim()}
                        className="btn-primary text-xs"
                      >
                        {action.saving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => setAction(p.provider, { showConfigInput: false, configDraft: '' })}
                        className="px-3 py-1.5 rounded-lg text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        Config: {p.configured ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : 'None'}
                      </span>
                      <button
                        onClick={() => setAction(p.provider, { showConfigInput: true, configDraft: '' })}
                        className="px-3 py-1.5 rounded-lg text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                      >
                        {p.configured ? 'Update Config' : 'Set Config'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleTest(p.provider)}
                  disabled={action.testing}
                  className="px-3 py-1.5 rounded-lg text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                >
                  {action.testing ? 'Testing...' : 'Test'}
                </button>
                <button
                  onClick={() => handleRotate(p.provider)}
                  disabled={action.rotating}
                  className="px-3 py-1.5 rounded-lg text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                >
                  {action.rotating ? 'Rotating...' : 'Rotate Webhook Secret'}
                </button>
              </div>

              {/* Feedback messages */}
              {action.testResult && (
                <p className={`text-xs mt-2 ${action.testResult.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  Test: {action.testResult.message}
                </p>
              )}
              {action.rotateResult && (
                <p className="text-xs mt-2 text-zinc-500">{action.rotateResult}</p>
              )}
              {action.error && (
                <p className="text-xs mt-2 text-red-600 dark:text-red-400">{action.error}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HealthCard({ name, description, configured, healthy, detail, actionLabel, actionHref, onTest, testing }: {
  name: string; description: string; configured: boolean; healthy?: boolean; detail?: string;
  actionLabel?: string; actionHref?: string; onTest?: () => void; testing?: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-4 mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className={`inline-block h-3 w-3 rounded-full shrink-0 ${
            !configured ? 'bg-zinc-300 dark:bg-zinc-600'
            : healthy ? 'bg-emerald-500'
            : 'bg-red-500'
          }`} />
          <div>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{name}</p>
            <p className="text-xs text-zinc-400">{description}</p>
          </div>
        </div>
        <span className={`text-xs font-medium px-2 py-1 rounded shrink-0 ${
          configured
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
            : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
        }`}>
          {configured ? 'Connected' : 'Not configured'}
        </span>
      </div>
      {detail && <p className="text-xs text-zinc-400 mb-2">{detail}</p>}
      <div className="flex items-center gap-2 mt-2">
        {onTest && (
          <button onClick={onTest} disabled={testing} className="px-3 py-1.5 rounded-lg text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50">
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
        )}
        {actionLabel && actionHref && (
          <a href={actionHref} target="_blank" rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg text-xs bg-indigo-600 text-white hover:bg-indigo-700 inline-flex items-center gap-1">
            {actionLabel}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
              <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
              <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
            </svg>
          </a>
        )}
      </div>
    </div>
  );
}

function IntegrationHealthSection() {
  const [status, setStatus] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await crm.workflowStatus();
      setStatus(res.data as unknown as Record<string, unknown>);
      setLastChecked(new Date().toLocaleTimeString());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleTest = async (integration: string) => {
    setChecking(integration);
    try {
      await teamSettingsApi.testIntegration(integration);
      await load();
    } catch { /* ignore */ }
    setChecking(null);
  };

  const twenty = (status.twenty || {}) as Record<string, unknown>;
  const oc = (status.openclaw || {}) as Record<string, unknown>;
  const paWs = (status.paWorkspace || {}) as Record<string, unknown>;

  return (
    <div>
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Integration Health</h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
        Real-time status of all connected services. Deep configuration for each service is managed in the OpenClaw Dashboard.
      </p>

      {lastChecked && <p className="text-xs text-zinc-400 mb-4">Last checked: {lastChecked}</p>}

      <HealthCard
        name="OpenClaw Gateway"
        description="AI brain, agent orchestration, skills, and sessions"
        configured={!!oc.configured}
        healthy={!!oc.configured}
        actionLabel="Open Dashboard"
        actionHref="https://oc.mypa.chat/"
        onTest={() => handleTest('openclaw')}
        testing={checking === 'openclaw'}
      />

      <HealthCard
        name="Google Workspace (PA)"
        description="PA email accounts, calendar sync, and Drive storage"
        configured={!!paWs.configured}
        healthy={!!paWs.reachable}
        detail={paWs.message as string}
        onTest={() => handleTest('ntfy')}
        testing={checking === 'ntfy'}
      />

      <HealthCard
        name="Twenty CRM"
        description="Contact management, opportunity tracking, and task sync"
        configured={!!twenty.configured}
        healthy={!!twenty.configured}
        detail={twenty.reason as string}
      />

      <button onClick={load} disabled={loading} className="btn-primary mt-4">
        {loading ? 'Checking...' : 'Refresh All'}
      </button>
    </div>
  );
}

// ============= Provisioning Section (admin-only) =============

const DROPLET_SIZE_OPTIONS = [
  { value: 's-1vcpu-2gb', label: '$12/mo — 1 vCPU, 2 GB' },
  { value: 's-2vcpu-4gb', label: '$24/mo — 2 vCPU, 4 GB' },
  { value: 's-4vcpu-8gb', label: '$48/mo — 4 vCPU, 8 GB' },
];

const REGION_OPTIONS = [
  { value: 'nyc3', label: 'New York' },
  { value: 'sfo3', label: 'San Francisco' },
  { value: 'lon1', label: 'London' },
  { value: 'ams3', label: 'Amsterdam' },
];

const PROVISION_STATUS_STYLES: Record<string, string> = {
  pending: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  creating_droplet: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400 animate-pulse',
  installing_base: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400 animate-pulse',
  installing_services: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400 animate-pulse',
  deploying_code: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400 animate-pulse',
  configuring_dns: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400 animate-pulse',
  ready: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function ProvisioningSection() {
  const [jobs, setJobs] = useState<ProvisioningJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<ProvisioningJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    teamName: '',
    subdomain: '',
    adminEmail: '',
    adminPassword: '',
    dropletSize: 's-2vcpu-4gb',
    region: 'nyc3',
  });

  const loadJobs = useCallback(async () => {
    try {
      const res = await admin.listJobs();
      setJobs(res.jobs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  // Auto-refresh while any job is in progress
  useEffect(() => {
    const inProgressStatuses = ['pending', 'creating_droplet', 'installing_base', 'installing_services', 'deploying_code', 'configuring_dns'];
    const hasInProgress = jobs.some(j => inProgressStatuses.includes(j.status));
    if (!hasInProgress) return;

    const interval = setInterval(() => {
      admin.listJobs()
        .then(res => setJobs(res.jobs || []))
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [jobs]);

  const handleTeamNameChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      teamName: value,
      subdomain: slugify(value),
    }));
  };

  const handleSubmit = async () => {
    if (!formData.teamName || !formData.subdomain || !formData.adminEmail || !formData.adminPassword) return;
    const baseDomain = import.meta.env.VITE_BASE_DOMAIN || 'mypa.chat';
    if (!window.confirm(`Provision a new team "${formData.teamName}" at ${formData.subdomain}.${baseDomain}? This will create a new DigitalOcean droplet and deploy all services.`)) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await admin.provisionTeam(formData);
      setShowForm(false);
      setFormData({ teamName: '', subdomain: '', adminEmail: '', adminPassword: '', dropletSize: 's-2vcpu-4gb', region: 'nyc3' });
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start provisioning');
    }
    setSubmitting(false);
  };

  const handleRetry = async (jobId: string) => {
    try {
      await admin.retryJob(jobId);
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retry job');
    }
  };

  const toggleJobDetails = async (job: ProvisioningJob) => {
    if (selectedJob?.id === job.id) {
      setSelectedJob(null);
      return;
    }
    try {
      const res = await admin.getJob(job.id);
      setSelectedJob(res.job as ProvisioningJob);
    } catch {
      setSelectedJob(job);
    }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Provisioning</h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
        Deploy new team instances. Each provisioned team gets its own droplet, database, and subdomain.
      </p>

      {/* Provision New Team button */}
      <div className="mb-6">
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn-primary"
        >
          {showForm ? 'Hide Form' : 'Provision New Team'}
        </button>
      </div>

      {/* Provision form */}
      {showForm && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-5 mb-6">
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">New Team Provisioning</h3>
          <div className="space-y-4">
            <Field
              label="Team Name"
              value={formData.teamName}
              onChange={handleTeamNameChange}
              placeholder="Acme Corp"
            />
            <div>
              <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">Subdomain</label>
              <div className="flex items-center gap-0">
                <input
                  type="text"
                  value={formData.subdomain}
                  onChange={e => setFormData(prev => ({ ...prev, subdomain: slugify(e.target.value) }))}
                  placeholder="acme-corp"
                  className="input-field rounded-r-none border-r-0"
                />
                <span className="inline-flex items-center px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-r-lg">.{import.meta.env.VITE_BASE_DOMAIN || 'mypa.chat'}</span>
              </div>
            </div>
            <Field
              label="Admin Email"
              value={formData.adminEmail}
              onChange={v => setFormData(prev => ({ ...prev, adminEmail: v }))}
              placeholder="admin@acme.com"
            />
            <Field
              label="Admin Password"
              value={formData.adminPassword}
              onChange={v => setFormData(prev => ({ ...prev, adminPassword: v }))}
              type="password"
              placeholder="Minimum 8 characters"
            />
            <SelectField
              label="Droplet Size"
              value={formData.dropletSize}
              options={DROPLET_SIZE_OPTIONS}
              onChange={v => setFormData(prev => ({ ...prev, dropletSize: v }))}
            />
            <SelectField
              label="Region"
              value={formData.region}
              options={REGION_OPTIONS}
              onChange={v => setFormData(prev => ({ ...prev, region: v }))}
            />
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleSubmit}
                disabled={submitting || !formData.teamName || !formData.subdomain || !formData.adminEmail || !formData.adminPassword}
                className="btn-primary"
              >
                {submitting ? 'Provisioning...' : 'Provision Team'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg text-sm bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-3 mb-4">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Jobs list */}
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">Provisioning Jobs</h3>

      {loading ? (
        <p className="text-sm text-zinc-400">Loading jobs...</p>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-zinc-400">No provisioning jobs yet.</p>
      ) : (
        <div className="space-y-3">
          {jobs.map(job => {
            const isExpanded = selectedJob?.id === job.id;
            const statusStyle = PROVISION_STATUS_STYLES[job.status] || PROVISION_STATUS_STYLES.pending;

            return (
              <div key={job.id} className="rounded-lg border border-zinc-200 dark:border-zinc-800">
                {/* Job summary row */}
                <button
                  onClick={() => toggleJobDetails(job)}
                  className="w-full text-left px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-lg"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{job.teamName}</p>
                      <span className="text-xs text-zinc-400">{job.subdomain}.{import.meta.env.VITE_BASE_DOMAIN || 'mypa.chat'}</span>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${statusStyle}`}>
                      {job.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        job.status === 'ready' ? 'bg-emerald-500' : job.status === 'failed' ? 'bg-red-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${job.progress}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-zinc-400">
                      {new Date(job.createdAt).toLocaleString()}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {job.progress}%
                    </span>
                  </div>
                </button>

                {/* Expanded details */}
                {isExpanded && selectedJob && (
                  <div className="border-t border-zinc-200 dark:border-zinc-800 px-4 py-3">
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500 dark:text-zinc-400 w-24 shrink-0">Status:</span>
                        <span className="text-zinc-700 dark:text-zinc-300">{selectedJob.status.replace(/_/g, ' ')}</span>
                      </div>
                      {selectedJob.currentStep && (
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500 dark:text-zinc-400 w-24 shrink-0">Current Step:</span>
                          <span className="text-zinc-700 dark:text-zinc-300">{selectedJob.currentStep}</span>
                        </div>
                      )}
                      {selectedJob.dropletIp && (
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500 dark:text-zinc-400 w-24 shrink-0">Droplet IP:</span>
                          <span className="text-zinc-700 dark:text-zinc-300 font-mono text-xs">{selectedJob.dropletIp}</span>
                        </div>
                      )}
                      {selectedJob.adminEmail && (
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500 dark:text-zinc-400 w-24 shrink-0">Admin:</span>
                          <span className="text-zinc-700 dark:text-zinc-300">{selectedJob.adminEmail}</span>
                        </div>
                      )}

                      {/* Ready state — link */}
                      {selectedJob.status === 'ready' && (
                        <div className="mt-3">
                          <a
                            href={`https://${selectedJob.subdomain}.${import.meta.env.VITE_BASE_DOMAIN || 'mypa.chat'}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                          >
                            Open {selectedJob.subdomain}.{import.meta.env.VITE_BASE_DOMAIN || 'mypa.chat'}
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                              <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                            </svg>
                          </a>
                        </div>
                      )}

                      {/* Failed state — error + retry */}
                      {selectedJob.status === 'failed' && (
                        <div className="mt-3">
                          {selectedJob.error && (
                            <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-3 mb-3">
                              <p className="text-sm text-red-700 dark:text-red-400">{selectedJob.error}</p>
                            </div>
                          )}
                          <button
                            onClick={() => handleRetry(selectedJob.id)}
                            className="px-4 py-2 rounded-lg text-sm bg-red-600 text-white hover:bg-red-700"
                          >
                            Retry
                          </button>
                        </div>
                      )}

                      {/* Log output */}
                      {selectedJob.log && (
                        <div className="mt-3">
                          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Log</p>
                          <pre className="text-xs text-zinc-300 bg-zinc-900 dark:bg-zinc-950 rounded-lg p-3 max-h-64 overflow-y-auto whitespace-pre-wrap font-mono">
                            {selectedJob.log}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AccountSection({ onLogout }: { onLogout: () => void }) {
  const [consent, setConsent] = useState<boolean | null>(null);

  useEffect(() => {
    userSettings.me().then(data => {
      const u = data as Record<string, unknown>;
      setConsent(!!u.aiConsentGiven);
    }).catch(() => {});
  }, []);

  const toggleConsent = async (v: boolean) => {
    try {
      await userSettings.consent(v);
      setConsent(v);
    } catch { /* ignore */ }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Account</h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">AI Consent controls whether your data is sent to external AI providers for features like Tez Interrogation.</p>
      <div className="space-y-5">
        {consent !== null && (
          <Toggle
            label="AI Consent"
            checked={consent}
            onChange={toggleConsent}
            description="Allow external AI API calls (OpenAI, etc.) for features like Tez Interrogation"
          />
        )}
        <div className="pt-4">
          <button onClick={onLogout} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700">
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Shared UI Primitives ---

function Field({ label, value, onChange, disabled, type = 'text', placeholder }: {
  label: string; value: string; onChange?: (v: string) => void; disabled?: boolean; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange?.(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="input-field w-full"
      />
    </div>
  );
}

function Toggle({ label, checked, onChange, description }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; description?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</p>
        {description && <p className="text-xs text-zinc-400 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
          checked ? 'bg-blue-600' : 'bg-zinc-300 dark:bg-zinc-700'
        }`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}

function SelectField({ label, value, options, onChange }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="input-field w-full"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function RadioField({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2">{label}</label>
      <div className="flex gap-2">
        {options.map(o => (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={`px-3 py-1.5 rounded-lg text-sm capitalize ${
              value === o
                ? 'bg-blue-600 text-white'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            }`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

