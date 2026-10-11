import type { EnrollmentApplication, EnrollmentCategory } from "@workspace/api-client-react";

export type SessionEnrollmentDraft = {
  ownerId: string;
  application: EnrollmentApplication;
  submissionId: string;
  pin?: string;
  pinConfirmation?: string;
};

const sessionDrafts = new Map<string, SessionEnrollmentDraft>();
const sessionPrefix = "session-draft-";

export function isSessionDraftId(id: string) {
  return id.startsWith(sessionPrefix);
}

export function createSessionDraft(
  ownerId: string,
  category: EnrollmentCategory,
): SessionEnrollmentDraft {
  const now = new Date().toISOString();
  const application: EnrollmentApplication = {
    id: `${sessionPrefix}${crypto.randomUUID()}`,
    reference: "Not submitted",
    categoryId: category.id,
    categoryName: category.name,
    status: "draft",
    currentStep: 0,
    hasPin: false,
    answers: {},
    applicantName: null,
    applicantEmail: null,
    reviewNote: null,
    createdAt: now,
    updatedAt: now,
    submittedAt: null,
  };
  const draft: SessionEnrollmentDraft = {
    ownerId,
    application,
    submissionId: crypto.randomUUID(),
  };
  sessionDrafts.set(application.id, draft);
  return draft;
}

export function getSessionDraft(id: string, ownerId: string): SessionEnrollmentDraft | undefined {
  const draft = sessionDrafts.get(id);
  return draft?.ownerId === ownerId ? draft : undefined;
}

export function listSessionDrafts(ownerId: string): SessionEnrollmentDraft[] {
  return [...sessionDrafts.values()].filter((draft) => draft.ownerId === ownerId);
}

export function adoptSavedDraft(
  application: EnrollmentApplication,
  ownerId: string,
): SessionEnrollmentDraft {
  const existing = sessionDrafts.get(application.id);
  if (existing?.ownerId === ownerId) return existing;
  const draft: SessionEnrollmentDraft = {
    ownerId,
    application,
    submissionId: crypto.randomUUID(),
  };
  sessionDrafts.set(application.id, draft);
  return draft;
}

export function updateSessionDraft(
  id: string,
  ownerId: string,
  update: Partial<EnrollmentApplication>,
  pin?: string,
  pinConfirmation?: string,
): SessionEnrollmentDraft | undefined {
  const draft = getSessionDraft(id, ownerId);
  if (!draft) return undefined;
  const updated: SessionEnrollmentDraft = {
    ...draft,
    application: {
      ...draft.application,
      ...update,
      updatedAt: new Date().toISOString(),
    },
    ...(pin !== undefined ? { pin } : {}),
    ...(pinConfirmation !== undefined ? { pinConfirmation } : {}),
  };
  sessionDrafts.set(id, updated);
  return updated;
}

export function changeSessionDraftCategory(
  id: string,
  ownerId: string,
  category: EnrollmentCategory,
): SessionEnrollmentDraft | undefined {
  const draft = getSessionDraft(id, ownerId);
  if (!draft) return undefined;
  const updated: SessionEnrollmentDraft = {
    ownerId,
    submissionId: draft.submissionId,
    application: {
      ...draft.application,
      categoryId: category.id,
      categoryName: category.name,
      answers: {},
      currentStep: 0,
      hasPin: false,
      updatedAt: new Date().toISOString(),
    },
  };
  sessionDrafts.set(id, updated);
  return updated;
}

export function removeSessionDraft(id: string, ownerId: string) {
  if (getSessionDraft(id, ownerId)) sessionDrafts.delete(id);
}

export function clearSessionDrafts(ownerId: string) {
  let deleted = 0;
  for (const [id, draft] of sessionDrafts) {
    if (draft.ownerId === ownerId) {
      sessionDrafts.delete(id);
      deleted += 1;
    }
  }
  return deleted;
}
