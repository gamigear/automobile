import { NextResponse } from 'next/server';
// db
import { prisma } from 'src/lib/prisma';

export const dynamic = 'force-dynamic';

type Params = { params: { accountId: string } };

export async function GET(_request: Request, { params }: Params) {
  const [postsCount, draftsCount, scheduledCount, publishedCount, failedCount, mediaCount, jobsCount, devicesCount, sourceImportsCount] = await Promise.all([
    prisma.post.count({ where: { socialAccountId: params.accountId, deletedAt: null } }),
    prisma.post.count({ where: { socialAccountId: params.accountId, deletedAt: null, status: 'DRAFT' } }),
    prisma.post.count({ where: { socialAccountId: params.accountId, deletedAt: null, status: 'SCHEDULED' } }),
    prisma.post.count({ where: { socialAccountId: params.accountId, deletedAt: null, status: 'PUBLISHED' } }),
    prisma.post.count({ where: { socialAccountId: params.accountId, deletedAt: null, status: 'FAILED' } }),
    prisma.mediaAsset.count({ where: { socialAccountId: params.accountId } }),
    prisma.jobLog.count({ where: { socialAccountId: params.accountId } }),
    prisma.socialAccountDevice.count({ where: { socialAccountId: params.accountId } }),
    prisma.sourceImport.count({ where: { socialAccountId: params.accountId } }),
  ]);

  return NextResponse.json({
    data: { postsCount, draftsCount, scheduledCount, publishedCount, failedCount, mediaCount, jobsCount, devicesCount, sourceImportsCount },
  });
}
