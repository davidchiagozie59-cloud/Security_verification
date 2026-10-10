import { clerkClient, getAuth } from "@clerk/express";
import {
  and,
  desc,
  eq,
  inArray,
  ne,
} from "drizzle-orm";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import {
  type NextFunction,
  type Request,
  type Response,
  Router,
  type IRouter,
} from "express";
import {
  CreateApplicationBody,
  CreateApplicationResponse,
  CreateSupportTicketBody,
  CreateSupportTicketResponse,
  DecideApplicationBody,
  DecideApplicationParams,
  DecideApplicationResponse,
  GetApplicationParams,
  GetApplicationResponse,
  GetApplicantSummaryResponse,
  ListApplicationsForReviewQueryParams,
  ListApplicationsForReviewResponse,
  ListEnrollmentCategoriesResponse,
  ListMyApplicationsResponse,
  ListMySupportTicketsResponse,
  ListSupportTicketsForAdminResponse,
  ReplyToSupportTicketBody,
  ReplyToSupportTicketParams,
  ReplyToSupportTicketResponse,
  SubmitApplicationParams,
  SubmitApplicationResponse,
  UpdateApplicationBody,
  UpdateApplicationParams,
  UpdateApplicationResponse,
} from "@workspace/api-zod";
import {
  applicationEventsTable,
  db,
  enrollmentApplicationsTable,
  supportTicketsTable,
} from "@workspace/db";

type ApplicationStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "needs_information"
  | "approved"
  | "rejected";

const router: IRouter = Router();
const activeStatuses = ["draft", "submitted", "under_review", "needs_information"] as const;

const categories = [
  {
    id: "category-1",
    name: "Enrollment Category One",
    description: "Complete the registration process for Category One.",
    accent: "green",
  },
  {
    id: "category-2",
    name: "Enrollment Category Two",
    description: "Complete the registration process for Category Two.",
    accent: "cobalt",
  },
  {
    id: "category-3",
    name: "Enrollment Category Three",
    description: "Complete the registration process for Category Three.",
    accent: "ocean",
  },
  {
    id: "category-4",
    name: "Enrollment Category Four",
    description: "Complete the registration process for Category Four.",
    accent: "white",
  },
] as const;

type CategoryId = (typeof categories)[number]["id"];

function authenticate(req: Request, res: Response, next: NextFunction): void {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  res.locals.userId = userId;
  next();
}

async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = res.locals.userId as string | undefined;
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }

  try {
    const user = await clerkClient.users.getUser(userId);
    if (user.publicMetadata?.role !== "admin") {
      res.status(403).json({ error: "Administrator access is required." });
      return;
    }
    next();
  } catch (error) {
    req.log.error({ err: error, userId }, "Failed to verify administrator role");
    res.status(503).json({ error: "Administrator access could not be verified." });
  }
}

function categoryName(categoryId: string): string {
  return categories.find((category) => category.id === categoryId)?.name ?? "Enrollment";
}

