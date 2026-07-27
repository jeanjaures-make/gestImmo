import {
  NotificationList,
  type NotificationItem,
} from "@/components/notification-list";
import { Pagination } from "@/components/pagination";
import { PageHeader } from "@/components/ui/kit";
import { requireSession } from "@/lib/auth";
import { getNotifications } from "@/lib/notifications";
import { readPage } from "@/lib/pagination";
import { formatRelative } from "@/lib/types";

export const metadata = { title: "Notifications — ImmoOps" };

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireSession();
  const { page: pageParam } = await searchParams;
  const page = readPage(pageParam);
  const { items, total } = await getNotifications(page.from, page.to);

  const notifications: NotificationItem[] = items.map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    href: n.href,
    read: n.read_at !== null,
    when: formatRelative(n.created_at),
  }));

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Ce que vos locataires et votre parc réclament de votre attention."
      />
      <NotificationList items={notifications} />
      <Pagination
        page={page.number}
        size={page.size}
        total={total}
        unit="notifications"
      />
    </>
  );
}
