import {
  NotificationList,
  type NotificationItem,
} from "@/components/notification-list";
import { PageHeader } from "@/components/ui/kit";
import { requireSession } from "@/lib/auth";
import { getNotifications } from "@/lib/notifications";
import { formatRelative } from "@/lib/types";

export const metadata = { title: "Notifications — ImmoOps" };

export default async function NotificationsPage() {
  await requireSession();
  const notifications = await getNotifications();

  const items: NotificationItem[] = notifications.map((n) => ({
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
      <NotificationList items={items} />
    </>
  );
}