function answerString(answers: Record<string, unknown>, key: string): string | null {
  const value = answers[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function categoryPinLength(categoryId: string): number {
  return categoryId === "category-2" ? 6 : 4;
}

function hasRequiredCategoryDetails(
  categoryId: string,
  answers: Record<string, unknown>,
): boolean {
  const requiredFields =
    categoryId === "category-1" ? ["name", "nickname"] : ["name", "surname"];
  return requiredFields.every((field) => answerString(answers, field) !== null);
}

function serializeApplication(
  application: typeof enrollmentApplicationsTable.$inferSelect,
) {
  const answers = application.answers ?? {};
  return {
    id: application.id,
    reference: application.reference,
    categoryId: application.categoryId,
    categoryName: categoryName(application.categoryId),
    status: application.status,
    currentStep: application.currentStep,
    hasPin: Boolean(application.pinHash),
    answers,
    applicantName:
      answerString(answers, "fullName") ??
      ([
        answerString(answers, "name") ?? answerString(answers, "firstName"),
        answerString(answers, "surname") ?? answerString(answers, "lastName"),
      ]
        .filter(Boolean)
        .join(" ") ||
        null),
    applicantEmail: answerString(answers, "email"),
    reviewNote: application.reviewNote,
    createdAt: application.createdAt.toISOString(),
    updatedAt: application.updatedAt.toISOString(),
    submittedAt: application.submittedAt?.toISOString() ?? null,
  };
}

function serializeTicket(ticket: typeof supportTicketsTable.$inferSelect) {
  return {
    id: ticket.id,
    applicationId: ticket.applicationId,
    subject: ticket.subject,
    message: ticket.message,
    status: ticket.status,
    response: ticket.response,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

router.get("/enrollment/categories", (_req, res): void => {
  res.json(ListEnrollmentCategoriesResponse.parse(categories));
});

router.use(authenticate);

router.get("/me/applications", async (req, res): Promise<void> => {
  const applications = await db
    .select()
    .from(enrollmentApplicationsTable)
    .where(eq(enrollmentApplicationsTable.clerkUserId, res.locals.userId))
    .orderBy(desc(enrollmentApplicationsTable.updatedAt));
  res.json(ListMyApplicationsResponse.parse(applications.map(serializeApplication)));
});

router.post("/applications", async (req, res): Promise<void> => {
  const parsed = CreateApplicationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const categoryId = parsed.data.categoryId as CategoryId;

  const [existing] = await db
    .select()
    .from(enrollmentApplicationsTable)
    .where(
      and(
        eq(enrollmentApplicationsTable.clerkUserId, res.locals.userId),
        inArray(enrollmentApplicationsTable.status, [...activeStatuses]),
      ),
    )
    .orderBy(desc(enrollmentApplicationsTable.updatedAt))
    .limit(1);

  if (existing) {
    if (existing.status === "draft" && existing.categoryId === categoryId) {
      res.status(201).json(CreateApplicationResponse.parse(serializeApplication(existing)));
      return;
    }
    res.status(409).json({
      error: "You already have an active application. Continue it or contact support.",
    });
    return;
  }

  const [created] = await db
    .insert(enrollmentApplicationsTable)
    .values({
      clerkUserId: res.locals.userId,
      categoryId,
      reference: `ENR-${randomUUID().slice(0, 8).toUpperCase()}`,
    })
    .returning();

  if (!created) {
    res.status(500).json({ error: "The application could not be created." });
    return;
  }
  await db.insert(applicationEventsTable).values({
    applicationId: created.id,
    actorUserId: res.locals.userId,
    eventType: "draft_created",
  });
  res.status(201).json(CreateApplicationResponse.parse(serializeApplication(created)));
});

router.get("/applications/:applicationId", async (req, res): Promise<void> => {
  const params = GetApplicationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [application] = await db
    .select()
    .from(enrollmentApplicationsTable)
    .where(
      and(
        eq(enrollmentApplicationsTable.id, params.data.applicationId),
        eq(enrollmentApplicationsTable.clerkUserId, res.locals.userId),
      ),
    )
    .limit(1);
  if (!application) {
    res.status(404).json({ error: "Application not found." });
    return;
  }
  res.json(GetApplicationResponse.parse(serializeApplication(application)));
});

router.patch("/applications/:applicationId", async (req, res): Promise<void> => {
  const params = UpdateApplicationParams.safeParse(req.params);
  const parsed = UpdateApplicationBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({
      error: !params.success
        ? params.error.message
        : parsed.success
          ? "Invalid request."
          : parsed.error.message,
    });
    return;
  }

  const [application] = await db
    .select()
    .from(enrollmentApplicationsTable)
    .where(
      and(
        eq(enrollmentApplicationsTable.id, params.data.applicationId),
        eq(enrollmentApplicationsTable.clerkUserId, res.locals.userId),
      ),
    )
    .limit(1);
  if (!application) {
    res.status(404).json({ error: "Application not found." });
    return;
  }
  if (application.status !== "draft") {
    res.status(409).json({ error: "Only draft applications can be edited." });
    return;
  }

  const nextCategoryId = parsed.data.categoryId;
  const categoryChanged = Boolean(
    nextCategoryId && nextCategoryId !== application.categoryId,
  );
  if (
    categoryChanged &&
    (parsed.data.answers !== undefined ||
      parsed.data.pin !== undefined ||
      parsed.data.pinConfirmation !== undefined)
  ) {
    res.status(400).json({
      error: "Change the category separately before editing the new application.",
    });
    return;
  }
  const forbiddenAnswerKeys = new Set([
    "pin",
    "pinconfirmation",
    "pinhash",
    "pincode",
    "pinvalue",
  ]);
  if (
    parsed.data.answers &&
    Object.keys(parsed.data.answers).some((key) =>
      forbiddenAnswerKeys.has(key.toLowerCase()),
    )
  ) {
    res.status(400).json({
      error: "PIN values must be sent separately and cannot be saved with application answers.",
    });
    return;
  }
  if (
    parsed.data.pin &&
    parsed.data.pin.length !== categoryPinLength(application.categoryId)
  ) {
    res.status(400).json({
      error: `This category requires an exactly ${categoryPinLength(application.categoryId)}-digit PIN.`,
    });
    return;
  }
  if (
    parsed.data.pinConfirmation !== undefined &&
    (application.categoryId !== "category-4" ||
      parsed.data.pinConfirmation !== parsed.data.pin)
  ) {
    res.status(400).json({ error: "The PIN confirmation does not match." });
    return;
  }
  if (
    application.categoryId === "category-4" &&
    parsed.data.pin &&
    parsed.data.pinConfirmation === undefined
  ) {
    res.status(400).json({ error: "Confirm the PIN before continuing." });
    return;
  }
  const nextAnswers = parsed.data.answers ?? application.answers ?? {};
  const entryIsComplete = nextAnswers.categoryEntryComplete === true;
  const wasEntryComplete = application.answers?.categoryEntryComplete === true;
  if (
    parsed.data.answers?.categoryEntryComplete === true &&
    !hasRequiredCategoryDetails(application.categoryId, nextAnswers)
  ) {
    res.status(400).json({
      error: "Enter all required category details before continuing.",
    });
    return;
  }
  if (
    parsed.data.answers?.categoryEntryComplete === true &&
    !wasEntryComplete &&
    !parsed.data.pin
  ) {
    res.status(400).json({
      error: "Create the required category PIN before continuing.",
    });
    return;
  }
  if (
    parsed.data.answers?.categoryEntryComplete === true &&
    !parsed.data.pin &&
    !application.pinHash
  ) {
    res.status(400).json({ error: "Create the required category PIN before continuing." });
    return;
  }
  if (entryIsComplete && !hasRequiredCategoryDetails(application.categoryId, nextAnswers)) {
    res.status(400).json({
      error: "Enter all required category details before saving this application.",
    });
    return;
  }
  const pinHash = parsed.data.pin
    ? (() => {
        const salt = randomBytes(16).toString("hex");
        return `scrypt$${salt}$${scryptSync(parsed.data.pin, salt, 64).toString("hex")}`;
      })()
    : undefined;
  const [updated] = await db
    .update(enrollmentApplicationsTable)
    .set({
      ...(parsed.data.currentStep !== undefined
        ? { currentStep: parsed.data.currentStep }
        : {}),
      ...(categoryChanged
        ? { categoryId: nextCategoryId, answers: {}, currentStep: 0, pinHash: null }
        : {}),
      ...(!categoryChanged && parsed.data.answers !== undefined
        ? { answers: parsed.data.answers }
        : {}),
      ...(pinHash ? { pinHash } : {}),
      updatedAt: new Date(),
    })
    .where(eq(enrollmentApplicationsTable.id, params.data.applicationId))
    .returning();
  if (!updated) {
    res.status(500).json({ error: "The application could not be saved." });
    return;
  }
  if (categoryChanged && nextCategoryId) {
    await db.insert(applicationEventsTable).values({
      applicationId: updated.id,
      actorUserId: res.locals.userId,
      eventType: "category_changed",
      note: `${categoryName(application.categoryId)} → ${categoryName(nextCategoryId)}`,
    });
  }
  res.json(UpdateApplicationResponse.parse(serializeApplication(updated)));
});

router.post("/applications/:applicationId/submit", async (req, res): Promise<void> => {
  const params = SubmitApplicationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [application] = await db
    .select()
    .from(enrollmentApplicationsTable)
    .where(
      and(
        eq(enrollmentApplicationsTable.id, params.data.applicationId),
        eq(enrollmentApplicationsTable.clerkUserId, res.locals.userId),
      ),
    )
    .limit(1);
  if (!application) {
    res.status(404).json({ error: "Application not found." });
    return;
  }
  if (application.status !== "draft") {
    res.status(409).json({ error: "This application has already been submitted." });
    return;
  }
  const answers = application.answers ?? {};
  if (
    answers.categoryEntryComplete !== true ||
    !hasRequiredCategoryDetails(application.categoryId, answers)
  ) {
    res.status(400).json({
      error: "Complete the required category details before submitting.",
    });
    return;
  }
  if (Object.keys(answers).length === 0) {
    res.status(400).json({ error: "Complete the application before submitting it." });
    return;
  }
  if (!application.pinHash) {
    res.status(400).json({ error: "Create an enrollment PIN before submitting." });
    return;
  }

  const now = new Date();
  const [submitted] = await db
    .update(enrollmentApplicationsTable)
    .set({
      status: "submitted",
      submittedAt: now,
      updatedAt: now,
    })
    .where(eq(enrollmentApplicationsTable.id, params.data.applicationId))
    .returning();
  if (!submitted) {
    res.status(500).json({ error: "The application could not be submitted." });
    return;
  }
  await db.insert(applicationEventsTable).values({
    applicationId: submitted.id,
    actorUserId: res.locals.userId,
    eventType: "submitted",
  });
  res.json(SubmitApplicationResponse.parse(serializeApplication(submitted)));
});

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const applications = await db
    .select({ status: enrollmentApplicationsTable.status })
    .from(enrollmentApplicationsTable)
    .where(eq(enrollmentApplicationsTable.clerkUserId, res.locals.userId));
  const summary = {
    total: applications.length,
    drafts: applications.filter((application) => application.status === "draft").length,
    inReview: applications.filter((application) =>
      ["submitted", "under_review"].includes(application.status),
    ).length,
    approved: applications.filter((application) => application.status === "approved").length,
    needsAttention: applications.filter(
      (application) => application.status === "needs_information",
    ).length,
  };
  res.json(GetApplicantSummaryResponse.parse(summary));
});

router.get("/support/tickets", async (_req, res): Promise<void> => {
  const tickets = await db
    .select()
    .from(supportTicketsTable)
    .where(eq(supportTicketsTable.clerkUserId, res.locals.userId))
    .orderBy(desc(supportTicketsTable.updatedAt));
  res.json(ListMySupportTicketsResponse.parse(tickets.map(serializeTicket)));
});

router.post("/support/tickets", async (req, res): Promise<void> => {
  const parsed = CreateSupportTicketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const applicationId = parsed.data.applicationId ?? null;
  if (applicationId) {
    const [application] = await db
      .select({ id: enrollmentApplicationsTable.id })
      .from(enrollmentApplicationsTable)
      .where(
        and(
          eq(enrollmentApplicationsTable.id, applicationId),
          eq(enrollmentApplicationsTable.clerkUserId, res.locals.userId),
        ),
      )
      .limit(1);
    if (!application) {
      res.status(404).json({ error: "Application not found." });
      return;
    }
  }
  const [created] = await db
    .insert(supportTicketsTable)
    .values({
      clerkUserId: res.locals.userId,
      applicationId,
      subject: parsed.data.subject,
      message: parsed.data.message,
    })
    .returning();
  if (!created) {
    res.status(500).json({ error: "The support request could not be created." });
    return;
  }
  res.status(201).json(CreateSupportTicketResponse.parse(serializeTicket(created)));
});

router.use("/admin", requireAdmin);

router.get("/admin/applications", async (req, res): Promise<void> => {
  const parsed = ListApplicationsForReviewQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const filters = [];
  if (parsed.data.status) {
    filters.push(
      eq(enrollmentApplicationsTable.status, parsed.data.status as ApplicationStatus),
    );
  } else {
    filters.push(ne(enrollmentApplicationsTable.status, "draft"));
  }
  const applications = await db
    .select()
    .from(enrollmentApplicationsTable)
    .where(and(...filters))
    .orderBy(desc(enrollmentApplicationsTable.updatedAt))
    .limit(300);
  const serialized = applications.map(serializeApplication);
  const search = parsed.data.search?.trim().toLowerCase();
  const results = search
    ? serialized.filter((application) =>
        [
          application.reference,
          application.categoryName,
          application.applicantName ?? "",
          application.applicantEmail ?? "",
          application.status,
        ]
          .join(" ")
          .toLowerCase()
          .includes(search),
      )
    : serialized;
  res.json(ListApplicationsForReviewResponse.parse(results));
});

router.post(
  "/admin/applications/:applicationId/decision",
  async (req, res): Promise<void> => {
    const params = DecideApplicationParams.safeParse(req.params);
    const parsed = DecideApplicationBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({
        error: !params.success
          ? params.error.message
          : parsed.success
            ? "Invalid request."
            : parsed.error.message,
      });
      return;
    }
    const [application] = await db
      .select()
      .from(enrollmentApplicationsTable)
      .where(eq(enrollmentApplicationsTable.id, params.data.applicationId))
      .limit(1);
    if (!application) {
      res.status(404).json({ error: "Application not found." });
      return;
    }
    if (!["submitted", "under_review", "needs_information"].includes(application.status)) {
      res.status(409).json({ error: "This application is not available for review." });
      return;
    }
    if (parsed.data.decision !== "approve" && !parsed.data.note?.trim()) {
      res.status(400).json({ error: "Add a note for this decision." });
      return;
    }

    const nextStatus =
      parsed.data.decision === "approve"
        ? "approved"
        : parsed.data.decision === "reject"
          ? "rejected"
          : "needs_information";
    const [updated] = await db
      .update(enrollmentApplicationsTable)
      .set({
        status: nextStatus,
        reviewNote: parsed.data.note?.trim() || null,
        reviewerUserId: res.locals.userId,
        updatedAt: new Date(),
      })
      .where(eq(enrollmentApplicationsTable.id, params.data.applicationId))
      .returning();
    if (!updated) {
      res.status(500).json({ error: "The application decision could not be saved." });
      return;
    }
    await db.insert(applicationEventsTable).values({
      applicationId: updated.id,
      actorUserId: res.locals.userId,
      eventType: nextStatus,
      note: parsed.data.note?.trim() || null,
    });
    res.json(DecideApplicationResponse.parse(serializeApplication(updated)));
  },
);

router.get("/admin/support/tickets", async (_req, res): Promise<void> => {
  const tickets = await db
    .select()
    .from(supportTicketsTable)
    .orderBy(desc(supportTicketsTable.updatedAt))
    .limit(300);
  res.json(ListSupportTicketsForAdminResponse.parse(tickets.map(serializeTicket)));
});

router.post(
  "/admin/support/tickets/:ticketId/reply",
  async (req, res): Promise<void> => {
    const params = ReplyToSupportTicketParams.safeParse(req.params);
    const parsed = ReplyToSupportTicketBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({
        error: !params.success
          ? params.error.message
          : parsed.success
            ? "Invalid request."
            : parsed.error.message,
      });
      return;
    }
    const [updated] = await db
      .update(supportTicketsTable)
      .set({
        response: parsed.data.response,
        status: parsed.data.status,
        updatedByUserId: res.locals.userId,
        updatedAt: new Date(),
      })
      .where(eq(supportTicketsTable.id, params.data.ticketId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Support request not found." });
      return;
    }
    res.json(ReplyToSupportTicketResponse.parse(serializeTicket(updated)));
  },
);

export default router;
