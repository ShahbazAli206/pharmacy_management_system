import { prisma } from '../config/prisma';
import { getRecallFeedProvider } from '../services/recallFeed';
import { ingestRecall } from '../modules/recalls/recalls.service';

/**
 * Poll Health Canada's recall feed and ingest anything new since the last
 * run (spec §10.1: replace manual-only recall ingest with a real feed poll).
 * The cursor is a plain SystemSetting row — this job runs at most a few
 * times an hour, so it doesn't need its own dedicated model.
 */
const CURSOR_KEY = 'recallFeedLastPolledAt';

export async function runRecallPollJob() {
  const provider = getRecallFeedProvider();
  const cursorRow = await prisma.systemSetting.findUnique({ where: { key: CURSOR_KEY } });
  const since: string | undefined = cursorRow ? JSON.parse(cursorRow.value) : undefined;

  const items = await provider.fetchDrugRecalls(since);

  let ingested = 0;
  for (const item of items) {
    await ingestRecall({
      recallNumber: item.recallNumber,
      productName: item.productName,
      reason: item.reason,
      risk: item.risk,
      publishedAt: item.publishedAt,
      // Deliberately no `din` — see services/recallFeed.ts for why the feed
      // can't supply one; ingestRecall already treats a missing DIN as
      // "record it, but nothing to auto-match/quarantine."
    });
    ingested++;
  }

  const now = new Date().toISOString();
  await prisma.systemSetting.upsert({
    where: { key: CURSOR_KEY },
    update: { value: JSON.stringify(now) },
    create: { key: CURSOR_KEY, value: JSON.stringify(now) },
  });

  return { provider: provider.name, fetched: items.length, ingested, polledAt: now };
}
