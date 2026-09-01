import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { differenceInMinutes, format, parseISO } from "date-fns";
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Clock3,
  Download,
  LayoutDashboard,
  MapPin,
  Navigation,
  Plus,
  Search,
  Settings,
  Store,
  TrendingUp,
  Users,
  UserRoundCheck,
  X,
} from "lucide-react-native";
import { colors } from "@/constants/theme";
import { MiniMap } from "@/components/mini-map";
import { KIND_LABEL } from "@/components/task-badges";
import { useApp } from "@/lib/app-context";
import { USERS } from "@/lib/seed";
import { slaState } from "@/lib/field-ops";
import { presenceLabel } from "@/lib/team-presence";
import type { AppState, CreateTaskInput, FieldTask, TaskKind, TaskPriority, TaskStatus, TeamMate, Vendor } from "@/lib/types";

type Section = "overview" | "team" | "tasks" | "vendors" | "approvals";
type TaskFilter = "all" | "unassigned" | "assigned" | "in_progress" | "awaiting_photo" | "blocked" | "completed";

const NAV_ITEMS: { id: Section; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "team", label: "Field team" },
  { id: "tasks", label: "Task board" },
  { id: "vendors", label: "Partners" },
  { id: "approvals", label: "Approvals" },
];

const STATUS_LABEL: Record<TaskStatus, string> = {
  assigned: "Assigned",
  in_progress: "In progress",
  awaiting_photo: "Needs proof",
  completed: "Completed",
  blocked: "Blocked",
};

