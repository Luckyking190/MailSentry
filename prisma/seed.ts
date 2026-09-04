/**
 * Demo mailbox seed — populated in Phase 7 from `fixtures/eml/`.
 * For now this is a no-op so `npm run db:seed` and `prisma db seed` don't fail.
 */
async function main() {
  console.log("[seed] nothing to seed yet (demo fixtures land in Phase 7)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
