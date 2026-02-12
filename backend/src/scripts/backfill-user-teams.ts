/**
 * Backfill user_teams junction table from existing users.teamId values.
 *
 * Run ONCE on server after schema migration (npx drizzle-kit push).
 * Idempotent — safe to run multiple times (ON CONFLICT DO NOTHING).
 *
 * Usage:
 *   cd /var/mypa/backend
 *   npx tsx src/scripts/backfill-user-teams.ts
 */

import "dotenv/config";
import { createClient } from "@libsql/client";

const DATABASE_URL = process.env.DATABASE_URL || "file:./mypa.db";

async function main() {
  console.log(`Connecting to ${DATABASE_URL}...`);
  const client = createClient({ url: DATABASE_URL });

  // Step 1: Insert all users with a teamId into user_teams as "member"
  const usersWithTeam = await client.execute(
    "SELECT id, team_id, created_at FROM users WHERE team_id IS NOT NULL"
  );
  console.log(`Found ${usersWithTeam.rows.length} users with a teamId.`);

  let inserted = 0;
  for (const row of usersWithTeam.rows) {
    try {
      await client.execute({
        sql: `INSERT INTO user_teams (user_id, team_id, role, joined_at)
              VALUES (?, ?, 'member', ?)
              ON CONFLICT DO NOTHING`,
        args: [row.id as string, row.team_id as string, row.created_at as number],
      });
      inserted++;
    } catch (err) {
      console.error(`  Failed to insert user ${row.id}:`, err);
    }
  }
  console.log(`Inserted ${inserted} user_teams rows (member role).`);

  // Step 2: Promote leads based on teams.leads JSON array
  const allTeams = await client.execute("SELECT id, leads FROM teams");
  let promoted = 0;
  for (const team of allTeams.rows) {
    const leadsJson = team.leads as string;
    let leads: string[] = [];
    try {
      leads = JSON.parse(leadsJson || "[]");
    } catch {
      continue;
    }

    for (const leadId of leads) {
      try {
        await client.execute({
          sql: `UPDATE user_teams SET role = 'lead' WHERE user_id = ? AND team_id = ?`,
          args: [leadId, team.id as string],
        });
        promoted++;
      } catch (err) {
        console.error(`  Failed to promote lead ${leadId}:`, err);
      }
    }
  }
  console.log(`Promoted ${promoted} users to 'lead' role.`);

  // Step 3: Summary
  const total = await client.execute("SELECT count(*) as count FROM user_teams");
  console.log(`\nTotal user_teams rows: ${total.rows[0].count}`);
  console.log("Backfill complete.");

  client.close();
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
