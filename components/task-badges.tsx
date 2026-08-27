import { Badge } from "@/components/ui";
import type { TaskKind, TaskStatus } from "@/lib/types";

export const KIND_LABEL: Record<TaskKind, string> = {
  address_verification: "Address verify",
  delivery: "Store → customer",
  return: "Customer → store",
  inventory: "Store inventory",
};

export function KindBadge({ kind }: { kind: TaskKind }) {
  const tone =
    kind === "delivery" ? "peach" : kind === "return" ? "blue" : kind === "inventory" ? "violet" : "green";
  return <Badge label={KIND_LABEL[kind]} tone={tone} />;
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  const labels: Record<TaskStatus, string> = {
    assigned: "Assigned",
    in_progress: "In progress",
    awaiting_photo: "Needs photo",
    completed: "Done",
    blocked: "Blocked",
  };
  return <Badge label={labels[status]} tone={status === "completed" ? "green" : "default"} />;
}