function escapeCsv(value: string | number | undefined) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function exportTasks(tasks: FieldTask[]) {
  const header = [
    "Task",
    "Booking",
    "Type",
    "Customer",
    "Area",
    "Status",
    "Assignee",
    "Scheduled",
    "SLA minutes",
  ];
  const rows = tasks.map((task) => [
    task.id,
    task.bookingRef,
    KIND_LABEL[task.kind],
    task.customerName,
    task.customerPlace.area,
    STATUS_LABEL[task.status],
    USERS.find((member) => member.id === task.assigneeId)?.name ?? "Unassigned",
    task.scheduledFor,
    task.slaMinutes,
  ]);
  const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
  if (Platform.OS !== "web" || typeof document === "undefined") {
    Alert.alert("Export ready", "CSV download is available from the web operations console.");
    return;
  }
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `camartes-field-operations-${format(new Date(), "yyyy-MM-dd")}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function operationalMetrics(tasks: FieldTask[]) {
  const done = tasks.filter((task) => task.status === "completed");
  const withTiming = done.filter((task) => task.completedAt);
  const onTime = withTiming.filter(
    (task) => parseISO(task.completedAt!).getTime() <= parseISO(task.scheduledFor).getTime(),
  ).length;
  const firstAttempt = done.filter((task) => !(task.attempts?.length)).length;
  const proofComplete = done.filter(
    (task) =>
      task.photos.length > 0 ||
      task.customerConfirmed ||
      task.addressMatch === "match" ||
      task.inventoryCounted != null,
  ).length;
  const durations = done
    .filter((task) => task.startedAt && task.completedAt)
    .map((task) => differenceInMinutes(parseISO(task.completedAt!), parseISO(task.startedAt!)))
    .filter((minutes) => minutes >= 0);
  const percent = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);
  return {
    onTime: percent(onTime, withTiming.length),
    firstAttempt: percent(firstAttempt, done.length),
    proof: percent(proofComplete, done.length),
    averageMinutes: durations.length
      ? Math.round(durations.reduce((sum, minutes) => sum + minutes, 0) / durations.length)
      : 0,
  };
}

function percentWidth(value: number): `${number}%` {
  return `${Math.max(0, Math.min(100, value))}%`;
}

function employeeName(userId?: string) {
  return USERS.find((person) => person.id === userId)?.name ?? "Unknown employee";
}

export default function AdminScreen() {
  const { width } = useWindowDimensions();
  const compact = width < 920;
  const phone = width < 620;
  const {
    ready,
    user,
    state,
    online,
    assignTask,
    setTaskStatus,
    reviewLeave,
    reviewExpense,
    cityManager,
    createTask,
    team,
    fieldOpsAvailable,
    fieldOpsReason,
    logout,
  } = useApp();
  const [section, setSection] = useState<Section>("overview");
  const [query, setQuery] = useState("");
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!user) router.replace("/");
    else if (user.role !== "operations_manager") router.replace("/(app)");
  }, [ready, user]);

  const openTasks = state.tasks.filter((task) => task.status !== "completed");
  const completedTasks = state.tasks.filter((task) => task.status === "completed");
  const urgentTasks = openTasks.filter(
    (task) => task.status === "blocked" || task.status === "awaiting_photo" || slaState(task).tone !== "ok",
  );
  const onboarding = state.vendors.filter((vendor) => vendor.onboarding);
  const pendingApprovals =
    state.leaves.filter((leave) => leave.status === "pending").length +
    state.expenses.filter((expense) => expense.status === "submitted").length;
  const alertCount =
    urgentTasks.length +
    state.notices.filter((notice) => !notice.read).length +
    state.offlineQueue.filter((item) => item.status !== "success").length +
    state.damages.length;
  const selectedTask = state.tasks.find((task) => task.id === selectedTaskId) ?? null;
  const filteredTasks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return state.tasks
      .filter((task) => {
        const statusMatch =
          taskFilter === "all"
            ? true
            : taskFilter === "unassigned"
              ? !task.assigneeId
              : taskFilter === "assigned"
                ? !!task.assigneeId && task.status === "assigned"
                : task.status === taskFilter;
        const queryMatch =
          !needle ||
          [task.id, task.bookingRef, task.customerName, task.customerPlace.area, task.title]
            .join(" ")
            .toLowerCase()
            .includes(needle);
        return statusMatch && queryMatch;
      })
      .sort((a, b) => {
        const priority = (task: FieldTask) =>
          task.status === "blocked" ? 0 : slaState(task).tone === "late" ? 1 : task.status === "in_progress" ? 2 : 3;
        return priority(a) - priority(b) || a.scheduledFor.localeCompare(b.scheduledFor);
      });
  }, [query, state.tasks, taskFilter]);

  if (!ready || !user || user.role !== "operations_manager") return null;

  return (
    <View style={styles.app}>
      {!compact ? (
        <Sidebar
          active={section}
          openTaskCount={openTasks.length}
          approvalCount={pendingApprovals}
          supportPhone={cityManager.manager.phone}
          onChange={setSection}
        />
      ) : null}

      <View style={styles.main}>
        <Topbar
          compact={compact}
          online={online}
          active={section}
          alertCount={alertCount}
          onChange={setSection}
          onOpenAlerts={() => setAlertsOpen(true)}
          onClose={() => {
            logout();
            router.replace("/");
          }}
        />

        <ScrollView
          contentContainerStyle={[styles.content, phone && styles.contentPhone]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.syncBanner}>
            <Text style={styles.syncBannerText}>
              {fieldOpsAvailable
                ? "Camartes field-ops API is connected."
                : `Hub cache on this device${fieldOpsReason ? ` · ${fieldOpsReason}` : ""}. Multi-device sync needs the field-ops endpoints listed in lib/field-ops-api.ts.`}
            </Text>
          </View>
          {section === "overview" ? (
            <Overview
              compact={compact}
              phone={phone}
              tasks={state.tasks}
              openTasks={openTasks}
              completedCount={completedTasks.length}
              urgentCount={urgentTasks.length}
              vendorCount={onboarding.length}
              followUpCount={onboarding.filter((vendor) => vendor.status === "follow_up").length}
              lastUpdatedAt={state.audit[0]?.at}
              onExport={() => exportTasks(state.tasks)}
              onViewTasks={() => setSection("tasks")}
              onViewTeam={() => setSection("team")}
              onTaskPress={setSelectedTaskId}
              team={team}
            />
          ) : section === "tasks" ? (
            <TasksPanel
              phone={phone}
              query={query}
              onQuery={setQuery}
              filter={taskFilter}
              onFilter={setTaskFilter}
              tasks={filteredTasks}
              onTaskPress={setSelectedTaskId}
              onCreate={() => setCreating(true)}
              team={team}
            />
          ) : section === "team" ? (
            <TeamPanel phone={phone} tasks={state.tasks} team={team} shifts={state.shifts} />
          ) : section === "vendors" ? (
            <VendorsPanel phone={phone} vendors={onboarding} />
          ) : (
            <ApprovalsPanel
              phone={phone}
              state={state}
              onReviewLeave={reviewLeave}
              onReviewExpense={reviewExpense}
            />
          )}
        </ScrollView>
      </View>
      <CreateTaskModal
        visible={creating}
        phone={phone}
        vendors={state.vendors}
        onClose={() => setCreating(false)}
        onCreate={(input) => {
          const error = createTask(input);
          if (!error) setCreating(false);
          return error;
        }}
      />
      <TaskActionModal
        task={selectedTask}
        phone={phone}
        team={team}
        onClose={() => setSelectedTaskId(null)}
        onAssign={(assigneeId) => {
          if (selectedTask) assignTask(selectedTask.id, assigneeId);
        }}
        onStatus={(status) => {
          if (selectedTask) setTaskStatus(selectedTask.id, status, `Dispatch changed status to ${STATUS_LABEL[status]}`);
        }}
      />
      <AlertsModal
        visible={alertsOpen}
        state={state}
        urgentTasks={urgentTasks}
        onClose={() => setAlertsOpen(false)}
        onTaskPress={(id) => {
          setAlertsOpen(false);
          setSelectedTaskId(id);
        }}
      />
    </View>
  );
}

function Sidebar({
  active,
  openTaskCount,
  approvalCount,
  supportPhone,
  onChange,
}: {
  active: Section;
  openTaskCount: number;
  approvalCount: number;
  supportPhone: string;
  onChange: (id: Section) => void;
}) {
  return (
    <View style={styles.sidebar}>
      <View style={styles.brand}>
        <View style={styles.brandMark}>
          <Navigation size={21} color="#FFFFFF" fill="#FFFFFF" />
        </View>
        <View>
          <Text style={styles.brandName}>Camartes</Text>
          <Text style={styles.brandSub}>FIELD OPERATIONS</Text>
        </View>
      </View>

      <Text style={styles.navLabel}>WORKSPACE</Text>
      <View style={styles.navList}>
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.id}
            id={item.id}
            label={item.label}
            active={active === item.id}
            count={item.id === "tasks" ? openTaskCount : item.id === "approvals" ? approvalCount : undefined}
            onPress={() => onChange(item.id)}
          />
        ))}
      </View>

      <View style={styles.sidebarBottom}>
        <View style={styles.supportCard}>
          <View style={styles.supportIcon}>
            <CircleAlert size={18} color={colors.primaryDark} />
          </View>
          <Text style={styles.supportTitle}>Need help?</Text>
          <Text style={styles.supportCopy}>Operations support is online</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Call operations support"
            onPress={() => void Linking.openURL(`tel:${supportPhone.replace(/\s/g, "")}`)}
            style={styles.supportButton}
          >
            <Text style={styles.supportButtonText}>Contact support</Text>
          </Pressable>
        </View>
        <View style={styles.managerRow}>
          <View style={styles.managerAvatar}>
            <Text style={styles.managerInitials}>AK</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.managerName}>Ananya Kapoor</Text>
            <Text style={styles.managerRole}>City manager</Text>
          </View>
          <Settings size={18} color="#94A3B8" />
        </View>
      </View>
    </View>
  );
}

function NavItem({
  id,
  label,
  active,
  count,
  onPress,
}: {
  id: Section;
  label: string;
  active: boolean;
  count?: number;
  onPress: () => void;
}) {
  const iconColor = active ? colors.primaryDark : "#64748B";
  const Icon =
    id === "overview"
      ? LayoutDashboard
      : id === "team"
        ? Users
        : id === "tasks"
          ? ClipboardList
          : id === "approvals"
            ? UserRoundCheck
            : Store;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.navItem, active && styles.navItemActive]}
    >
      <Icon size={19} color={iconColor} strokeWidth={active ? 2.4 : 2} />
      <Text style={[styles.navText, active && styles.navTextActive]}>{label}</Text>
      {count ? (
        <View style={styles.navCount}>
          <Text style={styles.navCountText}>{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function Topbar({
  compact,
  online,
  active,
  alertCount,
  onChange,
  onOpenAlerts,
  onClose,
}: {
  compact: boolean;
  online: boolean;
  active: Section;
  alertCount: number;
  onChange: (id: Section) => void;
  onOpenAlerts: () => void;
  onClose: () => void;
}) {
  return (
    <View>
      <View style={styles.topbar}>
        {compact ? (
          <View style={styles.compactBrand}>
            <View style={styles.brandMarkSmall}>
              <Navigation size={16} color="#FFFFFF" fill="#FFFFFF" />
            </View>
            <Text style={styles.compactBrandText}>Camartes Ops</Text>
          </View>
        ) : (
          <View style={styles.locationPill}>
            <MapPin size={15} color={colors.primaryDark} />
            <Text style={styles.locationText}>Hyderabad · All hubs</Text>
          </View>
        )}
        <View style={styles.topActions}>
          <View style={styles.syncState}>
            <View style={[styles.syncDot, !online && { backgroundColor: "#EF4444" }]} />
            <Text style={styles.syncText}>{online ? "Live" : "Offline"}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open operations alerts, ${alertCount} items`}
            onPress={onOpenAlerts}
            style={styles.iconButton}
          >
            <Bell size={19} color="#475569" />
            {alertCount > 0 ? (
              <View style={styles.alertCount}>
                <Text style={styles.alertCountText}>{alertCount > 9 ? "9+" : alertCount}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Close admin console" onPress={onClose} style={styles.iconButton}>
            <X size={19} color="#475569" />
          </Pressable>
        </View>
      </View>
      {compact ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.mobileNav}
        >
          {NAV_ITEMS.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => onChange(item.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active === item.id }}
              style={[styles.mobileNavItem, active === item.id && styles.mobileNavItemActive]}
            >
              <Text style={[styles.mobileNavText, active === item.id && styles.mobileNavTextActive]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

function Overview({
  compact,
  phone,
  tasks,
  openTasks,
  completedCount,
  urgentCount,
  vendorCount,
  followUpCount,
  lastUpdatedAt,
  onExport,
  onViewTasks,
  onViewTeam,
  onTaskPress,
  team,
}: {
  compact: boolean;
  phone: boolean;
  tasks: FieldTask[];
  openTasks: FieldTask[];
  completedCount: number;
  urgentCount: number;
  vendorCount: number;
  followUpCount: number;
  lastUpdatedAt?: string;
  onExport: () => void;
  onViewTasks: () => void;
  onViewTeam: () => void;
  onTaskPress: (id: string) => void;
  team: TeamMate[];
}) {
  const performance = operationalMetrics(tasks);
  const priorityTasks = [...openTasks].sort((a, b) => {
    const priority = (task: FieldTask) =>
      task.status === "blocked" ? 0 : slaState(task).tone === "late" ? 1 : task.status === "in_progress" ? 2 : 3;
    return priority(a) - priority(b) || a.scheduledFor.localeCompare(b.scheduledFor);
  });
  const lastUpdated = lastUpdatedAt ? format(parseISO(lastUpdatedAt), "d MMM · h:mm a") : "No activity yet";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <View style={[styles.pageHeading, phone && { alignItems: "flex-start" }]}>
        <View>
          <Text style={styles.eyebrow}>FIELD OPERATIONS</Text>
          <Text style={styles.pageTitle}>{greeting}, operations</Text>
          <Text style={styles.pageSubtitle}>Dispatch, SLA, and workforce status across Hyderabad.</Text>
        </View>
        <View style={[styles.headingActions, phone && { width: "100%" }]}>
          <View style={[styles.dateButton, phone && { flex: 1 }]}>
            <CalendarDays size={16} color="#475569" />
            <Text style={styles.dateButtonText}>{format(new Date(), "d MMM yyyy")}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Export field operations tasks as CSV"
            onPress={onExport}
            style={styles.exportButton}
          >
            <Download size={16} color="#FFFFFF" />
            <Text style={styles.exportButtonText}>Export</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.metrics, phone && styles.stack]}>
        <MetricCard
          icon={<Users size={20} color="#2563EB" />}
          iconBg="#EFF6FF"
          label="Team on field"
          value={`${team.filter((member) => member.status !== "off_shift").length}/${team.length}`}
          detail="On shift or on task right now"
          tone="green"
        />
        <MetricCard
          icon={<ClipboardList size={20} color="#7C3AED" />}
          iconBg="#F5F3FF"
          label="Active tasks"
          value={String(openTasks.length)}
          detail={`${urgentCount} need attention`}
          tone="amber"
        />
        <MetricCard
          icon={<CheckCircle2 size={20} color="#059669" />}
          iconBg="#ECFDF5"
          label="Completed"
          value={String(completedCount)}
          detail={`${performance.onTime}% completed on time`}
          tone="green"
        />
        <MetricCard
          icon={<Store size={20} color={colors.primaryDark} />}
          iconBg="#FFF7ED"
          label="Partner pipeline"
          value={String(vendorCount)}
          detail={`${followUpCount} follow-ups active`}
          tone="neutral"
        />
      </View>

      <View style={[styles.overviewGrid, compact && styles.stack]}>
        <Panel style={{ flex: 1.62 }}>
          <View style={styles.panelHeader}>
            <View>
              <Text style={styles.panelTitle}>Live field view</Text>
              <Text style={styles.panelSubtitle}>Last event {lastUpdated}</Text>
            </View>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>STATUS</Text>
            </View>
          </View>
          <View style={styles.mapFrame}>
            <MiniMap
              height={compact ? 250 : 315}
              markers={[
                ...team
                  .filter((member) => member.presence !== "directory")
                  .map((member) => ({
                    id: member.id,
                    label: member.name.split(" ")[0],
                    color: member.status === "on_task" ? colors.primary : "#2563EB",
                    point: member.geo,
                  })),
                ...openTasks
                  .filter((task) => slaState(task).tone === "late" || task.status === "blocked")
                  .map((task) => ({
                    id: `alert-${task.id}`,
                    label: task.id.replace("TSK-", ""),
                    color: "#DC2626",
                    point: task.customerPlace.geo,
                  })),
              ]}
            />
            <View style={styles.mapLegend}>
              <View style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
                <Text style={styles.legendText}>On task</Text>
              </View>
              <View style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: "#2563EB" }]} />
                <Text style={styles.legendText}>Available</Text>
              </View>
              <View style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: "#DC2626" }]} />
                <Text style={styles.legendText}>SLA breach</Text>
              </View>
            </View>
          </View>
        </Panel>

        <Panel style={{ flex: 1 }}>
          <View style={styles.panelHeader}>
            <View>
              <Text style={styles.panelTitle}>Field team</Text>
              <Text style={styles.panelSubtitle}>{team.filter((member) => member.status !== "off_shift").length} members active</Text>
            </View>
            <Pressable onPress={onViewTeam}>
              <Text style={styles.linkText}>View all</Text>
            </Pressable>
          </View>
          <View>
            {team.map((member, index) => (
              <View key={member.id} style={[styles.teamRow, index > 0 && styles.rowBorder]}>
                <View style={[styles.avatar, { backgroundColor: avatarColor(index) }]}>
                  <Text style={styles.avatarText}>
                    {member.name
                      .split(" ")
                      .map((part) => part[0])
                      .join("")}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{member.name}</Text>
                  <View style={styles.inlineMeta}>
                    <MapPin size={12} color="#94A3B8" />
                    <Text style={styles.rowMeta}>{presenceLabel(member)}</Text>
                  </View>
                </View>
                <StatusPill
                  label={member.status === "on_task" ? "On task" : member.status === "on_shift" ? "On shift" : "Off shift"}
                  tone={member.status === "on_task" ? "orange" : member.status === "on_shift" ? "green" : "red"}
                />
              </View>
            ))}
          </View>
          <Pressable onPress={onViewTeam} style={styles.fullButton}>
            <Text style={styles.fullButtonText}>Manage field team</Text>
            <ChevronRight size={16} color={colors.primaryDark} />
          </Pressable>
        </Panel>
      </View>

      <View style={[styles.bottomGrid, compact && styles.stack]}>
        <Panel style={{ flex: 1.62 }}>
          <View style={styles.panelHeader}>
            <View>
              <Text style={styles.panelTitle}>Active jobs</Text>
              <Text style={styles.panelSubtitle}>Priority queue across both hubs</Text>
            </View>
            <Pressable onPress={onViewTasks}>
              <Text style={styles.linkText}>View task board</Text>
            </Pressable>
          </View>
          {priorityTasks.slice(0, 4).map((task, index) => (
            <TaskRow key={task.id} task={task} bordered={index > 0} phone={phone} onPress={() => onTaskPress(task.id)} team={team} />
          ))}
        </Panel>

        <Panel style={{ flex: 1 }}>
          <View style={styles.panelHeader}>
            <View>
              <Text style={styles.panelTitle}>Operational performance</Text>
              <Text style={styles.panelSubtitle}>Derived from completed work</Text>
            </View>
            <TrendingUp size={20} color="#059669" />
          </View>
          <Performance label="On-time completion" value={`${performance.onTime}%`} width={percentWidth(performance.onTime)} color="#10B981" />
          <Performance label="First-attempt success" value={`${performance.firstAttempt}%`} width={percentWidth(performance.firstAttempt)} color="#2563EB" />
          <Performance label="Proof compliance" value={`${performance.proof}%`} width={percentWidth(performance.proof)} color={colors.primary} />
          <View style={styles.performanceFoot}>
            <Clock3 size={16} color="#64748B" />
            <Text style={styles.performanceFootText}>Avg. task time</Text>
            <Text style={styles.performanceFootValue}>
              {performance.averageMinutes ? `${performance.averageMinutes} min` : "—"}
            </Text>
          </View>
        </Panel>
      </View>
    </>
  );
}

