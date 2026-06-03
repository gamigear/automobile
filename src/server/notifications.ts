import { prisma } from 'src/lib/prisma';

type CreateNotificationInput = {
  userId?: string | null;
  title: string;
  message?: string | null;
  category?: string;
  type?: string;
  severity?: 'info' | 'success' | 'warning' | 'error';
  entity?: string | null;
  entityId?: string | null;
  href?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function createNotification(input: CreateNotificationInput) {
  if (!process.env.DATABASE_URL) return null;

  return prisma.notification.create({
    data: {
      userId: input.userId || null,
      title: input.title,
      message: input.message || null,
      category: input.category || 'System',
      type: input.type || 'system',
      severity: input.severity || 'info',
      entity: input.entity || null,
      entityId: input.entityId || null,
      href: input.href || null,
      metadata: input.metadata ? JSON.parse(JSON.stringify(input.metadata)) : undefined,
    },
  });
}
