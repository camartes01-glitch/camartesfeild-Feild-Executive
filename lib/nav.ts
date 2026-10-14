import { router } from "expo-router";

/**
 * Open a job from outside the Jobs stack (Home, Roster, Alerts) with one `navigate`, which reuses the existing
 * tab navigator and Jobs stack. When the Jobs tab has not been opened yet, the job can be the only screen in that
 * stack; its header then offers "Jobs" (see app/(app)/tasks/_layout.tsx), so Back always reaches the list.
 */
export function openTask(taskId: string) {
  router.navigate(`/(app)/tasks/${encodeURIComponent(taskId)}`);
}

/**
 * From a screen pushed on the root stack above the tabs (Alerts, Expenses): close it first so the job opens in
 * the existing tab navigator. Navigating from there directly pushed a second copy of the whole tab navigator.
 */
export function openTaskFromRootScreen(taskId: string) {
  if (router.canGoBack()) router.back();
  openTask(taskId);
}

/** Back to the job list: pops to the list if it is in the Jobs stack, otherwise replaces the job with it. */
export function backToJobs() {
  router.dismissTo("/(app)/tasks");
}
