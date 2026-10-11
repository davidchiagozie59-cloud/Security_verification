import { clerkClient, getAuth } from "@clerk/express";
import {
  and,
  count,
  desc,
  eq,
  inArray,
  ne,
} from "drizzle-orm";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
} from "node:crypto";
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
  AddAdminApplicationNoteBody,
  AddAdminApplicationNoteParams,
  AddAdminApplicationNoteResponse,
  AddApplicantSupportMessageBody,
  AddApplicantSupportMessageParams,
  AddApplicantSupportMessageResponse,
  AssignSupportTicketBody,
  AssignSupportTicketParams,
  AssignSupportTicketResponse,
  DecideApplicationBody,
  DecideApplicationParams,
  DecideApplicationResponse,
  GetAdminApplicationHistoryParams,
  GetAdminApplicationHistoryResponse,
  GetAdminApplicationParams,
  GetAdminApplicationResponse,
  GetAdminOverviewResponse,
  GetApplicationParams,
  GetApplicationResponse,
  GetApplicantSummaryResponse,
  GetPortalSettingsResponse,
  ListAdminUsersQueryParams,
  ListAdminUsersResponse,
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
  UpdateAdminUserStatusBody,
  UpdateAdminUserStatusParams,
  UpdateAdminUserStatusResponse,
  UpdateAdminUserRoleBody,
  UpdateAdminUserRoleParams,
  UpdateAdminUserRoleResponse,
  UpdatePortalSettingsBody,
  UpdatePortalSettingsResponse,
} from "@workspace/api-zod";
import {
  applicationEventsTable,
  db,
  enrollmentApplicationsTable,
  portalSettingsTable,
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

const defaultPortalSettings = {
  hero: {
    title: "Welcome to Our Enrollment Portal",
    description:
      "Select your enrollment category and complete your application through our secure enrollment process.",
    getStartedLabel: "Get Started",
    loginLabel: "Log In",
  },
  cards: [
    {
      id: "category-1",
      title: "Enrollment Category One",
      description: "Complete the registration process for Category One.",
      buttonLabel: "Select Category",
      backgroundColor: "#0EAD46",
      logoDataUrl: null,
    },
    {
      id: "category-2",
      title: "Enrollment Category Two",
      description: "Complete the registration process for Category Two.",
      buttonLabel: "Select Category",
      backgroundColor: "#0C4DA1",
      logoDataUrl: null,
    },
    {
      id: "category-3",
      title: "Enrollment Category Three",
      description: "Complete the registration process for Category Three.",
      buttonLabel: "Select Category",
      backgroundColor: "#0072AE",
      logoDataUrl: null,
    },
    {
      id: "category-4",
      title: "Enrollment Category Four",
      description: "Complete the registration process for Category Four.",
      buttonLabel: "Select Category",
      backgroundColor: "#FFFFFF",
      logoDataUrl: null,
    },
  ],
  theme: {
    pinScreenBackground: "#064E3B",
    buttonSize: "standard",
    buttonPlacement: "right",
    categoryInputTransparent: true,
  },
  screenCopy: {},
};

type CategoryId = (typeof categories)[number]["id"];

async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  try {
    const user = await clerkClient.users.getUser(userId);
    if (user.publicMetadata?.accountStatus === "suspended") {
      res.status(403).json({ error: "This account is suspended. Contact support." });
      return;
    }
    res.locals.userId = userId;
    res.locals.clerkUser = user;
    next();
  } catch (error) {
    req.log.error({ err: error, userId }, "Failed to verify applicant account status");
    res.status(503).json({ error: "Account access could not be verified." });
  }
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
    const user =
      res.locals.clerkUser ?? (await clerkClient.users.getUser(userId));
    const role = user.publicMetadata?.role;
    if (!["admin", "sub_admin", "moderator"].includes(String(role))) {
      res.status(403).json({ error: "Authorized staff access is required." });
      return;
    }
    res.locals.staffRole = role;
    next();
  } catch (error) {
    req.log.error({ err: error, userId }, "Failed to verify administrator role");
    res.status(503).json({ error: "Administrator access could not be verified." });
  }
}

function requireReviewer(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (["admin", "sub_admin"].includes(String(res.locals.staffRole))) {
    next();
    return;
  }
  res.status(403).json({ error: "Enrollment reviewer access is required." });
}

function requirePrimaryAdmin(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.locals.staffRole === "admin") {
    next();
    return;
  }
  res.status(403).json({ error: "Administrator access is required." });
}