function TasksPanel({
  phone,
  query,
  onQuery,
  filter,
  onFilter,
  tasks,
  onTaskPress,
  onCreate,
  team,
}: {
  phone: boolean;
  query: string;
  onQuery: (value: string) => void;
  filter: TaskFilter;
  onFilter: (filter: TaskFilter) => void;
  tasks: FieldTask[];
  onTaskPress: (id: string) => void;
  onCreate: () => void;
  team: TeamMate[];
}) {
  const filters: { id: TaskFilter; label: string }[] = [
    { id: "all", label: "All tasks" },
    { id: "unassigned", label: "Unassigned" },
    { id: "assigned", label: "Assigned" },
    { id: "in_progress", label: "In progress" },
    { id: "awaiting_photo", label: "Needs proof" },
    { id: "blocked", label: "Blocked" },
    { id: "completed", label: "Completed" },
  ];
  return (
    <>
      <SectionHeading
        eyebrow="DISPATCH"
        title="Task board"
        subtitle="Create, assign, and monitor field work across the city."
      />
      <Panel>
        <View style={[styles.taskTools, phone && styles.stack]}>
          <View style={[styles.searchBox, phone && { width: "100%" }]}>
            <Search size={17} color="#94A3B8" />
            <TextInput
              value={query}
              onChangeText={onQuery}
              placeholder="Search task, booking, customer or area"
              placeholderTextColor="#94A3B8"
              style={styles.searchInput}
            />
          </View>
          <Pressable onPress={onCreate} style={styles.exportButton}>
            <Plus size={16} color="#FFFFFF" />
            <Text style={styles.exportButtonText}>New task</Text>
          </Pressable>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.filterRow}>
              {filters.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => onFilter(item.id)}
                  style={[styles.filterButton, filter === item.id && styles.filterButtonActive]}
                >
                  <Text style={[styles.filterText, filter === item.id && styles.filterTextActive]}>
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeading, { flex: 1.3 }]}>TASK</Text>
          {!phone ? <Text style={[styles.tableHeading, { flex: 1 }]}>CUSTOMER</Text> : null}
          {!phone ? <Text style={[styles.tableHeading, { flex: 0.8 }]}>ASSIGNEE</Text> : null}
          <Text style={[styles.tableHeading, { width: 104 }]}>STATUS</Text>
        </View>
        {tasks.map((task, index) => (
          <TaskRow
            key={task.id}
            task={task}
            bordered={index > 0}
            phone={phone}
            onPress={() => onTaskPress(task.id)}
            team={team}
          />
        ))}
        {tasks.length === 0 ? (
          <View style={styles.empty}>
            <Search size={22} color="#CBD5E1" />
            <Text style={styles.emptyTitle}>No matching tasks</Text>
            <Text style={styles.panelSubtitle}>Try a different search or status filter.</Text>
          </View>
        ) : null}
      </Panel>
    </>
  );
}

