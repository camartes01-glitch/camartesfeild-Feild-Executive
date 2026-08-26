import TaskDetailPage from "./task-detail";
import { TASK_IDS } from "@/lib/seed";

export function generateStaticParams() {
  return TASK_IDS.map((id) => ({ id }));
}

export default function Page() {
  return <TaskDetailPage />;
}