function validatePublicImageDataUrl(value: string | null): boolean {
  if (value === null) return true;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+=*)$/.exec(value);
  if (!match) return false;
  const bytes = Buffer.from(match[2]!, "base64");
  if (!bytes.length || bytes.length > 2 * 1024 * 1024) return false;
  const type = match[1];
  if (type === "png") {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (type === "jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
}

function categoryName(categoryId: string): string {
  return categories.find((category) => category.id === categoryId)?.name ?? "Enrollment";
}

function answerString(answers: Record<string, unknown>, key: string): string | null {
  const value = answers[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nestedString(
  answers: Record<string, unknown>,
  section: string,
  key: string,
): string | null {
  const value = asRecord(answers[section])[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function validEmail(value: string | null): boolean {
  return value === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validPhone(value: string | null): boolean {
  return value !== null && /^\+?[0-9][0-9\s().-]{6,19}$/.test(value);
}

function bankEncryptionKey(): Buffer | null {
  const secret = process.env.SESSION_SECRET;
  return secret
    ? createHmac("sha256", secret).update("civic-enroll-bank-v1").digest()
    : null;
}

function encryptAccountNumber(accountNumber: string): string | null {
  const key = bankEncryptionKey();
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(accountNumber, "utf8"),
    cipher.final(),
  ]);
  return [
    "enc:v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

function decryptAccountNumber(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("enc:v1:")) return null;
  const key = bankEncryptionKey();
  if (!key) return null;
  const [, , ivPart, tagPart, ciphertextPart] = value.split(":");
  if (!ivPart || !tagPart || !ciphertextPart) return null;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivPart, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

function prepareApplicantAnswers(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): { answers: Record<string, unknown>; error?: string } {
  const answers = { ...incoming };
  const existingBank = asRecord(existing.bankDetails);
  if (Object.hasOwn(answers, "bankDetails")) {
    const suppliedBank = asRecord(answers.bankDetails);
    const bank = { ...suppliedBank };
    const enteredAccountNumber =
      typeof suppliedBank.accountNumber === "string"
        ? suppliedBank.accountNumber.replace(/\s/g, "")
        : "";
    delete bank.accountNumber;
    delete bank.accountNumberEncrypted;
    delete bank.accountNumberLast4;
    delete bank.accountNumberMasked;

    if (enteredAccountNumber) {
      if (!/^\d{8,20}$/.test(enteredAccountNumber)) {
        return {
          answers,
          error: "Enter a valid account number using 8 to 20 digits.",
        };
      }
      const encrypted = encryptAccountNumber(enteredAccountNumber);
      if (!encrypted) {
        return {
          answers,
          error: "Bank details cannot be saved securely right now.",
        };
      }
      bank.accountNumberEncrypted = encrypted;
      bank.accountNumberLast4 = enteredAccountNumber.slice(-4);
    } else {
      if (typeof existingBank.accountNumberEncrypted === "string") {
        bank.accountNumberEncrypted = existingBank.accountNumberEncrypted;
      }
      if (typeof existingBank.accountNumberLast4 === "string") {
        bank.accountNumberLast4 = existingBank.accountNumberLast4;
      }
    }
    answers.bankDetails = bank;
  }
  if (typeof existing.__requestedSections === "object") {
    answers.__requestedSections = existing.__requestedSections;
  } else {
    delete answers.__requestedSections;
  }
  return { answers };
}

function applicantSafeAnswers(answers: Record<string, unknown>) {
  const safeAnswers = structuredClone(answers);
  const bank = asRecord(safeAnswers.bankDetails);
  if (Object.keys(bank).length > 0) {
    delete bank.accountNumber;
    delete bank.accountNumberEncrypted;
    bank.accountNumberMasked =
      typeof bank.accountNumberLast4 === "string"
        ? `•••• ${bank.accountNumberLast4}`
        : null;
    delete bank.accountNumberLast4;
    safeAnswers.bankDetails = bank;
  }
  return safeAnswers;
}

function privateReviewAnswers(answers: Record<string, unknown>) {
  const result = applicantSafeAnswers(answers);
  const bank = asRecord(result.bankDetails);
  const accountNumber = decryptAccountNumber(
    asRecord(answers.bankDetails).accountNumberEncrypted,
  );
  delete bank.accountNumberMasked;
  if (accountNumber) bank.accountNumber = accountNumber;
  result.bankDetails = bank;
  return result;
}

const wizardSections = [
  "personalInformation",
  "nextOfKin",
  "education",
  "workInformation",
  "proofOfIdentity",
  "liveVideoRecording",
  "bankDetails",
] as const;

function validateFinalApplication(
  categoryId: string,
  answers: Record<string, unknown>,
): string | null {
  if (!categories.some((category) => category.id === categoryId)) {
    return "The selected enrollment category is invalid.";
  }
  if (
    answers.categoryEntryComplete !== true ||
    !hasRequiredCategoryDetails(categoryId, answers)
  ) {
    return "Complete the selected category's entry form first.";
  }
  if (!answers.reviewDeclarationAccepted) {
    return "Confirm the application declaration before submitting.";
  }

  const personal = asRecord(answers.personalInformation);
  for (const [key, label] of [
    ["firstName", "first name"],
    ["surname", "surname"],
    ["dateOfBirth", "date of birth"],
    ["nationality", "nationality"],
    ["phone", "phone number"],
    ["email", "email address"],
    ["residentialAddress", "residential address"],
    ["stateRegion", "state or region"],
    ["city", "city"],
  ]) {
    if (!nestedString(answers, "personalInformation", key)) {
      return `Enter your ${label}.`;
    }
  }
  const dob = nestedString(answers, "personalInformation", "dateOfBirth");
  if (!dob || Number.isNaN(Date.parse(`${dob}T00:00:00Z`)) || dob > new Date().toISOString().slice(0, 10)) {
    return "Enter a valid date of birth that is not in the future.";
  }
  if (!validPhone(nestedString(answers, "personalInformation", "phone"))) {
    return "Enter a valid personal phone number.";
  }
  if (!validEmail(nestedString(answers, "personalInformation", "email"))) {
    return "Enter a valid email address.";
  }

  for (const [key, label] of [
    ["fullName", "full name"],
    ["relationship", "relationship"],
    ["phone", "phone number"],
    ["residentialAddress", "residential address"],
    ["city", "city"],
    ["stateRegion", "state or region"],
  ]) {
    if (!nestedString(answers, "nextOfKin", key)) {
      return `Enter the next of kin's ${label}.`;
    }
  }
  if (!validPhone(nestedString(answers, "nextOfKin", "phone"))) {
    return "Enter a valid next-of-kin phone number.";
  }
  if (!validEmail(nestedString(answers, "nextOfKin", "email"))) {
    return "Enter a valid next-of-kin email address.";
  }

  for (const [key, label] of [
    ["highestQualification", "highest educational qualification"],
    ["institution", "institution"],
    ["courseField", "course or field of study"],
    ["startYear", "education start year"],
    ["completionYear", "education completion year"],
    ["certificationStatus", "certification status"],
  ]) {
    if (!nestedString(answers, "education", key)) {
      return `Enter your ${label}.`;
    }
  }
  const startYear = Number(nestedString(answers, "education", "startYear"));
  const completionYear = Number(nestedString(answers, "education", "completionYear"));
  const currentYear = new Date().getFullYear();
  if (
    !Number.isInteger(startYear) ||
    !Number.isInteger(completionYear) ||
    startYear < 1900 ||
    completionYear < startYear ||
    completionYear > currentYear + 10
  ) {
    return "Enter valid education years in chronological order.";
  }

  const employmentStatus = nestedString(answers, "workInformation", "employmentStatus")?.toLowerCase();
  if (!employmentStatus) return "Select your employment status.";
  if (employmentStatus === "employed") {
    if (
      !nestedString(answers, "workInformation", "occupation") ||
      !nestedString(answers, "workInformation", "employer") ||
      !nestedString(answers, "workInformation", "workAddress")
    ) {
      return "Enter your occupation, employer, and work address.";
    }
  } else if (employmentStatus === "self-employed") {
    if (
      !nestedString(answers, "workInformation", "businessName") ||
      !nestedString(answers, "workInformation", "workAddress")
    ) {
      return "Enter your business name and work address.";
    }
  } else if (!["unemployed", "not currently employed", "student", "retired", "other"].includes(employmentStatus)) {
    return "Select a valid employment status.";
  }

  const identity = asRecord(answers.proofOfIdentity);
  if (
    !nestedString(answers, "proofOfIdentity", "documentType") ||
    typeof identity.frontObjectPath !== "string" ||
    !identity.frontObjectPath
  ) {
    return "Complete the private proof-of-identity upload.";
  }
  const video = asRecord(answers.liveVideoRecording);
  if (
    video.consentAccepted !== true ||
    video.durationSeconds !== 12 ||
    typeof video.objectPath !== "string" ||
    !video.objectPath
  ) {
    return "Confirm a 12-second video recording and complete its private upload.";
  }

  const bank = asRecord(answers.bankDetails);
  const anyBankDetails = ["bankName", "accountHolder", "accountNumberEncrypted"].some(
    (key) => typeof bank[key] === "string" && String(bank[key]).trim().length > 0,
  );
  if (
    anyBankDetails &&
    (!nestedString(answers, "bankDetails", "bankName") ||
      !nestedString(answers, "bankDetails", "accountHolder") ||
      typeof bank.accountNumberEncrypted !== "string")
  ) {
    return "Complete all bank details or leave the optional bank-details section blank.";
  }
  if (personal.gender !== undefined || personal.income !== undefined) {
    // These fields are intentionally not part of this enrollment's required data.
  }
  return null;
}

function isPrivateStorageConfigured(): boolean {
  // No private upload provider is connected; never trust browser-only objects or URLs.
  return false;
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
  includeSensitiveBankDetails = false,
) {
  const answers = application.answers ?? {};
  const applicantAnswers = includeSensitiveBankDetails
    ? privateReviewAnswers(answers)
    : applicantSafeAnswers(answers);
  const personalInformation = asRecord(answers.personalInformation);
  return {
    id: application.id,
    reference: application.reference,
    categoryId: application.categoryId,
    categoryName: categoryName(application.categoryId),
    status: application.status,
    currentStep: application.currentStep,
    hasPin: Boolean(application.pinHash),
    answers: applicantAnswers,
    applicantName:
      answerString(answers, "fullName") ??
      ([
        answerString(answers, "name") ??
          (typeof personalInformation.firstName === "string"
            ? personalInformation.firstName
            : null),
        answerString(answers, "surname") ??
          (typeof personalInformation.surname === "string"
            ? personalInformation.surname
            : null),
      ]
        .filter(Boolean)
        .join(" ") ||
        null),
    applicantEmail:
      answerString(answers, "email") ??
      (typeof personalInformation.email === "string"
        ? personalInformation.email
        : null),
    reviewNote: application.reviewNote,
    createdAt: application.createdAt.toISOString(),
    updatedAt: application.updatedAt.toISOString(),
    submittedAt: application.submittedAt?.toISOString() ?? null,
  };
}

function serializeTicket(
  ticket: typeof supportTicketsTable.$inferSelect,
  applicationReference: string | null = null,
) {
  return {
    id: ticket.id,
    applicantUserId: ticket.clerkUserId,
    applicationId: ticket.applicationId,
    applicationReference,
    subject: ticket.subject,
    category: ticket.category,
    message: ticket.message,
    messages: ticket.messages ?? [],
    assignedToUserId: ticket.assignedToUserId,
    status: ticket.status,
    response: ticket.response,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

async function loadPortalSettings() {
  const [record] = await db
    .select({ value: portalSettingsTable.value })
    .from(portalSettingsTable)
    .where(eq(portalSettingsTable.key, "portal"))
    .limit(1);
  return GetPortalSettingsResponse.parse(record?.value ?? defaultPortalSettings);
}

router.get("/portal/settings", async (req, res): Promise<void> => {
  try {
    res.json(await loadPortalSettings());
  } catch (error) {
    req.log.error({ err: error }, "Failed to load portal settings");
    res.status(503).json({ error: "Portal settings are temporarily unavailable." });
  }
});

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
  res.json(ListMyApplicationsResponse.parse(applications.map((application) => serializeApplication(application))));
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
        eq(enrollmentApplicationsTable.categoryId, categoryId),
        inArray(enrollmentApplicationsTable.status, [...activeStatuses]),
      ),
    )
    .orderBy(desc(enrollmentApplicationsTable.updatedAt))
    .limit(1);

  if (existing) {
    res.status(201).json(CreateApplicationResponse.parse(serializeApplication(existing)));
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
  if (!["draft", "needs_information"].includes(application.status)) {
    res.status(409).json({ error: "This application is locked against ordinary edits." });
    return;
  }

  const nextCategoryId = parsed.data.categoryId;
  if (application.status === "needs_information" && nextCategoryId) {
    res.status(403).json({
      error: "An application under correction cannot change its selected category.",
    });
    return;
  }
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
  let submittedAnswers = parsed.data.answers;
  if (submittedAnswers && application.status === "needs_information") {
    const requested = application.answers?.__requestedSections;
    const requestedSections = Array.isArray(requested)
      ? requested.filter(
          (index): index is number =>
            Number.isInteger(index) && index >= 0 && index <= 6,
        )
      : [];
    if (requestedSections.length === 0) {
      res.status(403).json({
        error: "No application sections have been reopened for correction.",
      });
      return;
    }
    const changedSections = Object.keys(submittedAnswers).filter((key) => {
      if (key === "__requestedSections") return false;
      return JSON.stringify(submittedAnswers?.[key]) !==
        JSON.stringify(application.answers?.[key]);
    });
    const unauthorizedChange = changedSections.some((key) => {
      if (key === "reviewDeclarationAccepted") return false;
      const sectionIndex = wizardSections.indexOf(
        key as (typeof wizardSections)[number],
      );
      return sectionIndex < 0 || !requestedSections.includes(sectionIndex);
    });
    if (unauthorizedChange) {
      res.status(403).json({
        error: "Only sections specifically reopened by a reviewer can be changed.",
      });
      return;
    }
  }
  let nextAnswers = submittedAnswers ?? application.answers ?? {};
  if (!categoryChanged && submittedAnswers) {
    const prepared = prepareApplicantAnswers(
      application.answers ?? {},
      submittedAnswers,
    );
    if (prepared.error) {
      res.status(400).json({ error: prepared.error });
      return;
    }
    nextAnswers = prepared.answers;
    submittedAnswers = nextAnswers;
  }
  const entryIsComplete = nextAnswers.categoryEntryComplete === true;
  const wasEntryComplete = application.answers?.categoryEntryComplete === true;
  if (
    submittedAnswers?.categoryEntryComplete === true &&
    !hasRequiredCategoryDetails(application.categoryId, nextAnswers)
  ) {
    res.status(400).json({
      error: "Enter all required category details before continuing.",
    });
    return;
  }
  if (
    submittedAnswers?.categoryEntryComplete === true &&
    !wasEntryComplete &&
    !parsed.data.pin
  ) {
    res.status(400).json({
      error: "Create the required category PIN before continuing.",
    });
    return;
  }
  if (
    submittedAnswers?.categoryEntryComplete === true &&
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
      ...(!categoryChanged && submittedAnswers !== undefined
        ? { answers: submittedAnswers }
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
  if (!["draft", "needs_information"].includes(application.status)) {
    res.status(409).json({ error: "This application has already been submitted." });
    return;
  }
  const answers = application.answers ?? {};
  if (!application.pinHash) {
    res.status(400).json({ error: "Create an enrollment PIN before submitting." });
    return;
  }
  if (application.currentStep < 7) {
    res.status(400).json({ error: "Complete all eight enrollment stages first." });
    return;
  }
  const validationError = validateFinalApplication(application.categoryId, answers);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }
  if (!isPrivateStorageConfigured()) {
    res.status(503).json({
      error:
        "Secure document and video storage is unavailable. The application was not submitted.",
      code: "PRIVATE_UPLOAD_STORAGE_UNAVAILABLE",
    });
    return;
  }

  const now = new Date();
  const submitted = await db.transaction(async (transaction) => {
    const [row] = await transaction
      .update(enrollmentApplicationsTable)
      .set({
        status: "submitted",
        answers: { ...answers, __requestedSections: [] },
        submittedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(enrollmentApplicationsTable.id, params.data.applicationId),
          eq(enrollmentApplicationsTable.clerkUserId, res.locals.userId),
          eq(enrollmentApplicationsTable.categoryId, application.categoryId),
          eq(enrollmentApplicationsTable.status, application.status),
          eq(enrollmentApplicationsTable.currentStep, 7),
        ),
      )
      .returning();
    if (!row) return null;
    await transaction.insert(applicationEventsTable).values({
      applicationId: row.id,
      actorUserId: res.locals.userId,
      eventType: `status_changed:${application.status}->submitted`,
      note:
        application.status === "needs_information"
          ? application.reviewNote
          : "Submitted for review.",
    });
    return row;
  });
  if (!submitted) {
    res.status(409).json({
      error: "The application changed while it was being submitted. Refresh and try again.",
    });
    return;
  }
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
  const applications = await db.select({
    id: enrollmentApplicationsTable.id,
    reference: enrollmentApplicationsTable.reference,
  }).from(enrollmentApplicationsTable);
  const references = new Map(applications.map((application) => [application.id, application.reference]));
  res.json(
    ListMySupportTicketsResponse.parse(
      tickets.map((ticket) =>
        serializeTicket(ticket, ticket.applicationId ? references.get(ticket.applicationId) ?? null : null),
      ),
    ),
  );
});

router.post("/support/tickets", async (req, res): Promise<void> => {
  const parsed = CreateSupportTicketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const applicationId = parsed.data.applicationId ?? null;
  let applicationReference: string | null = null;
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
    const [record] = await db
      .select({ reference: enrollmentApplicationsTable.reference })
      .from(enrollmentApplicationsTable)
      .where(eq(enrollmentApplicationsTable.id, applicationId))
      .limit(1);
    applicationReference = record?.reference ?? null;
  }
  const createdAt = new Date().toISOString();
  const firstMessage = {
    id: randomUUID(),
    actorUserId: res.locals.userId as string,
    actorRole: "applicant" as const,
    body: parsed.data.message.trim(),
    createdAt,
  };
  const [created] = await db
    .insert(supportTicketsTable)
    .values({
      clerkUserId: res.locals.userId,
      applicationId,
      subject: parsed.data.subject,
      category: parsed.data.category,
      message: parsed.data.message,
      messages: [firstMessage],
    })
    .returning();
  if (!created) {
    res.status(500).json({ error: "The support request could not be created." });
    return;
  }
  res.status(201).json(
    CreateSupportTicketResponse.parse(
      serializeTicket(created, applicationReference),
    ),
  );
});

router.post(
  "/support/tickets/:ticketId/messages",
  async (req, res): Promise<void> => {
    const params = AddApplicantSupportMessageParams.safeParse(req.params);
    const parsed = AddApplicantSupportMessageBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({
        error: !params.success ? params.error.message : (parsed.error?.message ?? "Invalid request body"),
      });
      return;
    }
    const [ticket] = await db
      .select()
      .from(supportTicketsTable)
      .where(
        and(
          eq(supportTicketsTable.id, params.data.ticketId),
          eq(supportTicketsTable.clerkUserId, res.locals.userId),
        ),
      )
      .limit(1);
    if (!ticket) {
      res.status(404).json({ error: "Support request not found." });
      return;
    }
    if (["resolved", "closed"].includes(ticket.status)) {
      res.status(409).json({
        error: "This support request is resolved. Start a new request if needed.",
      });
      return;
    }
    const [updated] = await db
      .update(supportTicketsTable)
      .set({
        messages: [
          ...(ticket.messages ?? []),
          {
            id: randomUUID(),
            actorUserId: res.locals.userId,
            actorRole: "applicant",
            body: parsed.data.message.trim(),
            createdAt: new Date().toISOString(),
          },
        ],
        status: "open",
        updatedByUserId: res.locals.userId,
        updatedAt: new Date(),
      })
      .where(eq(supportTicketsTable.id, ticket.id))
      .returning();
    if (!updated) {
      res.status(500).json({ error: "Your message could not be saved." });
      return;
    }
    let reference: string | null = null;
    if (updated.applicationId) {
      const [application] = await db
        .select({ reference: enrollmentApplicationsTable.reference })
        .from(enrollmentApplicationsTable)
        .where(eq(enrollmentApplicationsTable.id, updated.applicationId))
        .limit(1);
      reference = application?.reference ?? null;
    }
    res.status(201).json(
      AddApplicantSupportMessageResponse.parse(
        serializeTicket(updated, reference),
      ),
    );
  },
);
router.use("/admin", requireAdmin);

router.put("/admin/settings", requirePrimaryAdmin, async (req, res): Promise<void> => {
  const parsed = UpdatePortalSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const ids = parsed.data.cards.map((card) => card.id);
  if (new Set(ids).size !== 4 || categories.some((category) => !ids.includes(category.id))) {
    res.status(400).json({ error: "Settings must contain each of the four enrollment cards exactly once." });
    return;
  }
  if (parsed.data.cards.some((card) => !validatePublicImageDataUrl(card.logoDataUrl))) {
    res.status(400).json({ error: "Card logos must be valid PNG, JPEG, or WebP images no larger than 2 MB." });
    return;
  }
  try {
    const [record] = await db
      .insert(portalSettingsTable)
      .values({
        key: "portal",
        value: parsed.data,
        updatedByUserId: res.locals.userId,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: portalSettingsTable.key,
        set: {
          value: parsed.data,
          updatedByUserId: res.locals.userId,
          updatedAt: new Date(),
        },
      })
      .returning({ value: portalSettingsTable.value });
    res.json(UpdatePortalSettingsResponse.parse(record?.value ?? parsed.data));
  } catch (error) {
    req.log.error({ err: error }, "Failed to save portal settings");
    res.status(503).json({ error: "Portal settings could not be saved." });
  }
});

router.get("/admin/overview", requireReviewer, async (req, res): Promise<void> => {
  try {
    const [users, total, submitted, underReview, approved, rejected, needsInformation, unresolved] =
      await Promise.all([
        clerkClient.users.getUserList({ limit: 1 }),
        db.select({ value: count() }).from(enrollmentApplicationsTable),
        db
          .select({ value: count() })
          .from(enrollmentApplicationsTable)
          .where(eq(enrollmentApplicationsTable.status, "submitted")),
        db
          .select({ value: count() })
          .from(enrollmentApplicationsTable)
          .where(eq(enrollmentApplicationsTable.status, "under_review")),
        db
          .select({ value: count() })
          .from(enrollmentApplicationsTable)
          .where(eq(enrollmentApplicationsTable.status, "approved")),
        db
          .select({ value: count() })
          .from(enrollmentApplicationsTable)
          .where(eq(enrollmentApplicationsTable.status, "rejected")),
        db
          .select({ value: count() })
          .from(enrollmentApplicationsTable)
          .where(eq(enrollmentApplicationsTable.status, "needs_information")),
        db
          .select({ value: count() })
          .from(supportTicketsTable)
          .where(inArray(supportTicketsTable.status, ["open", "in_progress"])),
      ]);
    const [totalUsers] = [Number(users.totalCount ?? users.data.length)];
    res.json(
      GetAdminOverviewResponse.parse({
        totalUsers,
        totalApplications: Number(total[0]?.value ?? 0),
        pendingApplications: Number(submitted[0]?.value ?? 0),
        underReviewApplications: Number(underReview[0]?.value ?? 0),
        approvedApplications: Number(approved[0]?.value ?? 0),
        rejectedApplications: Number(rejected[0]?.value ?? 0),
        needsInformationApplications: Number(needsInformation[0]?.value ?? 0),
        unresolvedSupportRequests: Number(unresolved[0]?.value ?? 0),
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Failed to load administrator overview");
    res.status(503).json({ error: "Dashboard totals are temporarily unavailable." });
  }
});

router.get("/admin/users", requirePrimaryAdmin, async (req, res): Promise<void> => {
  const parsed = ListAdminUsersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const [usersPage, applications] = await Promise.all([
      clerkClient.users.getUserList({ limit: 500 }),
      db
        .select()
        .from(enrollmentApplicationsTable)
        .orderBy(desc(enrollmentApplicationsTable.updatedAt)),
    ]);
    const latestByUser = new Map<string, (typeof applications)[number]>();
    for (const application of applications) {
      if (!latestByUser.has(application.clerkUserId)) {
        latestByUser.set(application.clerkUserId, application);
      }
    }
    const search = parsed.data.search?.trim().toLowerCase() ?? "";
    const users = usersPage.data
      .map((user) => {
        const application = latestByUser.get(user.id);
        const staffRole = user.publicMetadata?.role;
        const accountStatus =
          user.publicMetadata?.accountStatus === "suspended"
            ? "suspended"
            : "active";
        const name =
          [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || null;
        const email =
          user.emailAddresses.find(
            (address) => address.id === user.primaryEmailAddressId,
          )?.emailAddress ??
          user.emailAddresses[0]?.emailAddress ??
          null;
        const enrollmentStatus =
          application?.status === "draft" && application.currentStep > 0
            ? "in_progress"
            : application?.status ?? null;
        return {
          userId: user.id,
          name,
          username: user.username ?? null,
          email,
          role: ["admin", "sub_admin", "moderator"].includes(String(staffRole))
            ? staffRole
            : "applicant",
          accountStatus,
          applicationId: application?.id ?? null,
          categoryId: application?.categoryId ?? null,
          categoryName: application ? categoryName(application.categoryId) : null,
          applicationReference: application?.reference ?? null,
          registrationDate: new Date(user.createdAt).toISOString(),
          enrollmentStatus,
        };
      })
      .filter((user) => {
        if (
          parsed.data.accountStatus &&
          user.accountStatus !== parsed.data.accountStatus
        ) {
          return false;
        }
        return (
          !search ||
          [
            user.userId,
            user.name,
            user.username,
            user.email,
            user.categoryName,
            user.applicationReference,
            user.enrollmentStatus,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(search)
        );
      });
    res.json(
      ListAdminUsersResponse.parse({
        users,
        totalCount: usersPage.totalCount ?? usersPage.data.length,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Failed to load administrator user list");
    res.status(503).json({ error: "User accounts are temporarily unavailable." });
  }
});

router.patch("/admin/users/:userId/status", requirePrimaryAdmin, async (req, res): Promise<void> => {
  const params = UpdateAdminUserStatusParams.safeParse(req.params);
  const parsed = UpdateAdminUserStatusBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({
      error: !params.success ? params.error.message : (parsed.error?.message ?? "Invalid request body"),
    });
    return;
  }
  if (params.data.userId === res.locals.userId) {
    res.status(400).json({ error: "You cannot suspend your own staff account." });
    return;
  }
  try {
    const target = await clerkClient.users.getUser(params.data.userId);
      if (["admin", "sub_admin", "moderator"].includes(String(target.publicMetadata?.role))) {
      res.status(403).json({ error: "Staff accounts cannot be suspended here." });
      return;
    }
    const updated = await clerkClient.users.updateUserMetadata(params.data.userId, {
      publicMetadata: { accountStatus: parsed.data.accountStatus },
    });
    const email =
      updated.emailAddresses.find(
        (address) => address.id === updated.primaryEmailAddressId,
      )?.emailAddress ??
      updated.emailAddresses[0]?.emailAddress ??
      null;
    res.json(
      UpdateAdminUserStatusResponse.parse({
        userId: updated.id,
        name:
          [updated.firstName, updated.lastName].filter(Boolean).join(" ").trim() ||
          null,
        username: updated.username ?? null,
        email,
        role: "applicant",
        accountStatus: parsed.data.accountStatus,
        applicationId: null,
        categoryId: null,
        categoryName: null,
        applicationReference: null,
        registrationDate: new Date(updated.createdAt).toISOString(),
        enrollmentStatus: null,
      }),
    );
  } catch (error) {
    req.log.error({ err: error, targetUserId: params.data.userId }, "Failed to update user account status");
    res.status(503).json({ error: "The account status could not be changed." });
  }
});

router.patch("/admin/users/:userId/role", requirePrimaryAdmin, async (req, res): Promise<void> => {
  const params = UpdateAdminUserRoleParams.safeParse(req.params);
  const parsed = UpdateAdminUserRoleBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: !params.success ? params.error.message : (parsed.error?.message ?? "Invalid request body") });
    return;
  }
  if (params.data.userId === res.locals.userId) {
    res.status(400).json({ error: "You cannot change your own staff role." });
    return;
  }
  try {
    const target = await clerkClient.users.getUser(params.data.userId);
    const updated = await clerkClient.users.updateUserMetadata(params.data.userId, {
      publicMetadata: { role: parsed.data.role },
    });
    const email =
      updated.emailAddresses.find((address) => address.id === updated.primaryEmailAddressId)?.emailAddress ??
      updated.emailAddresses[0]?.emailAddress ??
      null;
    res.json(UpdateAdminUserRoleResponse.parse({
      userId: updated.id,
      name: [updated.firstName, updated.lastName].filter(Boolean).join(" ").trim() || null,
      username: updated.username ?? null,
      email,
      role: parsed.data.role,
      accountStatus: updated.publicMetadata?.accountStatus === "suspended" ? "suspended" : "active",
      applicationId: null,
      categoryId: null,
      categoryName: null,
      applicationReference: null,
      registrationDate: new Date(updated.createdAt).toISOString(),
      enrollmentStatus: null,
    }));
  } catch (error) {
    req.log.error({ err: error, targetUserId: params.data.userId }, "Failed to assign staff role");
    res.status(503).json({ error: "The user role could not be changed." });
  }
});

router.get("/admin/applications/:applicationId", requireReviewer, async (req, res): Promise<void> => {
  const params = GetAdminApplicationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
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
  res.json(
    GetAdminApplicationResponse.parse(
      serializeApplication(application, true),
    ),
  );
});

router.get(
  "/admin/applications/:applicationId/history",
  requireReviewer,
  async (req, res): Promise<void> => {
    const params = GetAdminApplicationHistoryParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const events = await db
      .select()
      .from(applicationEventsTable)
      .where(eq(applicationEventsTable.applicationId, params.data.applicationId))
      .orderBy(desc(applicationEventsTable.createdAt))
      .limit(300);
    res.json(
      GetAdminApplicationHistoryResponse.parse(
        events.map((event) => ({
          id: event.id,
          eventType: event.eventType,
          note: event.note,
          createdAt: event.createdAt.toISOString(),
          actorUserId: event.actorUserId,
        })),
      ),
    );
  },
);

router.post(
  "/admin/applications/:applicationId/notes",
  requireReviewer,
  async (req, res): Promise<void> => {
    const params = AddAdminApplicationNoteParams.safeParse(req.params);
    const parsed = AddAdminApplicationNoteBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({
        error: !params.success ? params.error.message : (parsed.error?.message ?? "Invalid request body"),
      });
      return;
    }
    const [application] = await db
      .select({ id: enrollmentApplicationsTable.id })
      .from(enrollmentApplicationsTable)
      .where(eq(enrollmentApplicationsTable.id, params.data.applicationId))
      .limit(1);
    if (!application) {
      res.status(404).json({ error: "Application not found." });
      return;
    }
    const [event] = await db
      .insert(applicationEventsTable)
      .values({
        applicationId: application.id,
        actorUserId: res.locals.userId,
        eventType: "internal_note",
        note: parsed.data.note.trim(),
      })
      .returning();
    if (!event) {
      res.status(500).json({ error: "The internal note could not be saved." });
      return;
    }
    res.status(201).json(
      AddAdminApplicationNoteResponse.parse({
        id: event.id,
        eventType: event.eventType,
        note: event.note,
        createdAt: event.createdAt.toISOString(),
        actorUserId: event.actorUserId,
      }),
    );
  },
);

router.get("/admin/applications", requireReviewer, async (req, res): Promise<void> => {
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
  const serialized = applications.map((application) => serializeApplication(application));
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
  requireReviewer,
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
    if (
      ["reject", "request_information"].includes(parsed.data.decision) &&
      !parsed.data.note?.trim()
    ) {
      res.status(400).json({ error: "Add a note for this decision." });
      return;
    }
    if (
      parsed.data.decision === "request_information" &&
      (!parsed.data.reopenSections || parsed.data.reopenSections.length === 0)
    ) {
      res.status(400).json({
        error: "Select at least one application section to reopen.",
      });
      return;
    }

    const nextStatus =
      parsed.data.decision === "approve"
        ? "approved"
        : parsed.data.decision === "reject"
          ? "rejected"
          : parsed.data.decision === "mark_under_review"
            ? "under_review"
            : "needs_information";
    const now = new Date();
    const nextAnswers = {
      ...(application.answers ?? {}),
      __requestedSections:
        parsed.data.decision === "request_information"
          ? parsed.data.reopenSections ?? []
          : [],
    };
    const updated = await db.transaction(async (transaction) => {
      const [row] = await transaction
        .update(enrollmentApplicationsTable)
        .set({
          status: nextStatus,
          answers: nextAnswers,
          reviewNote: parsed.data.note?.trim() || null,
          reviewerUserId: res.locals.userId,
          updatedAt: now,
        })
        .where(
          and(
            eq(enrollmentApplicationsTable.id, params.data.applicationId),
            eq(enrollmentApplicationsTable.status, application.status),
          ),
        )
        .returning();
      if (!row) return null;
      await transaction.insert(applicationEventsTable).values({
        applicationId: row.id,
        actorUserId: res.locals.userId,
        eventType: `status_changed:${application.status}->${nextStatus}`,
        note: parsed.data.note?.trim() || null,
      });
      return row;
    });
    if (!updated) {
      res.status(409).json({
        error: "The application changed while this decision was being recorded.",
      });
      return;
    }
    res.json(DecideApplicationResponse.parse(serializeApplication(updated)));
  },
);

router.get("/admin/support/tickets", async (req, res): Promise<void> => {
  const tickets = await db
    .select()
    .from(supportTicketsTable)
    .orderBy(desc(supportTicketsTable.updatedAt))
    .limit(300);
  const [applications, userPage] = await Promise.all([
    db
      .select({
        id: enrollmentApplicationsTable.id,
        reference: enrollmentApplicationsTable.reference,
      })
      .from(enrollmentApplicationsTable),
    clerkClient.users.getUserList({ limit: 500 }),
  ]);
  const references = new Map(applications.map((application) => [application.id, application.reference]));
  const usersById = new Map(userPage.data.map((user) => [
    user.id,
    [
      user.id,
      user.username ?? "",
      user.firstName ?? "",
      user.lastName ?? "",
      ...user.emailAddresses.map((address) => address.emailAddress),
    ].join(" ").toLowerCase(),
  ]));
  const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
  const status = typeof req.query.status === "string" ? req.query.status : "";
  const serialized = tickets.map((ticket) =>
    serializeTicket(
      ticket,
      ticket.applicationId ? references.get(ticket.applicationId) ?? null : null,
    ),
  );
  const filtered = serialized.filter((ticket) => {
    if (status && ticket.status !== status) return false;
    if (!search) return true;
    return [
      ticket.applicantUserId,
      ticket.applicationReference,
      ticket.subject,
      ticket.category,
      ticket.message,
      usersById.get(ticket.applicantUserId) ?? "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(search);
  });
  res.json(ListSupportTicketsForAdminResponse.parse(filtered));
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
    const [ticket] = await db
      .select()
      .from(supportTicketsTable)
      .where(eq(supportTicketsTable.id, params.data.ticketId))
      .limit(1);
    if (!ticket) {
      res.status(404).json({ error: "Support request not found." });
      return;
    }
    const now = new Date();
    const [updated] = await db
      .update(supportTicketsTable)
      .set({
        response: parsed.data.response,
        status: parsed.data.status,
        messages: [
          ...(ticket.messages ?? []),
          {
            id: randomUUID(),
            actorUserId: res.locals.userId,
            actorRole: "administrator",
            body: parsed.data.response.trim(),
            createdAt: now.toISOString(),
          },
        ],
        updatedByUserId: res.locals.userId,
        updatedAt: now,
      })
      .where(eq(supportTicketsTable.id, params.data.ticketId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Support request not found." });
      return;
    }
    let reference: string | null = null;
    if (updated.applicationId) {
      const [application] = await db
        .select({ reference: enrollmentApplicationsTable.reference })
        .from(enrollmentApplicationsTable)
        .where(eq(enrollmentApplicationsTable.id, updated.applicationId))
        .limit(1);
      reference = application?.reference ?? null;
    }
    res.json(
      ReplyToSupportTicketResponse.parse(serializeTicket(updated, reference)),
    );
  },
);

router.patch(
  "/admin/support/tickets/:ticketId/assignment",
  async (req, res): Promise<void> => {
    const params = AssignSupportTicketParams.safeParse(req.params);
    const parsed = AssignSupportTicketBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({
        error: !params.success ? params.error.message : (parsed.error?.message ?? "Invalid request body"),
      });
      return;
    }
    if (parsed.data.assigneeUserId) {
      try {
        const assignee = await clerkClient.users.getUser(
          parsed.data.assigneeUserId,
        );
        if (!["admin", "sub_admin", "moderator"].includes(String(assignee.publicMetadata?.role))) {
          res.status(403).json({
            error: "Support requests can only be assigned to authorized staff.",
          });
          return;
        }
      } catch (error) {
        req.log.error(
          { err: error, assigneeUserId: parsed.data.assigneeUserId },
          "Failed to verify support assignee",
        );
        res.status(404).json({ error: "Authorized staff member not found." });
        return;
      }
    }
    const [updated] = await db
      .update(supportTicketsTable)
      .set({
        assignedToUserId: parsed.data.assigneeUserId,
        updatedByUserId: res.locals.userId,
        updatedAt: new Date(),
      })
      .where(eq(supportTicketsTable.id, params.data.ticketId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Support request not found." });
      return;
    }
    let reference: string | null = null;
    if (updated.applicationId) {
      const [application] = await db
        .select({ reference: enrollmentApplicationsTable.reference })
        .from(enrollmentApplicationsTable)
        .where(eq(enrollmentApplicationsTable.id, updated.applicationId))
        .limit(1);
      reference = application?.reference ?? null;
    }
    res.json(
      AssignSupportTicketResponse.parse(serializeTicket(updated, reference)),
    );
  },
);

export default router;
