import type { AppState, FieldUser, GeoPoint, TeamMate } from "@/lib/types";

const DIRECTORY_GEO: Record<string, { area: string; geo: GeoPoint }> = {
  "fe-rahul": { area: "Banjara Hills", geo: { lat: 17.4126, lng: 78.4483 } },
  "fe-priya": { area: "HITEC City", geo: { lat: 17.4483, lng: 78.3816 } },
  "fe-arjun": { area: "Madhapur", geo: { lat: 17.4486, lng: 78.3908 } },
};

export function fieldExecutives(users: FieldUser[]): FieldUser[] {
  return users.filter((user) => user.role === "field_executive");
}

export function buildTeamPresence(
  state: AppState,
  users: FieldUser[],
  liveUserId?: string | null,
  liveGeo?: GeoPoint | null,
): TeamMate[] {
  return fieldExecutives(users).map((person) => {
    const directory = DIRECTORY_GEO[person.id] ?? { area: person.hub, geo: { lat: 17.385, lng: 78.4867 } };
    const openShift = state.shifts.some((shift) => shift.userId === person.id && !shift.clockOut);
    const onTask = state.tasks.some(
      (task) => task.assigneeId === person.id && (task.status === "in_progress" || task.status === "awaiting_photo"),
    );
    const lastPing = [...state.pings].reverse().find((ping) => ping.userId === person.id);
    const isLive = liveUserId === person.id && !!liveGeo;
    return {
      id: person.id,
      name: person.name,
      employeeId: person.employeeId,
      status: onTask ? "on_task" : openShift ? "on_shift" : "off_shift",
      area: isLive ? directory.area : lastPing ? directory.area : directory.area,
      geo: isLive ? liveGeo! : lastPing ? { lat: lastPing.lat, lng: lastPing.lng } : directory.geo,
      presence: isLive ? "live_gps" : lastPing ? "last_seen" : "directory",
      lastSeenAt: isLive ? new Date().toISOString() : lastPing?.at,
    };
  });
}

export function presenceLabel(member: TeamMate) {
  if (member.presence === "live_gps") return "Live GPS (this device)";
  if (member.presence === "last_seen" && member.lastSeenAt) {
    return `Last seen ${new Date(member.lastSeenAt).toLocaleString()}`;
  }
  return "Directory location — not live tracking";
}
