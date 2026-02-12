import { useEffect, useMemo, useState } from 'react';
import { ApiError, crm, settings } from '../services/api';
import type { ContextLayer, CrmEntityType, CrmStatus, CrmSummary, CrmWorkflowResult, CrmWorkflowStatus } from '../types';

interface OperationsPanelProps {
  onSendTezDraft: (payload: {
    teamId: string;
    recipients?: string[];
    surfaceText: string;
    type?: string;
    urgency?: string;
    visibility?: string;
    context?: ContextLayer[];
  }) => Promise<void>;
}

const ENTITY_OPTIONS: Array<{ value: CrmEntityType; label: string }> = [
  { value: 'person', label: 'Contacts' },
  { value: 'opportunity', label: 'Opportunities' },
  { value: 'task', label: 'Tasks' },
];

function prettyPrint(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Payload must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

function validateJsonPayload(raw: string): string | null {
  try {
    parseJsonObject(raw);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid JSON payload';
  }
}

function summarizeLine(item: CrmSummary): string {
  const keys = ['name', 'title', 'status', 'stage', 'company', 'amount', 'dueDate'];
  const parts: string[] = [];
  for (const key of keys) {
    const value = item[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      parts.push(`${key}: ${value}`);
    }
  }
  return parts.slice(0, 3).join(' | ');
}

export function OperationsPanel({ onSendTezDraft }: OperationsPanelProps) {
  const [status, setStatus] = useState<CrmStatus | null>(null);
  const [workflowStatus, setWorkflowStatus] = useState<CrmWorkflowStatus | null>(null);
  const [teamSettings, setTeamSettings] = useState<Record<string, unknown> | null>(null);
  const [teamPrefillNotice, setTeamPrefillNotice] = useState('');
  const [statusError, setStatusError] = useState('');

  const [listType, setListType] = useState<CrmEntityType>('person');
  const [listQuery, setListQuery] = useState('');
  const [listItems, setListItems] = useState<CrmSummary[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');

  const [createType, setCreateType] = useState<CrmEntityType>('person');
  const [createPayload, setCreatePayload] = useState('{\n  "name": "Jane Example"\n}');
  const [createResult, setCreateResult] = useState('');
  const [createError, setCreateError] = useState('');

  const [updateType, setUpdateType] = useState<CrmEntityType>('task');
  const [updateEntityId, setUpdateEntityId] = useState('');
  const [updatePayload, setUpdatePayload] = useState('{\n  "status": "in_progress"\n}');
  const [updateResult, setUpdateResult] = useState('');
  const [updateError, setUpdateError] = useState('');

  const [workflowEntityType, setWorkflowEntityType] = useState<CrmEntityType>('person');
  const [workflowEntityId, setWorkflowEntityId] = useState('');
  const [workflowObjective, setWorkflowObjective] = useState('');
  const [workflowTeamId, setWorkflowTeamId] = useState('');
  const [workflowRecipients, setWorkflowRecipients] = useState('');
  const [openclawEnabled, setOpenclawEnabled] = useState(true);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [workspaceDryRun, setWorkspaceDryRun] = useState(true);
  const [workspacePaEmail, setWorkspacePaEmail] = useState('');
  const [workspaceEmailTo, setWorkspaceEmailTo] = useState('');
  const [workspaceSendEmail, setWorkspaceSendEmail] = useState(false);
  const [workspaceLogCalendar, setWorkspaceLogCalendar] = useState(false);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [workflowError, setWorkflowError] = useState('');
  const [workflowResult, setWorkflowResult] = useState<CrmWorkflowResult | null>(null);
  const [sendTezError, setSendTezError] = useState('');
  const [sendTezSuccess, setSendTezSuccess] = useState('');

  const recipients = useMemo(
    () =>
      workflowRecipients
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    [workflowRecipients]
  );
  const createPayloadValidation = useMemo(() => validateJsonPayload(createPayload), [createPayload]);
  const updatePayloadValidation = useMemo(() => validateJsonPayload(updatePayload), [updatePayload]);

  const loadStatus = async () => {
    setStatusError('');
    setTeamPrefillNotice('');
    try {
      const [crmStatusRes, workflowStatusRes] = await Promise.all([
        crm.status(),
        crm.workflowStatus(),
      ]);
      setStatus(crmStatusRes.data);
      setWorkflowStatus(workflowStatusRes.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load integration status';
      setStatusError(message);
    }

    try {
      const settingsRes = await settings.team();
      setTeamSettings(settingsRes.data);
      const configuredTeamId = settingsRes.data?.teamId;
      if (typeof configuredTeamId === 'string' && configuredTeamId.trim().length > 0) {
        setWorkflowTeamId(configuredTeamId);
      }
    } catch (error) {
      setTeamSettings(null);
      if (error instanceof ApiError && error.status === 403) {
        setTeamPrefillNotice('Team ID auto-fill is only available for admin or team lead roles. Enter Team ID manually.');
      } else {
        setTeamPrefillNotice('Unable to auto-load team settings. Enter Team ID manually.');
      }
    }
  };

  useEffect(() => {
    loadStatus().catch(() => {});
  }, []);

  const searchEntities = async () => {
    setListLoading(true);
    setListError('');
    try {
      const response =
        listType === 'person'
          ? await crm.people(listQuery, 20, 0)
          : listType === 'opportunity'
            ? await crm.opportunities(listQuery, 20, 0)
            : await crm.tasks(listQuery, 20, 0);
      setListItems(response.data.items);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch CRM entities';
      setListError(message);
      setListItems([]);
    } finally {
      setListLoading(false);
    }
  };

  const handleCreate = async () => {
    setCreateError('');
    setCreateResult('');
    if (createPayloadValidation) {
      setCreateError(createPayloadValidation);
      return;
    }
    try {
      const payload = parseJsonObject(createPayload);
      const response = await crm.createEntity(createType, payload);
      setCreateResult(prettyPrint(response.data));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Create failed';
      setCreateError(message);
    }
  };

  const handleUpdate = async () => {
    setUpdateError('');
    setUpdateResult('');
    if (!updateEntityId.trim()) {
      setUpdateError('Entity ID is required');
      return;
    }
    if (updatePayloadValidation) {
      setUpdateError(updatePayloadValidation);
      return;
    }
    try {
      const payload = parseJsonObject(updatePayload);
      const response = await crm.updateEntity(updateType, updateEntityId.trim(), payload);
      setUpdateResult(prettyPrint(response.data));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Update failed';
      setUpdateError(message);
    }
  };

  const handleCoordinate = async () => {
    setWorkflowError('');
    setWorkflowResult(null);
    setSendTezError('');
    setSendTezSuccess('');
    if (!workflowEntityId.trim() || !workflowObjective.trim()) {
      setWorkflowError('Entity ID and objective are required');
      return;
    }
    setWorkflowLoading(true);
    try {
      const response = await crm.coordinateWorkflow({
        entityType: workflowEntityType,
        entityId: workflowEntityId.trim(),
        objective: workflowObjective.trim(),
        tez: {
          teamId: workflowTeamId.trim() || undefined,
          recipients: recipients.length > 0 ? recipients : undefined,
        },
        openclaw: {
          enabled: openclawEnabled,
        },
        googleWorkspace: {
          enabled: googleEnabled,
          dryRun: workspaceDryRun,
          paEmail: workspacePaEmail.trim() || undefined,
          emailTo: workspaceEmailTo.trim() || undefined,
          sendEmail: workspaceSendEmail,
          logCalendar: workspaceLogCalendar,
        },
      });
      setWorkflowResult(response.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Workflow generation failed';
      setWorkflowError(message);
    } finally {
      setWorkflowLoading(false);
    }
  };

  const handleSendTezDraft = async () => {
    setSendTezError('');
    setSendTezSuccess('');
    if (!workflowResult) {
      setSendTezError('Build a workflow first');
      return;
    }
    if (!workflowResult.tezDraft.teamId) {
      setSendTezError('A team ID is required in the workflow Tez draft');
      return;
    }
    try {
      await onSendTezDraft({
        teamId: workflowResult.tezDraft.teamId,
        recipients: workflowResult.tezDraft.recipients,
        surfaceText: workflowResult.tezDraft.surfaceText,
        type: workflowResult.tezDraft.type,
        urgency: workflowResult.tezDraft.urgency,
        visibility: workflowResult.tezDraft.visibility,
        context: workflowResult.tezDraft.context,
      });
      setSendTezSuccess('Tez shared successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to share Tez draft';
      setSendTezError(message);
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-zinc-50 dark:bg-zinc-900 p-5">
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Operations</h2>
            <button
              onClick={() => loadStatus().catch(() => {})}
              className="text-xs px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            >
              Refresh
            </button>
          </div>
          <p className="text-sm text-zinc-500 mt-1">
            Coordinate Twenty CRM, Tezit messaging, OpenClaw planning, and PA Workspace actions.
          </p>
          {statusError && <p className="text-sm text-red-500 mt-2">{statusError}</p>}
          <div className="grid md:grid-cols-3 gap-3 mt-3 text-sm">
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-3 bg-zinc-50 dark:bg-zinc-900">
              <div className="font-medium text-zinc-700 dark:text-zinc-200">Twenty CRM</div>
              <div className="text-zinc-500 mt-1">
                {status?.configured ? (status.reachable ? 'Connected' : 'Configured, not reachable') : 'Not configured'}
              </div>
            </div>
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-3 bg-zinc-50 dark:bg-zinc-900">
              <div className="font-medium text-zinc-700 dark:text-zinc-200">OpenClaw</div>
              <div className="text-zinc-500 mt-1">
                {workflowStatus?.openclaw.configured ? 'Configured' : 'Not configured'}
              </div>
            </div>
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-3 bg-zinc-50 dark:bg-zinc-900">
              <div className="font-medium text-zinc-700 dark:text-zinc-200">PA Workspace</div>
              <div className="text-zinc-500 mt-1">
                {workflowStatus?.paWorkspace.configured
                  ? workflowStatus.paWorkspace.reachable
                    ? 'Connected'
                    : 'Configured, not reachable'
                  : 'Not configured'}
              </div>
            </div>
          </div>
          {teamSettings && (
            <p className="text-xs text-zinc-500 mt-3">
              Active team: {typeof teamSettings.teamName === 'string' ? teamSettings.teamName : 'Unknown'} (
              {typeof teamSettings.teamId === 'string' ? teamSettings.teamId : 'no team id'})
            </p>
          )}
          {!teamSettings && teamPrefillNotice && (
            <p className="text-xs text-amber-600 mt-3">{teamPrefillNotice}</p>
          )}
        </div>

        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">CRM Lookup</h3>
          <div className="flex flex-wrap gap-2">
            <select
              value={listType}
              onChange={(e) => setListType(e.target.value as CrmEntityType)}
              className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            >
              {ENTITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              value={listQuery}
              onChange={(e) => setListQuery(e.target.value)}
              placeholder="Search query"
              className="flex-1 min-w-[220px] px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            />
            <button
              onClick={searchEntities}
              disabled={listLoading}
              className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50 hover:bg-blue-700"
            >
              {listLoading ? 'Loading...' : 'Search'}
            </button>
          </div>
          {listError && <p className="text-sm text-red-500">{listError}</p>}
          {listItems.length > 0 && (
            <div className="max-h-48 overflow-y-auto border border-zinc-200 dark:border-zinc-700 rounded-lg divide-y divide-zinc-200 dark:divide-zinc-700">
              {listItems.map((item, index) => (
                <div key={`${String(item.id || index)}-${index}`} className="px-3 py-2 text-sm">
                  <div className="font-medium text-zinc-800 dark:text-zinc-200">{String(item.id || 'no-id')}</div>
                  <div className="text-zinc-500">{summarizeLine(item)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Create CRM Record</h3>
            <select
              value={createType}
              onChange={(e) => setCreateType(e.target.value as CrmEntityType)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            >
              {ENTITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <textarea
              value={createPayload}
              onChange={(e) => setCreatePayload(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-xs font-mono"
            />
            {createPayloadValidation && (
              <p className="text-xs text-amber-600">{createPayloadValidation}</p>
            )}
            <button
              onClick={handleCreate}
              disabled={!!createPayloadValidation}
              className="px-3 py-2 rounded-lg bg-green-600 text-white text-sm disabled:opacity-50 hover:bg-green-700"
            >
              Create
            </button>
            {createError && <p className="text-sm text-red-500">{createError}</p>}
            {createResult && (
              <pre className="text-xs bg-zinc-100 dark:bg-zinc-900 rounded-lg p-2 overflow-x-auto">{createResult}</pre>
            )}
          </div>

          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Update CRM Record</h3>
            <select
              value={updateType}
              onChange={(e) => setUpdateType(e.target.value as CrmEntityType)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            >
              {ENTITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              value={updateEntityId}
              onChange={(e) => setUpdateEntityId(e.target.value)}
              placeholder="Entity ID"
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            />
            <textarea
              value={updatePayload}
              onChange={(e) => setUpdatePayload(e.target.value)}
              rows={7}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-xs font-mono"
            />
            {updatePayloadValidation && (
              <p className="text-xs text-amber-600">{updatePayloadValidation}</p>
            )}
            <button
              onClick={handleUpdate}
              disabled={!updateEntityId.trim() || !!updatePayloadValidation}
              className="px-3 py-2 rounded-lg bg-amber-600 text-white text-sm disabled:opacity-50 hover:bg-amber-700"
            >
              Update
            </button>
            {updateError && <p className="text-sm text-red-500">{updateError}</p>}
            {updateResult && (
              <pre className="text-xs bg-zinc-100 dark:bg-zinc-900 rounded-lg p-2 overflow-x-auto">{updateResult}</pre>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Coordination Workflow</h3>
          <div className="grid md:grid-cols-2 gap-2">
            <select
              value={workflowEntityType}
              onChange={(e) => setWorkflowEntityType(e.target.value as CrmEntityType)}
              className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            >
              {ENTITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              value={workflowEntityId}
              onChange={(e) => setWorkflowEntityId(e.target.value)}
              placeholder="CRM entity ID"
              className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            />
            <input
              value={workflowTeamId}
              onChange={(e) => setWorkflowTeamId(e.target.value)}
              placeholder="Team ID for Tez share"
              className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            />
            <input
              value={workflowRecipients}
              onChange={(e) => setWorkflowRecipients(e.target.value)}
              placeholder="Recipient IDs (comma-separated)"
              className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            />
          </div>
          <textarea
            value={workflowObjective}
            onChange={(e) => setWorkflowObjective(e.target.value)}
            rows={3}
            placeholder="Objective: what should the PA accomplish?"
            className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
          />
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={openclawEnabled} onChange={(e) => setOpenclawEnabled(e.target.checked)} />
              OpenClaw plan
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={googleEnabled} onChange={(e) => setGoogleEnabled(e.target.checked)} />
              Google Workspace actions
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={workspaceDryRun} onChange={(e) => setWorkspaceDryRun(e.target.checked)} />
              Dry run
            </label>
          </div>
          {googleEnabled && (
            <div className="grid md:grid-cols-2 gap-2">
              <input
                value={workspacePaEmail}
                onChange={(e) => setWorkspacePaEmail(e.target.value)}
                placeholder="PA email (required for execution)"
                className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
              />
              <input
                value={workspaceEmailTo}
                onChange={(e) => setWorkspaceEmailTo(e.target.value)}
                placeholder="Email recipient"
                className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
              />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={workspaceSendEmail} onChange={(e) => setWorkspaceSendEmail(e.target.checked)} />
                Send email via PA Workspace
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={workspaceLogCalendar} onChange={(e) => setWorkspaceLogCalendar(e.target.checked)} />
                Log calendar action
              </label>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleCoordinate}
              disabled={workflowLoading}
              className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50 hover:bg-blue-700"
            >
              {workflowLoading ? 'Building...' : 'Build Workflow'}
            </button>
            <button
              onClick={handleSendTezDraft}
              disabled={!workflowResult}
              className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm disabled:opacity-50 hover:bg-emerald-700"
            >
              Share Tez Draft
            </button>
          </div>
          {workflowError && <p className="text-sm text-red-500">{workflowError}</p>}
          {sendTezError && <p className="text-sm text-red-500">{sendTezError}</p>}
          {sendTezSuccess && <p className="text-sm text-green-600">{sendTezSuccess}</p>}
          {workflowResult && (
            <div className="space-y-2">
              <div className="text-sm text-zinc-700 dark:text-zinc-200">
                <span className="font-medium">Tez draft:</span> {workflowResult.tezDraft.surfaceText}
              </div>
              {workflowResult.openclaw.summary && (
                <div className="text-sm text-zinc-600 dark:text-zinc-300">
                  <span className="font-medium">OpenClaw:</span> {workflowResult.openclaw.summary}
                </div>
              )}
              <pre className="text-xs bg-zinc-100 dark:bg-zinc-900 rounded-lg p-2 overflow-x-auto">
                {prettyPrint(workflowResult)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