function TeamPanel({
  phone,
  tasks,
  team,
  shifts,
}: {
  phone: boolean;
  tasks: FieldTask[];
  team: TeamMate[];
  shifts: AppState["shifts"];
}) {
  return (
    <>
      <SectionHeading
        eyebrow="PEOPLE"
        title="Field team"
        subtitle="Shift status, last seen, and workload. Directory pins are not live GPS."
      />
      <View style={[styles.directoryGrid, phone && styles.stack]}>
        {team.map((member, index) => {
          const assigned = tasks.filter(
            (task) => task.assigneeId === member.id && task.status !== "completed",
          ).length;
          const completed = tasks.filter(
            (task) => task.assigneeId === member.id && task.status === "completed",
          ).length;
          const openShift = shifts.find((shift) => shift.userId === member.id && !shift.clockOut);
          return (
            <Panel key={member.id} style={{ flex: 1 }}>
              <View style={styles.personHead}>
                <View style={[styles.avatarLarge, { backgroundColor: avatarColor(index) }]}>
                  <Text style={styles.avatarLargeText}>
                    {member.name
                      .split(" ")
                      .map((part) => part[0])
                      .join("")}
                  </Text>
                </View>
                <StatusPill
                  label={member.status === "on_task" ? "On task" : member.status === "on_shift" ? "On shift" : "Off shift"}
                  tone={member.status === "on_task" ? "orange" : member.status === "on_shift" ? "green" : "red"}
                />
              </View>
              <Text style={styles.personName}>{member.name}</Text>
              <Text style={styles.personId}>{member.employeeId}</Text>
              <View style={styles.personLocation}>
                <MapPin size={15} color={colors.primaryDark} />
                <Text style={styles.personLocationText}>{presenceLabel(member)}</Text>
              </View>
              <Text style={styles.rowMeta}>
                {openShift
                  ? `Clocked in ${format(parseISO(openShift.clockIn), "h:mm a")}`
                  : "No open shift on this device cache"}
              </Text>
              <View style={styles.personStats}>
                <View>
                  <Text style={styles.personStatValue}>{assigned}</Text>
                  <Text style={styles.personStatLabel}>Open tasks</Text>
                </View>
                <View>
                  <Text style={styles.personStatValue}>{completed}</Text>
                  <Text style={styles.personStatLabel}>Completed</Text>
                </View>
              </View>
            </Panel>
          );
        })}
      </View>
    </>
  );
}

function VendorsPanel({ phone, vendors }: { phone: boolean; vendors: Vendor[] }) {
  return (
    <>
      <SectionHeading
        eyebrow="GROWTH"
        title="Partner pipeline"
        subtitle="Track studios and production partners from first visit to onboarding."
      />
      <View style={[styles.vendorSummary, phone && styles.stack]}>
        <SummaryTile label="Prospects" value={String(vendors.filter((v) => v.status === "prospect").length)} />
        <SummaryTile label="Follow-ups" value={String(vendors.filter((v) => v.status === "follow_up").length)} />
        <SummaryTile label="Onboarded" value={String(vendors.filter((v) => v.status === "onboarded").length)} />
      </View>
      <Panel>
        {vendors.slice(0, 12).map((vendor, index) => (
          <View key={vendor.id} style={[styles.vendorRow, index > 0 && styles.rowBorder]}>
            <View style={styles.vendorIcon}>
              <Store size={18} color={colors.primaryDark} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{vendor.name}</Text>
              <Text style={styles.rowMeta}>
                {vendor.area} · {vendor.contact || "Contact pending"}
              </Text>
            </View>
            {!phone ? <Text style={styles.vendorType}>{vendor.kind.replaceAll("_", " ")}</Text> : null}
            <StatusPill
              label={vendor.interest?.replaceAll("_", " ") ?? vendor.status.replaceAll("_", " ")}
              tone={vendor.status === "onboarded" ? "green" : "orange"}
            />
          </View>
        ))}
      </Panel>
    </>
  );
}

