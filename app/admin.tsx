import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Clock3,
  Download,
  LayoutDashboard,
  MapPin,
  Navigation,
  Search,
  Settings,
  Store,
  TrendingUp,
  Users,
  X,
} from "lucide-react-native";
import { colors } from "@/constants/theme";
import { MiniMap } from "@/components/mini-map";
import { KIND_LABEL } from "@/components/task-badges";
import { useApp } from "@/lib/app-context";
import { TEAM } from "@/lib/seed";
import type { FieldTask, TaskStatus, Vendor } from "@/lib/types";

type Section = "overview" | "team" | "tasks" | "vendors";
type TaskFilter = "all" | "assigned" | "in_progress" | "blocked" | "completed";

const NAV_ITEMS: { id: Section; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "team", label: "Field team" },
  { id: "tasks", label: "Task board" },
  { id: "vendors", label: "Partners" },
];

const STATUS_LABEL: Record<TaskStatus, string> = {
  assigned: "Assigned",
  in_progress: "In progress",
  awaiting_photo: "Needs proof",
  completed: "Completed",
  blocked: "Blocked",
};

export default function AdminScreen() {
  const { width } = useWindowDimensions();
  const compact = width < 920;
  const phone = width < 620;
  const { state, online } = useApp();
  const [section, setSection] = useState<Section>("overview");
  const [query, setQuery] = useState("");
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");

  const openTasks = state.tasks.filter((task) => task.status !== "completed");
  const completedTasks = state.tasks.filter((task) => task.status === "completed");
  const urgentTasks = openTasks.filter((task) => task.status === "blocked" || task.slaMinutes);
  const onboarding = state.vendors.filter((vendor) => vendor.onboarding);
  const filteredTasks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return state.tasks.filter((task) => {
      const statusMatch = taskFilter === "all" || task.status === taskFilter;
      const queryMatch =
        !needle ||
        [task.id, task.bookingRef, task.customerName, task.customerPlace.area, task.title]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      return statusMatch && queryMatch;
    });
  }, [query, state.tasks, taskFilter]);

  return (
    <View style={styles.app}>
      {!compact ? <Sidebar active={section} onChange={setSection} /> : null}

      <View style={styles.main}>
        <Topbar
          compact={compact}
          online={online}
          active={section}
          onChange={setSection}
          onClose={() => router.replace("/")}
        />

        <ScrollView
          contentContainerStyle={[styles.content, phone && styles.contentPhone]}
          showsVerticalScrollIndicator={false}
        >
          {section === "overview" ? (
            <Overview
              compact={compact}
              phone={phone}
              tasks={state.tasks}
              openTasks={openTasks}
              completedCount={completedTasks.length}
              urgentCount={urgentTasks.length}
              vendorCount={onboarding.length}
              onViewTasks={() => setSection("tasks")}
              onViewTeam={() => setSection("team")}
            />
          ) : section === "tasks" ? (
            <TasksPanel
              phone={phone}
              query={query}
              onQuery={setQuery}
              filter={taskFilter}
              onFilter={setTaskFilter}
              tasks={filteredTasks}
            />
          ) : section === "team" ? (
            <TeamPanel phone={phone} tasks={state.tasks} />
          ) : (
            <VendorsPanel phone={phone} vendors={onboarding} />
          )}
        </ScrollView>
      </View>
    </View>
  );
}

function Sidebar({ active, onChange }: { active: Section; onChange: (id: Section) => void }) {
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
          <Pressable style={styles.supportButton}>
            <Text style={styles.supportButtonText}>Contact support</Text>
          </Pressable>
        </View>
        <Pressable style={styles.managerRow}>
          <View style={styles.managerAvatar}>
            <Text style={styles.managerInitials}>AK</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.managerName}>Ananya Kapoor</Text>
            <Text style={styles.managerRole}>City manager</Text>
          </View>
          <Settings size={18} color="#94A3B8" />
        </Pressable>
      </View>
    </View>
  );
}

