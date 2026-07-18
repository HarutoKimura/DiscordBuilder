/** Kind of build task: first generation vs. follow-up edit from the thread. */
export type BuildKind = 'initial' | 'edit';

export interface BuildRequest {
  projectId: string;
  kind: BuildKind;
  /** The community's request, verbatim (language preserved — see AGENTS.md language rule). */
  prompt: string;
  /** Discord user id, or a CLI-provided tag in M1. */
  requestedBy?: string;
}

export type BuildStatus = 'success' | 'partial' | 'failed';

/** Shape of BUILD_RESULT.json written by the Codex agent (contract: templates/app-template/AGENTS.md). */
export interface BuildResultFile {
  status: BuildStatus;
  summary: string;
  changes: string[];
  screenshots: string[];
  notes: string[];
  /** True only when existing community data was destroyed; the bot warns the thread. */
  dataReset?: boolean;
  attempts: number;
}

export interface ProjectInfo {
  id: string;
  name: string;
  /** Discord thread id once the project is bound to a thread (M2+). */
  threadId?: string;
  previewUrl?: string;
  createdAt: string;
}