function ApprovalsPanel({
  phone,
  state,
  onReviewLeave,
  onReviewExpense,
}: {
  phone: boolean;
  state: AppState;
  onReviewLeave: (id: string, status: "approved" | "rejected") => void;
  onReviewExpense: (id: string, status: "approved" | "rejected") => void;
}) {
  const leaves = state.leaves.filter((leave) => leave.status === "pending");
  const expenses = state.expenses.filter((expense) => expense.status === "submitted");
  return (
    <>
      <SectionHeading
        eyebrow="REVIEWS"
        title="Approval queue"
        subtitle="Review leave and expense requests without leaving dispatch."
      />
      <View style={[styles.approvalGrid, phone && styles.stack]}>
        <Panel style={{ flex: 1 }}>
          <View style={styles.panelHeader}>
            <View>
              <Text style={styles.panelTitle}>Leave requests</Text>
              <Text style={styles.panelSubtitle}>{leaves.length} awaiting review</Text>
            </View>
            <CalendarDays size={19} color="#7C3AED" />
          </View>
          {leaves.map((leave, index) => (
            <View key={leave.id} style={[styles.approvalRow, index > 0 && styles.rowBorder]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>
                  {employeeName(leave.userId)} · {leave.type[0].toUpperCase() + leave.type.slice(1)} leave · {leave.days} day
                  {leave.days === 1 ? "" : "s"}
                </Text>
                <Text style={styles.rowMeta}>
                  {format(parseISO(leave.from), "d MMM")} · {leave.reason}
                </Text>
              </View>
              <View style={styles.approvalActions}>
                <SmallAction label="Reject" tone="neutral" onPress={() => onReviewLeave(leave.id, "rejected")} />
                <SmallAction label="Approve" tone="green" onPress={() => onReviewLeave(leave.id, "approved")} />
              </View>
            </View>
          ))}
          {leaves.length === 0 ? <EmptyApproval label="No pending leave requests" /> : null}
        </Panel>
        <Panel style={{ flex: 1 }}>
          <View style={styles.panelHeader}>
            <View>
              <Text style={styles.panelTitle}>Expense claims</Text>
              <Text style={styles.panelSubtitle}>{expenses.length} awaiting review</Text>
            </View>
            <ClipboardList size={19} color="#2563EB" />
          </View>
          {expenses.map((expense, index) => (
            <View key={expense.id} style={[styles.approvalRow, index > 0 && styles.rowBorder]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{employeeName(expense.userId)} · ₹{expense.amountInr} · {expense.km} km</Text>
                <Text style={styles.rowMeta}>
                  {format(parseISO(expense.date), "d MMM")} · {expense.note}
                </Text>
              </View>
              <View style={styles.approvalActions}>
                <SmallAction label="Reject" tone="neutral" onPress={() => onReviewExpense(expense.id, "rejected")} />
                <SmallAction label="Approve" tone="green" onPress={() => onReviewExpense(expense.id, "approved")} />
              </View>
            </View>
          ))}
          {expenses.length === 0 ? <EmptyApproval label="No pending expense claims" /> : null}
        </Panel>
      </View>
    </>
  );
}

function SmallAction({
  label,
  tone,
  onPress,
}: {
  label: string;
  tone: "green" | "neutral";
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.smallAction, tone === "green" && styles.smallActionPrimary]}
    >
      <Text style={[styles.smallActionText, tone === "green" && styles.smallActionTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

function EmptyApproval({ label }: { label: string }) {
  return (
    <View style={styles.emptyApproval}>
      <CheckCircle2 size={20} color="#10B981" />
      <Text style={styles.emptyApprovalText}>{label}</Text>
    </View>
  );
}

function TaskActionModal({
  task,
  phone,
  team,
  onClose,
  onAssign,
  onStatus,
}: {
  task: FieldTask | null;
  phone: boolean;
  team: TeamMate[];
  onClose: () => void;
  onAssign: (assigneeId: string) => void;
  onStatus: (status: TaskStatus) => void;
}) {
  if (!task) return null;
  const sla = task.status === "completed" ? null : slaState(task);
  const statuses: TaskStatus[] = ["assigned", "in_progress", "awaiting_photo", "blocked", "completed"];
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, phone && styles.modalCardPhone]}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>DISPATCH CONTROL</Text>
              <Text style={styles.modalTitle}>{task.id} · {task.customerName}</Text>
              <Text style={styles.pageSubtitle}>{task.title}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close task controls" onPress={onClose} style={styles.iconButton}>
              <X size={18} color="#475569" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <View style={styles.taskFacts}>
              <View style={styles.taskFact}>
                <Text style={styles.taskFactLabel}>LOCATION</Text>
                <Text style={styles.taskFactValue}>{task.customerPlace.area}</Text>
              </View>
              <View style={styles.taskFact}>
                <Text style={styles.taskFactLabel}>WINDOW</Text>
                <Text style={styles.taskFactValue}>{task.beatWindow ?? format(parseISO(task.scheduledFor), "h:mm a")}</Text>
              </View>
              <View style={styles.taskFact}>
                <Text style={styles.taskFactLabel}>SLA</Text>
                <Text style={[styles.taskFactValue, sla?.tone === "late" && styles.slaLate]}>
                  {sla?.label ?? "Closed"}
                </Text>
              </View>
            </View>

            <View>
              <Text style={styles.modalSectionLabel}>ASSIGNEE</Text>
              <View style={styles.choiceWrap}>
                {team.map((member, index) => (
                  <Pressable
                    key={member.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: task.assigneeId === member.id }}
                    onPress={() => onAssign(member.id)}
                    style={[styles.choice, task.assigneeId === member.id && styles.choiceActive]}
                  >
                    <View style={[styles.choiceAvatar, { backgroundColor: avatarColor(index) }]}>
                      <Text style={styles.choiceAvatarText}>
                        {member.name.split(" ").map((part) => part[0]).join("")}
                      </Text>
                    </View>
                    <View>
                      <Text style={[styles.choiceText, task.assigneeId === member.id && styles.choiceTextActive]}>
                        {member.name}
                      </Text>
                      <Text style={styles.rowMeta}>{member.area}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>

            <View>
              <Text style={styles.modalSectionLabel}>WORK STATUS</Text>
              <View style={styles.statusChoices}>
                {statuses.map((status) => (
                  <Pressable
                    key={status}
                    accessibilityRole="button"
                    accessibilityState={{ selected: task.status === status }}
                    onPress={() => onStatus(status)}
                    style={[styles.statusChoice, task.status === status && styles.statusChoiceActive]}
                  >
                    <Text style={[styles.statusChoiceText, task.status === status && styles.statusChoiceTextActive]}>
                      {STATUS_LABEL[status]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View>
              <Text style={styles.modalSectionLabel}>RECENT TIMELINE</Text>
              {task.timeline.slice(-4).reverse().map((event) => (
                <View key={event.id} style={styles.timelineRow}>
                  <View style={styles.timelineDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.timelineText}>{event.label}</Text>
                    <Text style={styles.rowMeta}>{format(parseISO(event.at), "d MMM · h:mm a")}</Text>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function AlertsModal({
  visible,
  state,
  urgentTasks,
  onClose,
  onTaskPress,
}: {
  visible: boolean;
  state: AppState;
  urgentTasks: FieldTask[];
  onClose: () => void;
  onTaskPress: (id: string) => void;
}) {
  const notices = state.notices.filter((notice) => !notice.read);
  const unsynced = state.offlineQueue.filter((item) => !item.synced);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.alertPanel}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.eyebrow}>EXCEPTION CENTRE</Text>
              <Text style={styles.modalTitle}>Operations alerts</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close alerts" onPress={onClose} style={styles.iconButton}>
              <X size={18} color="#475569" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.alertBody}>
            <Text style={styles.modalSectionLabel}>SLA & TASKS · {urgentTasks.length}</Text>
            {urgentTasks.map((task) => (
              <Pressable key={task.id} onPress={() => onTaskPress(task.id)} style={styles.alertRow}>
                <View style={styles.alertIconDanger}>
                  <Clock3 size={16} color="#B91C1C" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{task.id} · {task.customerName}</Text>
                  <Text style={styles.alertDangerText}>
                    {task.status === "blocked" ? "Blocked · action required" : slaState(task).label}
                  </Text>
                </View>
                <ChevronRight size={16} color="#94A3B8" />
              </Pressable>
            ))}
            <Text style={styles.modalSectionLabel}>UNREAD NOTICES · {notices.length}</Text>
            {notices.map((notice) => (
              <View key={notice.id} style={styles.alertRow}>
                <View style={styles.alertIconInfo}>
                  <Bell size={16} color="#2563EB" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{notice.title}</Text>
                  <Text style={styles.rowMeta}>{notice.body}</Text>
                </View>
              </View>
            ))}
            {unsynced.length > 0 ? (
              <>
                <Text style={styles.modalSectionLabel}>SYNC FAILURES · {unsynced.length}</Text>
                {unsynced.map((item) => (
                  <View key={item.id} style={styles.alertRow}>
                    <View style={styles.alertIconDanger}>
                      <CircleAlert size={16} color="#B91C1C" />
                    </View>
                    <Text style={[styles.rowTitle, { flex: 1 }]}>{item.label}</Text>
                  </View>
                ))}
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.pageTitle}>{title}</Text>
      <Text style={styles.pageSubtitle}>{subtitle}</Text>
    </View>
  );
}

function Panel({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

function MetricCard({
  icon,
  iconBg,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  detail: string;
  tone: "green" | "amber" | "neutral";
}) {
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor: iconBg }]}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={styles.metricValue}>{value}</Text>
        <Text
          style={[
            styles.metricDetail,
            tone === "green" && { color: "#059669" },
            tone === "amber" && { color: "#D97706" },
          ]}
        >
          {detail}
        </Text>
      </View>
    </View>
  );
}

function TaskRow({
  task,
  bordered,
  phone,
  onPress,
  team,
}: {
  task: FieldTask;
  bordered: boolean;
  phone: boolean;
  onPress: () => void;
  team: TeamMate[];
}) {
  const assignee = team.find((member) => member.id === task.assigneeId) ?? USERS.find((person) => person.id === task.assigneeId);
  const sla = task.status === "completed" ? null : slaState(task);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open dispatch controls for ${task.id}`}
      onPress={onPress}
      style={({ pressed }) => [styles.taskRow, bordered && styles.rowBorder, pressed && styles.taskRowPressed]}
    >
      <View style={{ flex: 1.3 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {task.id} · {KIND_LABEL[task.kind]}
        </Text>
        <Text style={[styles.rowMeta, sla?.tone === "late" && styles.slaLate]} numberOfLines={1}>
          {sla ? sla.label : task.bookingRef}
          {phone ? ` · ${task.customerName} · ${assignee?.name ?? "Unassigned"}` : ""}
        </Text>
      </View>
      {!phone ? (
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {task.customerName}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {task.customerPhone}
          </Text>
        </View>
      ) : null}
      {!phone ? (
        <View style={{ flex: 0.8 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {assignee?.name ?? "Unassigned"}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {task.customerPlace.area}
          </Text>
        </View>
      ) : null}
      <View style={{ width: 104, alignItems: "flex-end" }}>
        <StatusPill
          label={STATUS_LABEL[task.status]}
          tone={task.status === "completed" ? "green" : task.status === "blocked" ? "red" : "orange"}
        />
      </View>
    </Pressable>
  );
}

function CreateTaskModal({
  visible,
  phone,
  vendors,
  onClose,
  onCreate,
}: {
  visible: boolean;
  phone: boolean;
  vendors: Vendor[];
  onClose: () => void;
  onCreate: (input: CreateTaskInput) => string | null;
}) {
  const executives = USERS.filter((person) => person.role === "field_executive");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<TaskKind>("delivery");
  const [customerName, setCustomerName] = useState("");
  const [area, setArea] = useState("Hyderabad");
  const [vendorId, setVendorId] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [dueAt, setDueAt] = useState(() => new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 16));
  const [assigneeId, setAssigneeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!visible) return null;
  const kinds: TaskKind[] = ["delivery", "return", "address_verification", "inventory", "vendor_visit"];
  const priorities: TaskPriority[] = ["low", "normal", "high", "urgent"];
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, phone && styles.modalCardPhone]}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>NEW DISPATCH</Text>
              <Text style={styles.modalTitle}>Create task</Text>
            </View>
            <Pressable onPress={onClose} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Close">
              <X size={18} color="#475569" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <TextInput value={title} onChangeText={setTitle} placeholder="Task title" placeholderTextColor="#94A3B8" style={styles.createInput} />
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Description / notes"
              placeholderTextColor="#94A3B8"
              style={[styles.createInput, { minHeight: 72 }]}
              multiline
            />
            <TextInput value={customerName} onChangeText={setCustomerName} placeholder="Customer name" placeholderTextColor="#94A3B8" style={styles.createInput} />
            <TextInput value={area} onChangeText={setArea} placeholder="Area / location" placeholderTextColor="#94A3B8" style={styles.createInput} />
            <TextInput value={dueAt} onChangeText={setDueAt} placeholder="Due (YYYY-MM-DDTHH:mm)" placeholderTextColor="#94A3B8" style={styles.createInput} />
            <Text style={styles.modalSectionLabel}>TYPE</Text>
            <View style={styles.filterRow}>
              {kinds.map((item) => (
                <Pressable key={item} onPress={() => setKind(item)} style={[styles.filterButton, kind === item && styles.filterButtonActive]}>
                  <Text style={[styles.filterText, kind === item && styles.filterTextActive]}>{item.replaceAll("_", " ")}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.modalSectionLabel}>PRIORITY</Text>
            <View style={styles.filterRow}>
              {priorities.map((item) => (
                <Pressable key={item} onPress={() => setPriority(item)} style={[styles.filterButton, priority === item && styles.filterButtonActive]}>
                  <Text style={[styles.filterText, priority === item && styles.filterTextActive]}>{item}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.modalSectionLabel}>VENDOR (OPTIONAL)</Text>
            <ScrollView horizontal>
              <View style={styles.filterRow}>
                <Pressable onPress={() => setVendorId("")} style={[styles.filterButton, !vendorId && styles.filterButtonActive]}>
                  <Text style={[styles.filterText, !vendorId && styles.filterTextActive]}>None</Text>
                </Pressable>
                {vendors.filter((vendor) => vendor.onboarding).slice(0, 8).map((vendor) => (
                  <Pressable key={vendor.id} onPress={() => setVendorId(vendor.id)} style={[styles.filterButton, vendorId === vendor.id && styles.filterButtonActive]}>
                    <Text style={[styles.filterText, vendorId === vendor.id && styles.filterTextActive]}>{vendor.name}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            <Text style={styles.modalSectionLabel}>ASSIGN TO</Text>
            <View style={styles.choiceWrap}>
              <Pressable onPress={() => setAssigneeId("")} style={[styles.choice, !assigneeId && styles.choiceActive]}>
                <Text style={[styles.choiceText, !assigneeId && styles.choiceTextActive]}>Unassigned</Text>
              </Pressable>
              {executives.map((person) => (
                <Pressable key={person.id} onPress={() => setAssigneeId(person.id)} style={[styles.choice, assigneeId === person.id && styles.choiceActive]}>
                  <Text style={[styles.choiceText, assigneeId === person.id && styles.choiceTextActive]}>{person.name}</Text>
                </Pressable>
              ))}
            </View>
            {error ? <Text style={styles.slaLate}>{error}</Text> : null}
            <Pressable
              onPress={() => {
                const due = dueAt.length === 16 ? `${dueAt}:00+05:30` : dueAt;
                const msg = onCreate({
                  title,
                  description,
                  kind,
                  customerName,
                  area,
                  vendorId: vendorId || undefined,
                  priority,
                  dueAt: due,
                  assigneeId: assigneeId || undefined,
                });
                setError(msg);
              }}
              style={styles.exportButton}
            >
              <Plus size={16} color="#FFFFFF" />
              <Text style={styles.exportButtonText}>Create task</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "green" | "orange" | "red" }) {
  const bg = tone === "green" ? "#ECFDF5" : tone === "red" ? "#FEF2F2" : "#FFF7ED";
  const fg = tone === "green" ? "#047857" : tone === "red" ? "#B91C1C" : "#C2410C";
  const dot = tone === "green" ? "#10B981" : tone === "red" ? "#EF4444" : colors.primary;
  return (
    <View style={[styles.statusPill, { backgroundColor: bg }]}>
      <View style={[styles.statusDot, { backgroundColor: dot }]} />
      <Text style={[styles.statusText, { color: fg }]}>{label}</Text>
    </View>
  );
}

function Performance({
  label,
  value,
  width,
  color,
}: {
  label: string;
  value: string;
  width: `${number}%`;
  color: string;
}) {
  return (
    <View style={styles.performance}>
      <View style={styles.performanceHead}>
        <Text style={styles.performanceLabel}>{label}</Text>
        <Text style={styles.performanceValue}>{value}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryTile}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function avatarColor(index: number) {
  return ["#E0E7FF", "#D1FAE5", "#FFEDD5"][index % 3];
}

const styles = StyleSheet.create({
  syncBanner: {
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FED7AA",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },
  syncBannerText: { color: "#9A3412", fontSize: 12, fontWeight: "600", lineHeight: 18 },
  createInput: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#0F172A",
    fontSize: 14,
    backgroundColor: "#FFFFFF",
  },
  app: { flex: 1, flexDirection: "row", backgroundColor: "#F8FAFC" },
  sidebar: {
    width: 248,
    backgroundColor: "#FFFFFF",
    borderRightWidth: 1,
    borderRightColor: "#E8EDF3",
    paddingHorizontal: 18,
    paddingTop: 24,
    paddingBottom: 20,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 34, paddingHorizontal: 6 },
  brandMark: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    transform: [{ rotate: "-7deg" }],
  },
  brandMarkSmall: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  brandName: { fontSize: 19, fontWeight: "800", color: "#172033", letterSpacing: -0.4 },
  brandSub: { fontSize: 8, fontWeight: "800", color: "#94A3B8", letterSpacing: 1.35, marginTop: 2 },
  navLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#A1ACBC",
    letterSpacing: 1.2,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  navList: { gap: 4 },
  navItem: {
    minHeight: 44,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
  },
  navItemActive: { backgroundColor: "#FFF3EA" },
  navText: { fontSize: 14, fontWeight: "600", color: "#64748B", flex: 1 },
  navTextActive: { color: colors.primaryDark, fontWeight: "700" },
  navCount: {
    minWidth: 24,
    height: 21,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    backgroundColor: "#F1F5F9",
  },
  navCountText: { color: "#64748B", fontSize: 11, fontWeight: "800" },
  sidebarBottom: { marginTop: "auto", gap: 16 },
  supportCard: {
    backgroundColor: "#FFF8F2",
    borderWidth: 1,
    borderColor: "#FDE5D2",
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  supportIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 3,
  },
  supportTitle: { color: "#334155", fontSize: 13, fontWeight: "800" },
  supportCopy: { color: "#94A3B8", fontSize: 11, lineHeight: 16 },
  supportButton: {
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    marginTop: 3,
  },
  supportButtonText: { color: colors.primaryDark, fontSize: 11, fontWeight: "800" },
  managerRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 4 },
  managerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFE4D3",
    alignItems: "center",
    justifyContent: "center",
  },
  managerInitials: { color: colors.primaryDark, fontSize: 12, fontWeight: "800" },
  managerName: { color: "#334155", fontSize: 12, fontWeight: "700" },
  managerRole: { color: "#94A3B8", fontSize: 10, marginTop: 2 },
  main: { flex: 1, minWidth: 0 },
  topbar: {
    height: 68,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E8EDF3",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 28,
  },
  locationPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  locationText: { color: "#475569", fontSize: 12, fontWeight: "600" },
  topActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  syncState: { flexDirection: "row", alignItems: "center", gap: 6, marginRight: 4 },
  syncDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#10B981" },
  syncText: { color: "#64748B", fontSize: 11, fontWeight: "600" },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  alertDot: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    top: 7,
    right: 7,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  alertCount: {
    position: "absolute",
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    top: 3,
    right: 2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    backgroundColor: "#DC2626",
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  alertCountText: { color: "#FFFFFF", fontSize: 8, fontWeight: "800" },
  compactBrand: { flexDirection: "row", alignItems: "center", gap: 9 },
  compactBrandText: { fontSize: 16, fontWeight: "800", color: "#172033" },
  mobileNav: {
    minHeight: 48,
    paddingHorizontal: 16,
    gap: 18,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E8EDF3",
  },
  mobileNavItem: { alignSelf: "stretch", justifyContent: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  mobileNavItemActive: { borderBottomColor: colors.primary },
  mobileNavText: { fontSize: 12, color: "#64748B", fontWeight: "600" },
  mobileNavTextActive: { color: colors.primaryDark, fontWeight: "800" },
  content: { width: "100%", maxWidth: 1420, alignSelf: "center", padding: 28, paddingBottom: 60, gap: 18 },
  contentPhone: { padding: 16, gap: 14 },
  pageHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 2 },
  sectionHeading: { gap: 3, marginBottom: 2 },
  eyebrow: { color: colors.primaryDark, fontSize: 10, letterSpacing: 1.35, fontWeight: "800", marginBottom: 3 },
  pageTitle: { color: "#172033", fontSize: 27, fontWeight: "800", letterSpacing: -0.7 },
  pageSubtitle: { color: "#7C899C", fontSize: 13, lineHeight: 20, marginTop: 3 },
  headingActions: { flexDirection: "row", gap: 9 },
  dateButton: {
    minHeight: 39,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
  },
  dateButtonText: { color: "#475569", fontSize: 12, fontWeight: "600" },
  exportButton: {
    minHeight: 39,
    borderRadius: 9,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 14,
  },
  exportButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  metrics: { flexDirection: "row", gap: 12 },
  metricCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 116,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E6EBF2",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    shadowColor: "#64748B",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  metricIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  metricLabel: { color: "#7C899C", fontSize: 11, fontWeight: "600" },
  metricValue: { color: "#172033", fontSize: 25, fontWeight: "800", letterSpacing: -0.5, marginTop: 3 },
  metricDetail: { color: "#7C899C", fontSize: 10, fontWeight: "600", marginTop: 3 },
  overviewGrid: { flexDirection: "row", gap: 16, alignItems: "stretch" },
  bottomGrid: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
  directoryGrid: { flexDirection: "row", gap: 14 },
  stack: { flexDirection: "column" },
  panel: {
    minWidth: 0,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E6EBF2",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    shadowColor: "#64748B",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  panelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 16,
  },
  panelTitle: { color: "#263247", fontSize: 14, fontWeight: "800" },
  panelSubtitle: { color: "#94A3B8", fontSize: 11, lineHeight: 17, marginTop: 3 },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: "#ECFDF5",
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#10B981" },
  liveText: { color: "#047857", fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },
  mapFrame: { position: "relative" },
  mapLegend: {
    position: "absolute",
    left: 10,
    bottom: 10,
    flexDirection: "row",
    gap: 12,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.94)",
  },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { color: "#64748B", fontSize: 9, fontWeight: "600" },
  linkText: { color: colors.primaryDark, fontSize: 11, fontWeight: "800" },
  teamRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 10 },
  rowBorder: { borderTopWidth: 1, borderTopColor: "#EEF2F6" },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#475569", fontSize: 11, fontWeight: "800" },
  rowTitle: { color: "#334155", fontSize: 12, fontWeight: "700", lineHeight: 18 },
  rowMeta: { color: "#94A3B8", fontSize: 10, lineHeight: 16 },
  inlineMeta: { flexDirection: "row", alignItems: "center", gap: 3 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: "800", textTransform: "capitalize" },
  fullButton: {
    minHeight: 38,
    borderRadius: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: "#FFF7ED",
    marginTop: 12,
  },
  fullButtonText: { color: colors.primaryDark, fontSize: 11, fontWeight: "800" },
  taskRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 10 },
  taskRowPressed: { opacity: 0.7, backgroundColor: "#F8FAFC" },
  slaLate: { color: "#B91C1C", fontWeight: "700" },
  tableHeader: {
    flexDirection: "row",
    gap: 14,
    paddingHorizontal: 0,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#E8EDF3",
  },
  tableHeading: { color: "#A1ACBC", fontSize: 9, fontWeight: "800", letterSpacing: 0.75 },
  performance: { gap: 7, marginBottom: 15 },
  performanceHead: { flexDirection: "row", justifyContent: "space-between" },
  performanceLabel: { color: "#64748B", fontSize: 11, fontWeight: "600" },
  performanceValue: { color: "#334155", fontSize: 11, fontWeight: "800" },
  progressTrack: { height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: "#EEF2F6" },
  progressFill: { height: 6, borderRadius: 3 },
  performanceFoot: {
    borderTopWidth: 1,
    borderTopColor: "#EEF2F6",
    paddingTop: 14,
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  performanceFootText: { flex: 1, color: "#64748B", fontSize: 11, fontWeight: "600" },
  performanceFootValue: { color: "#334155", fontSize: 12, fontWeight: "800" },
  taskTools: { flexDirection: "row", justifyContent: "space-between", gap: 12, marginBottom: 12 },
  searchBox: {
    width: 340,
    height: 40,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 11,
    backgroundColor: "#F8FAFC",
  },
  searchInput: { flex: 1, color: "#334155", fontSize: 12, outlineStyle: "none" } as object,
  filterRow: { flexDirection: "row", gap: 7 },
  filterButton: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  filterButtonActive: { borderColor: "#FED7AA", backgroundColor: "#FFF7ED" },
  filterText: { color: "#64748B", fontSize: 10, fontWeight: "700" },
  filterTextActive: { color: colors.primaryDark },
  empty: { minHeight: 180, alignItems: "center", justifyContent: "center", gap: 6 },
  emptyTitle: { color: "#475569", fontSize: 13, fontWeight: "800", marginTop: 4 },
  personHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  avatarLarge: { width: 48, height: 48, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  avatarLargeText: { color: "#475569", fontSize: 14, fontWeight: "800" },
  personName: { color: "#263247", fontSize: 15, fontWeight: "800", marginTop: 13 },
  personId: { color: "#94A3B8", fontSize: 10, fontWeight: "600", marginTop: 3 },
  personLocation: { flexDirection: "row", gap: 5, alignItems: "center", marginTop: 15 },
  personLocationText: { color: "#64748B", fontSize: 11, fontWeight: "600" },
  personStats: {
    flexDirection: "row",
    gap: 28,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#EEF2F6",
  },
  personStatValue: { color: "#334155", fontSize: 14, fontWeight: "800" },
  personStatLabel: { color: "#94A3B8", fontSize: 9, marginTop: 3 },
  vendorSummary: { flexDirection: "row", gap: 12 },
  summaryTile: {
    flex: 1,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E6EBF2",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  summaryValue: { color: "#172033", fontSize: 25, fontWeight: "800", marginTop: 4 },
  vendorRow: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: 12 },
  vendorIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF7ED",
  },
  vendorType: { width: 150, color: "#64748B", fontSize: 10, textTransform: "capitalize" },
  approvalGrid: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
  approvalRow: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 11 },
  approvalActions: { flexDirection: "row", gap: 7 },
  smallAction: {
    minHeight: 32,
    borderRadius: 8,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  smallActionPrimary: { borderColor: "#A7F3D0", backgroundColor: "#ECFDF5" },
  smallActionText: { color: "#64748B", fontSize: 10, fontWeight: "700" },
  smallActionTextPrimary: { color: "#047857" },
  emptyApproval: { minHeight: 140, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyApprovalText: { color: "#64748B", fontSize: 11, fontWeight: "600" },
  modalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: "rgba(15, 23, 42, 0.42)",
  },
  modalCard: {
    width: "100%",
    maxWidth: 680,
    maxHeight: "88%",
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    shadowColor: "#0F172A",
    shadowOpacity: 0.2,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
  },
  modalCardPhone: { maxHeight: "94%", borderRadius: 14 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F6",
  },
  modalTitle: { color: "#172033", fontSize: 19, fontWeight: "800", letterSpacing: -0.3 },
  modalBody: { padding: 20, gap: 22 },
  taskFacts: { flexDirection: "row", gap: 9 },
  taskFact: { flex: 1, minWidth: 0, borderRadius: 10, padding: 11, backgroundColor: "#F8FAFC" },
  taskFactLabel: { color: "#94A3B8", fontSize: 8, fontWeight: "800", letterSpacing: 0.7 },
  taskFactValue: { color: "#334155", fontSize: 11, fontWeight: "700", marginTop: 4 },
  modalSectionLabel: {
    color: "#94A3B8",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginBottom: 9,
  },
  choiceWrap: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  choice: {
    minWidth: 190,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    padding: 10,
  },
  choiceActive: { borderColor: "#FDBA74", backgroundColor: "#FFF7ED" },
  choiceAvatar: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  choiceAvatarText: { color: "#475569", fontSize: 9, fontWeight: "800" },
  choiceText: { color: "#475569", fontSize: 11, fontWeight: "700" },
  choiceTextActive: { color: colors.primaryDark },
  statusChoices: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  statusChoice: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  statusChoiceActive: { borderColor: "#FDBA74", backgroundColor: "#FFF7ED" },
  statusChoiceText: { color: "#64748B", fontSize: 10, fontWeight: "700" },
  statusChoiceTextActive: { color: colors.primaryDark },
  timelineRow: { flexDirection: "row", gap: 10, paddingVertical: 7 },
  timelineDot: { width: 7, height: 7, borderRadius: 4, marginTop: 5, backgroundColor: colors.primary },
  timelineText: { color: "#475569", fontSize: 11, fontWeight: "600", lineHeight: 17 },
  alertPanel: {
    width: "100%",
    maxWidth: 540,
    maxHeight: "88%",
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  alertBody: { padding: 20, gap: 6 },
  alertRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    paddingVertical: 9,
  },
  alertIconDanger: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEF2F2",
  },
  alertIconInfo: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EFF6FF",
  },
  alertDangerText: { color: "#B91C1C", fontSize: 10, fontWeight: "600", marginTop: 2 },
});
