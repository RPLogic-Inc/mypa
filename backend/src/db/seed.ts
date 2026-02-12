import { db, users, teams, cards, responses, reactions, cardContext } from "./index.js";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "../middleware/logging.js";

async function seed() {
  logger.info("Seeding database...");

  // Create team
  const teamId = randomUUID();
  await db.insert(teams).values({
    id: teamId,
    name: "Product Team",
    members: [],
    leads: [],
    createdAt: new Date(),
  });
  logger.info(`Created team: ${teamId}`);

  // Create users
  const userDavid = {
    id: "user-david",
    name: "David Chen",
    email: "david@mypa.chat",
    department: "engineering",
    teamId,
    roles: ["engineer"],
    skills: ["frontend", "react", "typescript"],
    notificationPrefs: { urgentPush: true, digestTime: "09:00" },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const userAisha = {
    id: "user-aisha",
    name: "Aisha Chen",
    email: "aisha@mypa.chat",
    department: "engineering",
    teamId,
    roles: ["engineer"],
    skills: ["backend", "database", "python"],
    notificationPrefs: { urgentPush: true },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const userPriya = {
    id: "user-priya",
    name: "Priya Sharma",
    email: "priya@mypa.chat",
    department: "product",
    teamId,
    roles: ["product_manager"],
    skills: ["product", "strategy", "user-research"],
    notificationPrefs: { urgentPush: true, digestTime: "08:00" },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const userChen = {
    id: "user-chen",
    name: "Chen Wei",
    email: "chen@mypa.chat",
    department: "engineering",
    teamId,
    roles: ["engineer"],
    skills: ["backend", "payments", "stripe"],
    notificationPrefs: { urgentPush: true },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const userRachel = {
    id: "user-rachel",
    name: "Rachel Kim",
    email: "rachel@mypa.chat",
    department: "design",
    teamId,
    roles: ["design_lead"],
    skills: ["ui", "ux", "figma"],
    notificationPrefs: { urgentPush: true },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const userMarcus = {
    id: "user-marcus",
    name: "Marcus Johnson",
    email: "marcus@mypa.chat",
    department: "engineering",
    teamId,
    roles: ["engineering_lead"],
    skills: ["architecture", "backend", "leadership"],
    notificationPrefs: { urgentPush: true, digestTime: "07:30" },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.insert(users).values([
    userDavid,
    userAisha,
    userPriya,
    userChen,
    userRachel,
    userMarcus,
  ]);
  logger.info("Created users");

  // Update team with members
  await db
    .update(teams)
    .set({
      members: [
        "user-david",
        "user-aisha",
        "user-priya",
        "user-chen",
        "user-rachel",
        "user-marcus",
      ],
      leads: ["user-marcus", "user-priya"],
    })
    .where(eq(teams.id, teamId));

  // Create cards (using simplified schema with tags and sourceType)
  const card1 = {
    id: randomUUID(),
    tag: "blocker",
    sourceType: "bot", // From another user's bot
    sourceUserId: "user-aisha",
    fromUserId: "user-aisha",
    toUserIds: ["user-david", "user-marcus"],
    visibility: "team",
    content:
      "I'm blocked on the database migration. The staging server credentials aren't working and I've tried everything in the wiki. Need ops help ASAP or I'll miss the Friday deadline.",
    summary: "Blocked on database migration - needs ops help",
    priority: "high",
    priorityScore: 90,
    priorityReason: "Blocking teammate work, deadline approaching",
    status: "pending",
    dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2),
    relatedCardIds: [],
    createdAt: new Date(Date.now() - 1000 * 60 * 30),
    updatedAt: new Date(),
  };

  const card2 = {
    id: randomUUID(),
    tag: "decision",
    sourceType: "bot",
    sourceUserId: "user-priya",
    fromUserId: "user-priya",
    toUserIds: ["user-david", "user-marcus", "user-rachel"],
    visibility: "team",
    content:
      "Team - we need to decide on the pricing model by Wednesday. Options: (A) flat $99/month, (B) usage-based starting at $49, (C) freemium with paid tiers. I've attached the analysis doc. Please share your take and vote.",
    summary: "Pricing model decision needed by Wednesday",
    priority: "high",
    priorityScore: 85,
    priorityReason: "Decision deadline approaching, stakeholder waiting",
    status: "pending",
    dueDate: new Date(Date.now() + 1000 * 60 * 60 * 48),
    relatedCardIds: [],
    decisionOptions: [
      "Flat $99/month",
      "Usage-based from $49",
      "Freemium with paid tiers",
    ],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4),
    updatedAt: new Date(),
  };

  const card3 = {
    id: randomUUID(),
    tag: "update",
    sourceType: "bot",
    sourceUserId: "user-chen",
    fromUserId: "user-chen",
    toUserIds: ["user-david", "user-marcus"],
    visibility: "team",
    content:
      "Finished the auth module yesterday. Today I'm picking up the payment integration. Might need your help with the Stripe webhook - not blocking yet but will ping if I get stuck.",
    priority: "low",
    priorityScore: 40,
    status: "pending",
    relatedCardIds: [],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
    updatedAt: new Date(),
  };

  const card4 = {
    id: randomUUID(),
    tag: "recognition",
    sourceType: "bot",
    sourceUserId: "user-rachel",
    fromUserId: "user-rachel",
    toUserIds: ["user-david", "user-priya"],
    visibility: "team",
    content:
      "Just wanted to give a shoutout to David for the excellent code review on the onboarding flow. The feedback was detailed, constructive, and helped catch a critical edge case. This is the kind of collaboration that makes our team great!",
    summary: "Recognition for code review excellence",
    priority: "low",
    priorityScore: 30,
    status: "pending",
    relatedCardIds: [],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6),
    updatedAt: new Date(),
  };

  const card5 = {
    id: randomUUID(),
    tag: "task",
    sourceType: "self", // Personal task (message for me)
    fromUserId: "user-david",
    toUserIds: ["user-david"],
    visibility: "private",
    content:
      "Remember to send the Q4 financial summary to the accountant before end of week. Include the updated projections from the board meeting.",
    summary: "Send Q4 financials to accountant",
    priority: "medium",
    priorityScore: 55,
    status: "pending",
    dueDate: new Date(Date.now() + 1000 * 60 * 60 * 72),
    relatedCardIds: [],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
    updatedAt: new Date(),
  };

  await db.insert(cards).values([card1, card2, card3, card4, card5]);
  logger.info("Created cards");

  // Add context entries (Library of Context)
  await db.insert(cardContext).values([
    {
      id: randomUUID(),
      cardId: card1.id,
      userId: "user-aisha",
      userName: "Aisha Chen",
      originalType: "voice",
      originalRawText:
        "I'm blocked on the database migration. The staging server credentials aren't working and I've tried everything in the wiki. Need ops help ASAP or I'll miss the Friday deadline.",
      originalAudioUrl: "/audio/sample-1.webm",
      originalAudioDuration: 15,
      capturedAt: new Date(Date.now() - 1000 * 60 * 30),
      displayBullets: [
        "Blocked on database migration",
        "Staging credentials not working",
        "Tried wiki solutions",
        "Need ops help urgently",
        "Friday deadline at risk",
      ],
      displayGeneratedAt: new Date(),
      displayModelUsed: "claude-sonnet",
      createdAt: new Date(Date.now() - 1000 * 60 * 30),
    },
    {
      id: randomUUID(),
      cardId: card2.id,
      userId: "user-priya",
      userName: "Priya Sharma",
      originalType: "voice",
      originalRawText:
        "Team - we need to decide on the pricing model by Wednesday. Options: A - flat ninety nine dollars per month, B - usage-based starting at forty nine, C - freemium with paid tiers. I've attached the analysis doc. Please share your take and vote.",
      originalAudioUrl: "/audio/sample-2.webm",
      originalAudioDuration: 22,
      capturedAt: new Date(Date.now() - 1000 * 60 * 60 * 4),
      displayBullets: [
        "Pricing model decision needed by Wednesday",
        "Option A: Flat $99/month",
        "Option B: Usage-based from $49",
        "Option C: Freemium with tiers",
        "Analysis doc attached",
      ],
      displayGeneratedAt: new Date(),
      displayModelUsed: "claude-sonnet",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4),
    },
    {
      id: randomUUID(),
      cardId: card2.id,
      userId: "user-marcus",
      userName: "Marcus Johnson",
      originalType: "text",
      originalRawText:
        "I've reviewed all three options. Here's my analysis: Option A gives us predictable revenue but might deter small customers. Option B aligns incentives with customer success but makes forecasting harder. Option C could drive adoption but freemium users rarely convert in our space. Leaning B for now.",
      capturedAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
      displayBullets: [
        "Analyzed all three pricing options",
        "Option A: Predictable but deters small customers",
        "Option B: Aligned incentives, harder forecasting",
        "Option C: Adoption driver but low conversion",
        "Recommendation: Option B",
      ],
      displayGeneratedAt: new Date(),
      displayModelUsed: "claude-sonnet",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
    },
    {
      id: randomUUID(),
      cardId: card5.id,
      userId: "user-david",
      userName: "David Chen",
      originalType: "voice",
      originalRawText:
        "Note to self - send the Q4 financial summary to the accountant before end of week. Make sure to include the updated projections from the board meeting. Also need to double check the revenue recognition numbers with Sarah before sending.",
      originalAudioUrl: "/audio/sample-5.webm",
      originalAudioDuration: 12,
      capturedAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
      displayBullets: [
        "Send Q4 financials to accountant by EOW",
        "Include board meeting projections",
        "Verify revenue recognition with Sarah",
      ],
      displayGeneratedAt: new Date(),
      displayModelUsed: "claude-sonnet",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
    },
  ]);
  logger.info("Created context entries");

  // Add a response to card2
  await db.insert(responses).values({
    id: randomUUID(),
    cardId: card2.id,
    userId: "user-marcus",
    content:
      "I'm leaning toward option B - customers hate flat fees in my experience. The usage-based model also aligns better with our value proposition.",
    createdAt: new Date(Date.now() - 1000 * 60 * 60),
  });
  logger.info("Created responses");

  // Add reactions
  await db.insert(reactions).values([
    {
      id: randomUUID(),
      cardId: card3.id,
      userId: "user-david",
      emoji: "🎉",
      createdAt: new Date(),
    },
    {
      id: randomUUID(),
      cardId: card3.id,
      userId: "user-marcus",
      emoji: "💪",
      createdAt: new Date(),
    },
    {
      id: randomUUID(),
      cardId: card4.id,
      userId: "user-priya",
      emoji: "❤️",
      createdAt: new Date(),
    },
    {
      id: randomUUID(),
      cardId: card4.id,
      userId: "user-chen",
      emoji: "🙌",
      createdAt: new Date(),
    },
  ]);
  logger.info("Created reactions");

  logger.info("Database seeded successfully!");
}

seed().catch((err) => logger.error("Seed failed", err as Error));
