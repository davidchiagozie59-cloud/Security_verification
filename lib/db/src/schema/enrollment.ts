import { createInsertSchema } from "drizzle-zod";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const applicationStatus = pgEnum("application_status", [
  "draft",
  "submitted",
  "under_review",
  "needs_information",
  "approved",
  "rejected",
]);

export const supportStatus = pgEnum("support_status", [
  "open",
  "in_progress",
  "resolved",
  "answered",
  "closed",
]);

export const enrollmentApplicationsTable = pgTable(
  "enrollment_applications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reference: text("reference").notNull().unique(),
    clerkUserId: text("clerk_user_id").notNull(),
    categoryId: text("category_id").notNull(),
    status: applicationStatus("status").notNull().default("draft"),
    currentStep: integer("current_step").notNull().default(0),
    pinHash: text("pin_hash"),
    answers: jsonb("answers")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    reviewNote: text("review_note"),
    reviewerUserId: text("reviewer_user_id"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("enrollment_applications_owner_idx").on(table.clerkUserId),
    index("enrollment_applications_status_idx").on(table.status),
    index("enrollment_applications_category_idx").on(table.categoryId),
  ],
);

export const applicationEventsTable = pgTable(
  "application_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => enrollmentApplicationsTable.id, {
        onDelete: "cascade",
      }),
    actorUserId: text("actor_user_id").notNull(),
    eventType: text("event_type").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("application_events_application_idx").on(table.applicationId),
  ],
);

export const supportTicketsTable = pgTable(
  "enrollment_support_tickets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    applicationId: uuid("application_id").references(
      () => enrollmentApplicationsTable.id,
      { onDelete: "set null" },
    ),
    subject: text("subject").notNull(),
    category: text("category").notNull().default("other"),
    message: text("message").notNull(),
    messages: jsonb("messages")
      .$type<
        Array<{
          id: string;
          actorUserId: string;
          actorRole: "applicant" | "administrator";
          body: string;
          createdAt: string;
        }>
      >()
      .notNull()
      .default([]),
    status: supportStatus("status").notNull().default("open"),
    response: text("response"),
    assignedToUserId: text("assigned_to_user_id"),
    updatedByUserId: text("updated_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("enrollment_support_owner_idx").on(table.clerkUserId),
    index("enrollment_support_status_idx").on(table.status),
  ],
);

export const portalSettingsTable = pgTable("portal_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull(),
  updatedByUserId: text("updated_by_user_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertEnrollmentApplicationSchema = createInsertSchema(
  enrollmentApplicationsTable,
).omit({
  id: true,
  reference: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEnrollmentApplication = z.infer<
  typeof insertEnrollmentApplicationSchema
>;
export type EnrollmentApplication =
  typeof enrollmentApplicationsTable.$inferSelect;
export type ApplicationEvent = typeof applicationEventsTable.$inferSelect;
export type SupportTicket = typeof supportTicketsTable.$inferSelect;
