import { Linking } from "react-native";
import { showDialog } from "@/components/dialog";
import { useT } from "@/components/status";
import { Button } from "@/components/ui";
import { useApp } from "@/lib/app-context";
import { navigationUrl, type NavTarget } from "@/lib/geo";

/**
 * Opens the phone's maps app with directions to the stop. Opening navigation never changes the task state:
 * "Arrived" is a separate, deliberate step.
 */
export function NavigateButton({ dest, flex, compact }: { dest: NavTarget | null | undefined; flex?: number; compact?: boolean }) {
  const { live } = useApp();
  const tr = useT();
  const url = navigationUrl(live, dest);
  return (
    <Button
      flex={flex}
      compact={compact}
      label={tr("navigate")}
      variant="outline"
      onPress={() => {
        if (!url) return showDialog(tr("navigate"), tr("navNoLocation"));
        Linking.openURL(url).catch(() => showDialog(tr("navigate"), tr("navUnavailable")));
      }}
    />
  );
}