function NavItem({
  id,
  label,
  active,
  onPress,
}: {
  id: Section;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const iconColor = active ? colors.primaryDark : "#64748B";
  const Icon =
    id === "overview" ? LayoutDashboard : id === "team" ? Users : id === "tasks" ? ClipboardList : Store;
  return (
    <Pressable onPress={onPress} style={[styles.navItem, active && styles.navItemActive]}>
      <Icon size={19} color={iconColor} strokeWidth={active ? 2.4 : 2} />
      <Text style={[styles.navText, active && styles.navTextActive]}>{label}</Text>
      {id === "tasks" ? (
        <View style={styles.navCount}>
          <Text style={styles.navCountText}>7</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function Topbar({
  compact,
  online,
  active,
  onChange,
  onClose,
}: {
  compact: boolean;
  online: boolean;
  active: Section;
  onChange: (id: Section) => void;
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
            <Text style={styles.locationText}>Hyderabad operations</Text>
            <ChevronDown size={14} color="#64748B" />
          </View>
        )}
        <View style={styles.topActions}>
          <View style={styles.syncState}>
            <View style={[styles.syncDot, !online && { backgroundColor: "#EF4444" }]} />
            <Text style={styles.syncText}>{online ? "Live" : "Offline"}</Text>
          </View>
          <Pressable style={styles.iconButton}>
            <Bell size={19} color="#475569" />
            <View style={styles.alertDot} />
          </Pressable>
          <Pressable onPress={onClose} style={styles.iconButton}>
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
  onViewTasks,
  onViewTeam,
}: {
  compact: boolean;
  phone: boolean;
  tasks: FieldTask[];
  openTasks: FieldTask[];
  completedCount: number;
  urgentCount: number;
  vendorCount: number;
  onViewTasks: () => void;
  onViewTeam: () => void;
}) {
  return (
    <>
      <View style={[styles.pageHeading, phone && { alignItems: "flex-start" }]}>
        <View>
          <Text style={styles.eyebrow}>FIELD OPERATIONS</Text>
          <Text style={styles.pageTitle}>Good morning, Ananya</Text>
          <Text style={styles.pageSubtitle}>Here’s what’s happening across Hyderabad today.</Text>
        </View>
        <View style={[styles.headingActions, phone && { width: "100%" }]}>
          <Pressable style={[styles.dateButton, phone && { flex: 1 }]}>
            <CalendarDays size={16} color="#475569" />
            <Text style={styles.dateButtonText}>27 Aug 2026</Text>
            <ChevronDown size={14} color="#94A3B8" />
          </Pressable>
          <Pressable style={styles.exportButton}>
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
          value={`${TEAM.filter((member) => member.status !== "off_shift").length}/${TEAM.length}`}
          detail="All checked in"
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
          detail="+12% vs. yesterday"
          tone="green"
        />
        <MetricCard
          icon={<Store size={20} color={colors.primaryDark} />}
          iconBg="#FFF7ED"
          label="Partner pipeline"
          value={String(vendorCount)}
          detail="3 follow-ups due"
          tone="neutral"
        />
      </View>

      <View style={[styles.overviewGrid, compact && styles.stack]}>
        <Panel style={{ flex: 1.62 }}>
          <View style={styles.panelHeader}>
            <View>
              <Text style={styles.panelTitle}>Live field view</Text>
              <Text style={styles.panelSubtitle}>Last updated a few seconds ago</Text>
            </View>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>
          <View style={styles.mapFrame}>
            <MiniMap
              height={compact ? 250 : 315}
              markers={TEAM.map((member) => ({
                id: member.id,
                label: member.name.split(" ")[0],
                color: member.status === "on_task" ? colors.primary : "#2563EB",
                point: member.geo,
              }))}
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
            </View>
          </View>
        </Panel>

        <Panel style={{ flex: 1 }}>
          <View style={styles.panelHeader}>
            <View>
              <Text style={styles.panelTitle}>Field team</Text>
              <Text style={styles.panelSubtitle}>3 members active</Text>
            </View>
            <Pressable onPress={onViewTeam}>
              <Text style={styles.linkText}>View all</Text>
            </Pressable>
          </View>
          <View>
            {TEAM.map((member, index) => (
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
                    <Text style={styles.rowMeta}>{member.area}</Text>
                  </View>
                </View>
                <StatusPill
                  label={member.status === "on_task" ? "On task" : "Available"}
                  tone={member.status === "on_task" ? "orange" : "green"}
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
          {openTasks.slice(0, 4).map((task, index) => (
            <TaskRow key={task.id} task={task} bordered={index > 0} phone={phone} />
          ))}
        </Panel>

        <Panel style={{ flex: 1 }}>
          <View style={styles.panelHeader}>
            <View>
              <Text style={styles.panelTitle}>Today’s performance</Text>
              <Text style={styles.panelSubtitle}>Hyderabad city team</Text>
            </View>
            <TrendingUp size={20} color="#059669" />
          </View>
          <Performance label="On-time arrival" value="92%" width="92%" color="#10B981" />
          <Performance label="First-attempt success" value="84%" width="84%" color="#2563EB" />
          <Performance label="Proof compliance" value="96%" width="96%" color={colors.primary} />
          <View style={styles.performanceFoot}>
            <Clock3 size={16} color="#64748B" />
            <Text style={styles.performanceFootText}>Avg. task time</Text>
            <Text style={styles.performanceFootValue}>48 min</Text>
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
}: {
  phone: boolean;
  query: string;
  onQuery: (value: string) => void;
  filter: TaskFilter;
  onFilter: (filter: TaskFilter) => void;
  tasks: FieldTask[];
}) {
  const filters: { id: TaskFilter; label: string }[] = [
    { id: "all", label: "All tasks" },
    { id: "assigned", label: "Assigned" },
    { id: "in_progress", label: "In progress" },
    { id: "blocked", label: "Blocked" },
    { id: "completed", label: "Completed" },
  ];
  return (
    <>
      <SectionHeading
        eyebrow="DISPATCH"
        title="Task board"
        subtitle="Monitor field work, SLAs, and proof status across the city."
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
          {!phone ? <Text style={[styles.tableHeading, { flex: 0.8 }]}>AREA</Text> : null}
          <Text style={[styles.tableHeading, { width: 104 }]}>STATUS</Text>
        </View>
        {tasks.map((task, index) => (
          <TaskRow key={task.id} task={task} bordered={index > 0} phone={phone} />
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

function TeamPanel({ phone, tasks }: { phone: boolean; tasks: FieldTask[] }) {
  return (
    <>
      <SectionHeading
        eyebrow="PEOPLE"
        title="Field team"
        subtitle="Live availability and workload for Hyderabad field executives."
      />
      <View style={[styles.directoryGrid, phone && styles.stack]}>
        {TEAM.map((member, index) => {
          const assigned = Math.max(1, tasks.filter((task) => task.status !== "completed").length - index * 2);
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
                  label={member.status === "on_task" ? "On task" : "Available"}
                  tone={member.status === "on_task" ? "orange" : "green"}
                />
              </View>
              <Text style={styles.personName}>{member.name}</Text>
              <Text style={styles.personId}>{member.employeeId}</Text>
              <View style={styles.personLocation}>
                <MapPin size={15} color={colors.primaryDark} />
                <Text style={styles.personLocationText}>{member.area}</Text>
              </View>
              <View style={styles.personStats}>
                <View>
                  <Text style={styles.personStatValue}>{assigned}</Text>
                  <Text style={styles.personStatLabel}>Open tasks</Text>
                </View>
                <View>
                  <Text style={styles.personStatValue}>{index === 1 ? "7.8" : index === 2 ? "12.4" : "5.2"} km</Text>
                  <Text style={styles.personStatLabel}>Distance</Text>
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

function TaskRow({ task, bordered, phone }: { task: FieldTask; bordered: boolean; phone: boolean }) {
  return (
    <View style={[styles.taskRow, bordered && styles.rowBorder]}>
      <View style={{ flex: 1.3 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {task.id} · {KIND_LABEL[task.kind]}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {task.bookingRef} · {task.beatWindow ?? "Flexible"}
          {phone ? ` · ${task.customerName}` : ""}
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
          <View style={styles.inlineMeta}>
            <MapPin size={12} color="#94A3B8" />
            <Text style={styles.rowMeta} numberOfLines={1}>
              {task.customerPlace.area}
            </Text>
          </View>
        </View>
      ) : null}
      <View style={{ width: 104, alignItems: "flex-end" }}>
        <StatusPill
          label={STATUS_LABEL[task.status]}
          tone={task.status === "completed" ? "green" : task.status === "blocked" ? "red" : "orange"}
        />
      </View>
    </View>
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
  statusText: { fontSize: 9, fontWeight: "800", textTransform: "capitalize" },
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
});
