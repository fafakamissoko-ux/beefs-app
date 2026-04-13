/**
 * Non lu = même règle que `count_unread_notifications` en SQL :
 * `is_read IS DISTINCT FROM true` → en JS : seul `true` compte comme lu.
 */
export function isNotificationUnread(row: { is_read?: boolean | null }): boolean {
  return row.is_read !== true;
}
