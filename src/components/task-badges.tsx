import { Badge } from "@/components/ui/badge";
import type { TaskKind, TaskStatus } from "@/lib/types";

export const KIND_LABEL: Record<TaskKind, string> = {
  address_verification: "Address verify",
  delivery: "Store → customer",
  return: "Customer → store",
  inventory: "Store inventory",
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  assigned: "Assigned",
  in_progress: "In progress",
  awaiting_photo: "Needs photo",
  completed: "Done",
  blocked: "Blocked",
};

export function KindBadge({ kind }: { kind: TaskKind }) {
  const tone =
    kind === "delivery"
      ? "bg-[#FFEDD5] text-[#EA580C]"
      : kind === "return"
        ? "bg-[#DBEAFE] text-[#1D4ED8]"
        : kind === "inventory"
          ? "bg-[#EDE9FE] text-[#7C3AED]"
          : "bg-[#D1FAE5] text-[#059669]";
  return (
    <Badge variant="secondary" className={tone}>
      {KIND_LABEL[kind]}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <Badge variant={status === "completed" ? "secondary" : "default"}>{STATUS_LABEL[status]}</Badge>;
}
