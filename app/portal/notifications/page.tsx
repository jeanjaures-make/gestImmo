import {
  NotificationList,
  type NotificationItem,
} from "@/components/notification-list";
import { requireTenantSession } from "@/lib/auth";
import { getNotifications } from "@/lib/notifications";
import { formatRelative } from "@/lib/types";

export const metadata = { title: "Notifications — ImmoOps" };

export default async function PortalNotificationsPage() {
  await requireTenantSession();
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
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-xl font-semibold">Notifications</h1>
      <NotificationList items={items} />
    </div>
  );
}
