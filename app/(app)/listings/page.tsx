import { db } from '@/lib/db/client';
import { listings, designs } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';
import { ListingsTable } from './listings-table';

export const dynamic = 'force-dynamic';

export default async function ListingsPage() {
  const rows = await db
    .select({
      id: listings.id,
      title: listings.title,
      status: listings.status,
      etsyListingId: listings.etsyListingId,
      printifyProductId: listings.printifyProductId,
      publishedAt: listings.publishedAt,
      failureReason: listings.failureReason,
      createdAt: listings.createdAt,
      designId: listings.designId,
      designMockupUrl: designs.mockupBlobUrl,
      designHeadline: designs.concept,
    })
    .from(listings)
    .leftJoin(designs, eq(listings.designId, designs.id))
    .orderBy(desc(listings.createdAt));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Listings</h1>
      <ListingsTable rows={rows} />
    </div>
  );
}
