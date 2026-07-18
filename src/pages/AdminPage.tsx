import { FormEvent, useEffect, useRef, useState } from "react";
import { api, stashLoginNotice } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { uploadImportFile, uploadLimitFile, type ImportResult } from "@/api/upload";
import { DeveloperViewPanel } from "@/components/DeveloperViewPanel";
import { AppShell } from "@/components/AppShell";
import { BRAND } from "@/config/branding";

interface AlertRule {
  id: number;
  period: "week" | "month";
  threshold_percent: number;
  direction: string;
  enabled: number;
}

interface AppUser {
  id: number;
  username: string;
  display_name: string;
  role: "admin" | "sales" | "leader";
  enabled: number;
  email?: string | null;
  merchant_count?: number;
  team_member_count?: number;
  leader_display_name?: string | null;
}

interface AdminPageProps {
  navResetKey?: number;
}

type UploadPhase = "idle" | "uploading" | "processing" | "done" | "error";
type AdminSection = "hub" | "users" | "password" | "import" | "rules" | "developer";

const PERIOD_LABEL = { week: "週", month: "月" } as const;

const ADMIN_ENTRIES: Array<{
  id: Exclude<AdminSection, "hub">;
  title: string;
  desc: string;
  icon: string;
}> = [
  {
    id: "import",
    title: "導入交易數據",
    desc: "上傳支付後台導出檔案，全量或追加",
    icon: "📂",
  },
  {
    id: "users",
    title: "銷售帳號與權限",
    desc: "新增銷售、重置密碼、停用或刪除帳號",
    icon: "👥",
  },
  {
    id: "rules",
    title: "預警閥值",
    desc: "設定週、月環比下降預警比例",
    icon: "📉",
  },
  {
    id: "password",
    title: "修改管理員密碼",
    desc: "更新後臺管理員登入密碼",
    icon: "🔐",
  },
  {
    id: "developer",
    title: "開發者視圖",
    desc: "主題配色 · 淺色/深色 · 僅管理員",
    icon: "🎨",
  },
];

const SECTION_TITLES: Record<Exclude<AdminSection, "hub">, string> = {
  users: "銷售帳號與權限",
  password: "修改管理員密碼",
  import: "導入交易數據",
  rules: "預警閥值",
  developer: "開發者視圖",
};

function AdminSectionBack({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="admin-section-back" onClick={onClick}>
      ← 後臺首頁
    </button>
  );
}

export function AdminPage({ navResetKey = 0 }: AdminPageProps) {
  const { logout } = useAuth();
  const [section, setSection] = useState<AdminSection>("hub");
  const fileRef = useRef<HTMLInputElement>(null);
  const limitFileRef = useRef<HTMLInputElement>(null);
  const uploadProgressFloor = useRef(0);
  const [limitUploadKind, setLimitUploadKind] = useState<"card" | "scan">("card");
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [dailyDeclineThreshold, setDailyDeclineThreshold] = useState("10");
  const [mastercardHighlightWan, setMastercardHighlightWan] = useState("130");
  const [mastercardAlertWan, setMastercardAlertWan] = useState("160");
  const [users, setUsers] = useState<AppUser[]>([]);
  const [importMode, setImportMode] = useState<"append" | "replace" | "failuresOnly">("replace");
  const [importSalesName, setImportSalesName] = useState("");
  const [importBatches, setImportBatches] = useState<
    { id: number; filename: string; row_count: number; imported_at: string; unassigned_merchants: number }[]
  >([]);
  const [assigningBatchId, setAssigningBatchId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"info" | "success" | "error">("info");
  const [uploading, setUploading] = useState(false);
  const [uploadingLimits, setUploadingLimits] = useState(false);
  const [limitStats, setLimitStats] = useState<{
    merchantCount: number;
    cardLimitCount: number;
    scanLimitCount: number;
    lastImportedAt: string | null;
  } | null>(null);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>("idle");
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploadFileLabel, setUploadFileLabel] = useState("");
  const [showCompleteBanner, setShowCompleteBanner] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", displayName: "", password: "", email: "" });
  const [creatingUser, setCreatingUser] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [teamLeader, setTeamLeader] = useState<AppUser | null>(null);
  const [teamSalesIds, setTeamSalesIds] = useState<number[]>([]);
  const [allSalesForTeam, setAllSalesForTeam] = useState<
    {
      id: number;
      displayName: string;
      username: string;
      assignedLeaderId: number | null;
      assignedLeaderName: string | null;
    }[]
  >([]);
  const [savingTeam, setSavingTeam] = useState(false);
  const [pwdForm, setPwdForm] = useState({ current: "", next: "", confirm: "" });
  const [changingPwd, setChangingPwd] = useState(false);

  const loadRules = () => {
    api<{ rules: AlertRule[] }>("/alert-rules").then((r) => setRules(r.rules));
    api<{
      dailyDeclineThresholdPercent: number;
      mastercardLifetimeWarnHkd: number;
      mastercardLifetimeAlertHkd: number;
    }>("/insight-settings").then((r) => {
      setDailyDeclineThreshold(String(r.dailyDeclineThresholdPercent));
      setMastercardHighlightWan(String(r.mastercardLifetimeWarnHkd / 10_000));
      setMastercardAlertWan(String(r.mastercardLifetimeAlertHkd / 10_000));
    });
  };

  const loadUsers = () => {
    api<{ users: AppUser[] }>("/users").then((r) => setUsers(r.users));
  };

  const loadImportBatches = () => {
    api<{ batches: typeof importBatches }>("/import/batches").then((r) => setImportBatches(r.batches));
  };

  const loadLimitStats = () => {
    api<{
      merchantCount: number;
      cardLimitCount: number;
      scanLimitCount: number;
      lastImportedAt: string | null;
    }>("/import/limits/stats").then(setLimitStats);
  };

  useEffect(() => {
    loadRules();
    loadUsers();
  }, []);

  const openSection = (next: Exclude<AdminSection, "hub">) => {
    setMessage("");
    setMessageType("info");
    setSection(next);
    if (next === "import") {
      loadImportBatches();
      loadLimitStats();
    }
  };

  useEffect(() => {
    setSection("hub");
  }, [navResetKey]);

  const setMsg = (text: string, type: "info" | "success" | "error" = "info") => {
    setMessage(text);
    setMessageType(type);
  };

  const upload = async (files: FileList | File[]) => {
    setUploading(true);
    setShowCompleteBanner(false);
    setMsg("");
    setUploadPhase("uploading");
    setUploadPercent(0);
    uploadProgressFloor.current = 0;

    const token = localStorage.getItem("merchant-agent-token");
    if (!token) {
      setMsg("未登入", "error");
      setUploadPhase("error");
      setUploading(false);
      return;
    }

    const list = [...files];
    let totalImported = 0;
    let totalSkipped = 0;
    let totalFailures = 0;
    let totalFailuresSkipped = 0;
    const notes: string[] = [];

    const formatFileNote = (data: ImportResult, fileName: string) => {
      if (importMode === "failuresOnly") {
        const skip = data.failuresSkipped ?? 0;
        return skip > 0
          ? `${fileName}：新增失敗 ${data.failuresImported ?? 0} 筆，重複跳過 ${skip} 筆`
          : `${fileName}：新增失敗 ${data.failuresImported ?? 0} 筆`;
      }
      const skip = data.skipped ?? 0;
      let note =
        skip > 0
          ? `${fileName}：新增 ${data.imported ?? 0} 筆，重複跳過 ${skip} 筆`
          : `${fileName}：新增 ${data.imported ?? 0} 筆`;
      const filled = data.cardRegionFilled ?? 0;
      if (filled > 0) {
        note += `；補寫空的卡歸屬地 ${filled} 筆`;
      }
      const fSkip = data.failuresSkipped ?? 0;
      if ((data.failuresImported ?? 0) > 0 || fSkip > 0) {
        note +=
          fSkip > 0
            ? `；失敗新增 ${data.failuresImported ?? 0} 筆，重複跳過 ${fSkip} 筆`
            : `；失敗新增 ${data.failuresImported ?? 0} 筆`;
      }
      return note;
    };

    try {
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        setUploadFileLabel(`(${i + 1}/${list.length}) ${file.name}`);

        const mode =
          importMode === "failuresOnly"
            ? "append"
            : i === 0 && list.length > 1 && importMode === "replace"
              ? "replace"
              : i === 0
                ? importMode
                : "append";

        const scope = importMode === "failuresOnly" ? "failuresOnly" : undefined;

        const baseProgress = (i / list.length) * 100;
        const fileStartPct = Math.min(99, Math.round(baseProgress));
        uploadProgressFloor.current = Math.max(uploadProgressFloor.current, fileStartPct);
        setUploadPercent(uploadProgressFloor.current);
        if (i > 0) setUploadPhase("processing");

        const data = await uploadImportFile(
          file,
          mode,
          scope,
          token,
          (filePct) => {
            const overall = Math.min(99, Math.round(baseProgress + filePct / list.length));
            uploadProgressFloor.current = Math.max(uploadProgressFloor.current, overall);
            setUploadPercent(uploadProgressFloor.current);
            if (filePct >= 100) setUploadPhase("processing");
          },
          importSalesName || undefined
        );

        totalImported += data.imported ?? 0;
        totalSkipped += data.skipped ?? 0;
        totalFailures += data.failuresImported ?? 0;
        totalFailuresSkipped += data.failuresSkipped ?? 0;
        notes.push(formatFileNote(data, file.name));
      }

      setUploadPercent(100);
      setUploadPhase("done");
      setShowCompleteBanner(true);

      const summary =
        importMode === "failuresOnly"
          ? totalFailuresSkipped > 0
            ? `共新增交易失敗 ${totalFailures} 筆，${totalFailuresSkipped} 筆因重複跳過`
            : `共新增交易失敗 ${totalFailures} 筆`
          : totalSkipped > 0 || totalFailuresSkipped > 0
            ? `共新增 ${totalImported} 筆成功交易，${totalSkipped} 筆因重複跳過${
                totalFailures > 0 || totalFailuresSkipped > 0
                  ? totalFailuresSkipped > 0
                    ? `；失敗新增 ${totalFailures} 筆，${totalFailuresSkipped} 筆因重複跳過`
                    : `；失敗新增 ${totalFailures} 筆`
                  : ""
              }`
            : totalFailures > 0
              ? `共新增 ${totalImported} 筆成功交易；失敗新增 ${totalFailures} 筆`
              : `共新增 ${totalImported} 筆成功交易`;
      setMsg(`${summary}。${notes.join("；")}`, "success");
      loadRules();
      loadUsers();
      loadImportBatches();
    } catch (e) {
      setUploadPhase("error");
      setMsg(e instanceof Error ? e.message : "上傳失敗", "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
      setTimeout(() => {
        setUploadPhase("idle");
        setUploadPercent(0);
        setUploadFileLabel("");
        uploadProgressFloor.current = 0;
      }, 8000);
    }
  };

  const uploadLimits = async (files: FileList | File[], kind: "card" | "scan") => {
    setUploadingLimits(true);
    setMsg("");
    const token = localStorage.getItem("merchant-agent-token");
    if (!token) {
      setMsg("未登入", "error");
      setUploadingLimits(false);
      return;
    }

    const list = [...files];
    const notes: string[] = [];
    try {
      for (const file of list) {
        const data = await uploadLimitFile(file, kind, token, () => {});
        notes.push(data.message ?? `${file.name}：導入完成`);
      }
      setMsg(notes.join("；"), "success");
      loadLimitStats();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "額度上傳失敗", "error");
    } finally {
      setUploadingLimits(false);
      if (limitFileRef.current) limitFileRef.current.value = "";
    }
  };

  const assignBatchSales = async (batchId: number, salesName: string) => {
    if (!salesName.trim()) {
      setMsg("請選擇或輸入銷售名", "error");
      return;
    }
    setAssigningBatchId(batchId);
    try {
      const res = await api<{ message: string }>(`/import/batches/${batchId}/assign-sales`, {
        method: "POST",
        json: { salesName: salesName.trim() },
      });
      setMsg(res.message, "success");
      loadImportBatches();
      loadUsers();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "補歸屬失敗", "error");
    } finally {
      setAssigningBatchId(null);
    }
  };

  const saveRule = async (period: "week" | "month", thresholdPercent: number) => {
    await api(`/alert-rules/${period}`, {
      method: "PUT",
      json: { thresholdPercent, enabled: true, direction: "decrease" },
    });
    loadRules();
    setMsg(`已更新${PERIOD_LABEL[period]}預警閥值為 ${thresholdPercent}%`, "success");
  };

  const saveDailyDeclineThreshold = async (e: FormEvent) => {
    e.preventDefault();
    const thresholdPercent = Number(dailyDeclineThreshold);
    try {
      await api("/insight-settings/daily-decline-threshold", {
        method: "PUT",
        json: { thresholdPercent },
      });
      loadRules();
      setMsg(`已更新「下跌中」判定閾值為 ${thresholdPercent}%`, "success");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "設定失敗", "error");
    }
  };

  const saveMastercardHighlightThreshold = async (e: FormEvent) => {
    e.preventDefault();
    const thresholdWan = Number(mastercardHighlightWan);
    if (!Number.isFinite(thresholdWan) || thresholdWan <= 0) {
      setMsg("請輸入有效的萬港幣金額", "error");
      return;
    }
    const thresholdHkd = Math.round(thresholdWan * 10_000);
    try {
      await api("/insight-settings/mastercard-lifetime-highlight", {
        method: "PUT",
        json: { thresholdHkd },
      });
      setMsg(`已更新萬事達累計標黃閾值為 ${thresholdWan} 萬港幣`, "success");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "設定失敗", "error");
    }
  };

  const saveMastercardAlertThreshold = async (e: FormEvent) => {
    e.preventDefault();
    const thresholdWan = Number(mastercardAlertWan);
    if (!Number.isFinite(thresholdWan) || thresholdWan <= 0) {
      setMsg("請輸入有效的萬港幣金額", "error");
      return;
    }
    const thresholdHkd = Math.round(thresholdWan * 10_000);
    try {
      await api("/insight-settings/mastercard-lifetime-alert", {
        method: "PUT",
        json: { thresholdHkd },
      });
      setMsg(`已更新萬事達累計標紅閾值為 ${thresholdWan} 萬港幣`, "success");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "設定失敗", "error");
    }
  };

  const createUser = async (e: FormEvent) => {
    e.preventDefault();
    setCreatingUser(true);
    try {
      const username = newUser.username.trim();
      const displayName = newUser.displayName.trim();
      await api("/users", {
        method: "POST",
        json: {
          username,
          displayName,
          password: newUser.password,
          role: "sales",
          email: newUser.email.trim() || undefined,
        },
      });
      setNewUser({ username: "", displayName: "", password: "", email: "" });
      loadUsers();
      setMsg(`已創建銷售帳號：${displayName}（登入名 ${username}）`, "success");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "創建失敗", "error");
    } finally {
      setCreatingUser(false);
    }
  };

  const resetPassword = async (user: AppUser) => {
    const pwd = window.prompt(`為「${user.display_name}」設定新密碼（至少 6 位）`);
    if (!pwd) return;
    if (pwd.length < 6) {
      setMsg("密碼至少 6 位", "error");
      return;
    }
    try {
      await api(`/users/${user.id}/password`, { method: "PUT", json: { password: pwd } });
      setMsg(`已重置 ${user.display_name} 的密碼`, "success");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "重置失敗", "error");
    }
  };

  const editEmail = async (user: AppUser) => {
    const email = window.prompt(
      `設定「${user.display_name}」的工作郵箱（留空清除，第二期將用於郵件提醒）`,
      user.email ?? ""
    );
    if (email === null) return;
    try {
      await api(`/users/${user.id}`, {
        method: "PUT",
        json: { displayName: user.display_name, email: email.trim() || null },
      });
      loadUsers();
      setMsg(`已更新 ${user.display_name} 的郵箱`, "success");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "更新失敗", "error");
    }
  };

  const editDisplayName = async (user: AppUser) => {
    const name = window.prompt(`修改「${user.display_name}」的顯示名（工作台顯示用，如 Sam、Winnie）`, user.display_name);
    if (!name?.trim() || name.trim() === user.display_name) return;
    try {
      await api(`/users/${user.id}`, { method: "PUT", json: { displayName: name.trim() } });
      loadUsers();
      setMsg(`已更新 ${user.username} 的顯示名為 ${name.trim()}`, "success");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "更新失敗", "error");
    }
  };

  const editUsername = async (user: AppUser) => {
    const name = window.prompt(
      `修改「${user.display_name}」的登入名（須與移卡「業務員」一致，如 sam202512）`,
      user.username
    );
    if (!name?.trim() || name.trim() === user.username) return;
    try {
      await api(`/users/${user.id}`, {
        method: "PUT",
        json: { username: name.trim(), displayName: user.display_name },
      });
      loadUsers();
      setMsg(`已更新登入名：${user.username} → ${name.trim()}（密碼不變）`, "success");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "更新失敗", "error");
    }
  };

  const toggleUserStatus = async (user: AppUser) => {
    const disabling = user.enabled !== 0;
    const action = disabling ? "停用" : "啟用";
    if (
      !window.confirm(
        disabling
          ? `確定停用銷售「${user.display_name}」？停用後將無法登入，名下商戶仍保留。`
          : `確定重新啟用銷售「${user.display_name}」？`
      )
    ) {
      return;
    }
    try {
      await api(`/users/${user.id}/status`, { method: "PUT", json: { enabled: !disabling } });
      loadUsers();
      setMsg(`已${action} ${user.display_name}`, "success");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : `${action}失敗`, "error");
    }
  };

  const deleteUser = async (user: AppUser) => {
    if (
      !window.confirm(
        `確定刪除銷售「${user.display_name}」？此操作不可恢復。名下 ${user.merchant_count ?? 0} 家商戶將解除與該帳號的關聯（商戶數據保留）。`
      )
    ) {
      return;
    }
    try {
      await api(`/users/${user.id}`, { method: "DELETE" });
      loadUsers();
      setMsg(`已刪除銷售帳號 ${user.display_name}`, "success");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "刪除失敗", "error");
    }
  };

  const syncMerchants = async () => {
    setSyncing(true);
    try {
      const res = await api<{
        message: string;
        unmatched?: { salesName: string; merchantCount: number }[];
      }>("/users/sync-merchants", { method: "POST" });
      const extra =
        res.unmatched && res.unmatched.length > 0
          ? `。未匹配：${res.unmatched
              .slice(0, 8)
              .map((u) => `${u.salesName}（${u.merchantCount}家）`)
              .join("、")}${res.unmatched.length > 8 ? "…" : ""}`
          : "";
      setMsg(res.message + extra, res.unmatched?.length ? "error" : "success");
      loadUsers();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "同步失敗", "error");
    } finally {
      setSyncing(false);
    }
  };

  const changeOwnPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (pwdForm.next !== pwdForm.confirm) {
      setMsg("兩次輸入的新密碼不一致", "error");
      return;
    }
    setChangingPwd(true);
    try {
      await api("/auth/me/password", {
        method: "PUT",
        json: { currentPassword: pwdForm.current, newPassword: pwdForm.next },
      });
      stashLoginNotice("密碼已修改，請使用新密碼重新登入");
      logout();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "修改失敗", "error");
    } finally {
      setChangingPwd(false);
    }
  };

  const staffUsers = users.filter((u) => u.role === "sales" || u.role === "leader");

  const openTeamConfig = async (leader: AppUser) => {
    try {
      const data = await api<{
        memberIds: number[];
        allSales: {
          id: number;
          displayName: string;
          username: string;
          assignedLeaderId: number | null;
          assignedLeaderName: string | null;
        }[];
      }>(`/users/${leader.id}/team`);
      setTeamLeader(leader);
      setTeamSalesIds(data.memberIds);
      setAllSalesForTeam(data.allSales);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "載入團隊失敗", "error");
    }
  };

  const saveTeamConfig = async () => {
    if (!teamLeader) return;
    setSavingTeam(true);
    try {
      await api(`/users/${teamLeader.id}/team`, {
        method: "PUT",
        json: { salesUserIds: teamSalesIds },
      });
      setMsg(`已更新「${teamLeader.display_name}」的團隊成員`, "success");
      setTeamLeader(null);
      loadUsers();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "儲存失敗", "error");
    } finally {
      setSavingTeam(false);
    }
  };

  const setUserRole = async (user: AppUser, role: "sales" | "leader") => {
    const label = role === "leader" ? "主管" : "銷售";
    if (
      !window.confirm(
        role === "leader"
          ? `確定將「${user.display_name}」設為主管？設為主管後可在後臺配置其團隊銷售。`
          : `確定將「${user.display_name}」改回銷售？其團隊配置將被清除。`
      )
    ) {
      return;
    }
    try {
      await api(`/users/${user.id}/role`, { method: "PUT", json: { role } });
      loadUsers();
      setMsg(`已將 ${user.display_name} 設為${label}`, "success");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "操作失敗", "error");
    }
  };

  const phaseLabel =
    uploadPhase === "uploading"
      ? "正在上傳檔案…"
      : uploadPhase === "processing"
        ? "上傳完成，伺服器正在解析導入…"
        : uploadPhase === "done"
          ? "100% 完成"
          : "";

  const messageBlock =
    message && section !== "hub" ? (
      <p
        className={
          messageType === "error"
            ? "form-error"
            : messageType === "success"
              ? "form-msg form-msg--success"
              : "form-msg"
        }
      >
        {message}
      </p>
    ) : null;

  if (section === "hub") {
    return (
      <AppShell title={BRAND.adminHubTitle} subtitle={BRAND.companyName}>
        <section className="panel">
          <p className="panel-desc panel-desc-tight">選擇要管理的後臺功能模塊</p>
          <div className="admin-hub-grid">
            {ADMIN_ENTRIES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="admin-hub-card"
                onClick={() => openSection(entry.id)}
              >
                <div className="admin-hub-icon">{entry.icon}</div>
                <div className="admin-hub-body">
                  <h3>{entry.title}</h3>
                  <p>{entry.desc}</p>
                </div>
                <span className="admin-hub-arrow">→</span>
              </button>
            ))}
          </div>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={SECTION_TITLES[section]}
      subtitle={`${BRAND.adminHubTitle} · ${BRAND.companyName}`}
    >
      <AdminSectionBack onClick={() => setSection("hub")} />
      {section === "import" && showCompleteBanner && (
        <div className="import-complete-banner" role="status">
          <span className="import-complete-icon">✓</span>
          <div>
            <strong>導入 100% 完成</strong>
            <p>數據已寫入系統，銷售重新整理頁面即可查看最新結果。</p>
          </div>
          <button type="button" className="import-complete-close" onClick={() => setShowCompleteBanner(false)}>
            ×
          </button>
        </div>
      )}

      {section === "users" && (
        <section className="panel">
          <div className="permissions-grid">
            <div className="permission-card">
              <h3>管理員</h3>
              <ul>
                <li>查看全部商戶與預警</li>
                <li>上傳 / 管理交易數據</li>
                <li>創建銷售帳號、重置密碼</li>
                <li>停用 / 刪除銷售帳號</li>
                <li>設定預警閥值</li>
              </ul>
            </div>
            <div className="permission-card">
              <h3>銷售</h3>
              <ul>
                <li>僅查看本人名下商戶</li>
                <li>交易預警、交易失敗、填寫跟進記錄</li>
                <li>不可上傳數據、不可改規則</li>
              </ul>
            </div>
            <div className="permission-card">
              <h3>主管</h3>
              <ul>
                <li>擁有銷售工作台全部功能（含本人名下商戶）</li>
                <li>可查看管理員配置的團隊銷售交易與預警</li>
                <li>可查看團隊跟進記錄，不可代替銷售提交</li>
              </ul>
            </div>
          </div>

          <p className="panel-desc">
            銷售登入後<strong>只能看到自己名下的商戶</strong>。機構報表按「業務員」歸屬，因此
            <strong>登入名（username）</strong>須與移卡「業務員」一致（如 <code>sam202512</code>）；
            <strong>顯示名</strong>僅用於工作台展示（如 Sam）。<strong>工作郵箱</strong>可先填好，第二期將用於郵件提醒。
          </p>

          <form className="user-create-form" onSubmit={createUser}>
            <label>
              登入用戶名
              <input
                value={newUser.username}
                onChange={(e) => setNewUser((s) => ({ ...s, username: e.target.value }))}
                placeholder="如 jasonlee（銷售用來登入）"
                required
              />
            </label>
            <label>
              顯示名（與數據歸屬一致）
              <input
                value={newUser.displayName}
                onChange={(e) => setNewUser((s) => ({ ...s, displayName: e.target.value }))}
                placeholder="如 JasonLee、Sam、WING"
                required
              />
            </label>
            <label>
              工作郵箱（可選）
              <input
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser((s) => ({ ...s, email: e.target.value }))}
                placeholder="sales@company.com"
              />
            </label>
            <label>
              初始密碼
              <input
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser((s) => ({ ...s, password: e.target.value }))}
                placeholder="至少 6 位"
                minLength={6}
                required
              />
            </label>
            <button type="submit" className="btn btn-primary btn-sm" disabled={creatingUser}>
              {creatingUser ? "創建中…" : "新增銷售帳號"}
            </button>
          </form>

          <div className="user-sync-row">
            <button type="button" className="btn btn-outline btn-sm" disabled={syncing} onClick={syncMerchants}>
              {syncing ? "同步中…" : "同步商戶歸屬"}
            </button>
            <span className="muted user-sync-hint">導入數據後點一次，按商戶「銷售名」關聯到帳號</span>
          </div>

          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table className="data-table data-table-compact">
              <thead>
                <tr>
                  <th>顯示名</th>
                  <th>登入用戶名</th>
                  <th>工作郵箱</th>
                  <th>名下商戶</th>
                  <th>歸屬主管</th>
                  <th>狀態</th>
                  <th>權限</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {staffUsers.map((u) => (
                  <tr key={u.id} className={u.enabled === 0 ? "user-row--disabled" : undefined}>
                    <td>
                      <strong>{u.display_name}</strong>
                    </td>
                    <td>{u.username}</td>
                    <td className="user-email-cell">{u.email || "—"}</td>
                    <td>{u.merchant_count ?? 0} 家</td>
                    <td>
                      {u.role === "leader" ? (
                        <span className="muted">{u.team_member_count ?? 0} 人團隊</span>
                      ) : u.leader_display_name ? (
                        u.leader_display_name
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      {u.enabled === 0 ? (
                        <span className="status-tag status-tag--disabled">已停用</span>
                      ) : (
                        <span className="status-tag status-tag--active">正常</span>
                      )}
                    </td>
                    <td>
                      {u.role === "leader" ? (
                        <span className="role-tag role-tag--leader">主管</span>
                      ) : (
                        <span className="role-tag role-tag--sales">銷售</span>
                      )}
                    </td>
                    <td className="user-actions-cell">
                      {u.role === "leader" && (
                        <button type="button" className="btn btn-sm btn-outline" onClick={() => openTeamConfig(u)}>
                          配置團隊
                        </button>
                      )}
                      {u.role === "sales" && (
                        <button type="button" className="btn btn-sm btn-outline" onClick={() => setUserRole(u, "leader")}>
                          設為主管
                        </button>
                      )}
                      {u.role === "leader" && (
                        <button type="button" className="btn btn-sm btn-outline" onClick={() => setUserRole(u, "sales")}>
                          改為銷售
                        </button>
                      )}
                      <button type="button" className="btn btn-sm btn-outline" onClick={() => editEmail(u)}>
                        設郵箱
                      </button>
                      <button type="button" className="btn btn-sm btn-outline" onClick={() => editUsername(u)}>
                        改登入名
                      </button>
                      <button type="button" className="btn btn-sm btn-outline" onClick={() => editDisplayName(u)}>
                        改顯示名
                      </button>
                      <button type="button" className="btn btn-sm btn-outline" onClick={() => resetPassword(u)}>
                        重置密碼
                      </button>
                      <button type="button" className="btn btn-sm btn-outline" onClick={() => toggleUserStatus(u)}>
                        {u.enabled === 0 ? "啟用" : "停用"}
                      </button>
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => deleteUser(u)}>
                        刪除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {teamLeader && (
            <div className="follow-up-modal-backdrop" role="presentation" onClick={() => setTeamLeader(null)}>
              <div
                className="follow-up-modal team-config-modal"
                role="dialog"
                aria-labelledby="team-config-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="follow-up-modal-head">
                  <div>
                    <h3 id="team-config-title">配置團隊 · {teamLeader.display_name}</h3>
                    <p className="muted">勾選歸屬該主管的銷售（每位銷售僅能歸屬一位主管）</p>
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTeamLeader(null)}>
                    關閉
                  </button>
                </div>
                <div className="team-config-list">
                  {allSalesForTeam.length === 0 ? (
                    <p className="muted">暫無可分配的銷售帳號</p>
                  ) : (
                    allSalesForTeam.map((s) => {
                      const takenByOther =
                        s.assignedLeaderId != null && s.assignedLeaderId !== teamLeader.id;
                      return (
                        <label
                          key={s.id}
                          className={`team-config-item ${takenByOther ? "team-config-item--disabled" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={teamSalesIds.includes(s.id)}
                            disabled={takenByOther}
                            onChange={(e) => {
                              setTeamSalesIds((prev) =>
                                e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)
                              );
                            }}
                          />
                          <span>
                            {s.displayName} <span className="muted">({s.username})</span>
                            {takenByOther && s.assignedLeaderName && (
                              <span className="muted"> · 已歸屬 {s.assignedLeaderName}</span>
                            )}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
                <div className="team-config-actions">
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setTeamLeader(null)}>
                    取消
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" disabled={savingTeam} onClick={saveTeamConfig}>
                    {savingTeam ? "儲存中…" : "儲存團隊"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {messageBlock}
        </section>
      )}

      {section === "password" && (
        <section className="panel">
          <p className="panel-desc">更新後臺管理員登入密碼，修改後請使用新密碼登入。</p>
          <form className="admin-pwd-form" onSubmit={changeOwnPassword}>
            <label>
              當前密碼
              <input
                type="password"
                value={pwdForm.current}
                onChange={(e) => setPwdForm((s) => ({ ...s, current: e.target.value }))}
                required
              />
            </label>
            <label>
              新密碼
              <input
                type="password"
                value={pwdForm.next}
                onChange={(e) => setPwdForm((s) => ({ ...s, next: e.target.value }))}
                minLength={6}
                required
              />
            </label>
            <label>
              確認新密碼
              <input
                type="password"
                value={pwdForm.confirm}
                onChange={(e) => setPwdForm((s) => ({ ...s, confirm: e.target.value }))}
                minLength={6}
                required
              />
            </label>
            <button type="submit" className="btn btn-primary btn-sm" disabled={changingPwd}>
              {changingPwd ? "儲存中…" : "儲存密碼"}
            </button>
          </form>
          {messageBlock}
        </section>
      )}

      {section === "import" && (
        <section className="panel">
          <p className="panel-desc">
            支援<strong>{BRAND.dataSourceLabel}</strong>導出（含多工作表每週一頁），以及按銷售命名的檔案（自動歸屬銷售）。
          </p>
          <p className="panel-desc">
            <strong>代理訂單導出</strong>（檔名如 <code>export_acceptance_agent_order_list_…</code>）裡「下級代理商」均為
            <strong>自營商戶</strong>，系統無法自動識別銷售，請在下拉框指定（如 <code>Alex202604</code>）或將檔案重命名為{" "}
            <code>Alex202604-…</code>。
          </p>
          <p className="panel-desc">
            <strong>多天數據：</strong>首次選「全量替換」，之後每天選「追加導入」；可一次多選多個 xlsx 檔案。
          </p>

          <label className="form-field" style={{ maxWidth: 420, marginBottom: 16 }}>
            指定歸屬銷售（代理導出必填，須與銷售帳號一致）
            <select
              value={importSalesName}
              onChange={(e) => setImportSalesName(e.target.value)}
              disabled={uploading}
            >
              <option value="">— 不指定（僅檔名/表格含銷售名時自動）—</option>
              {users
                .filter((u) => u.role === "sales" && u.enabled)
                .map((u) => (
                  <option key={u.id} value={u.username}>
                    {u.display_name}（{u.username}）
                  </option>
                ))}
            </select>
          </label>

          <div className="import-options">
            <label className="import-option">
              <input
                type="radio"
                name="importMode"
                checked={importMode === "append"}
                onChange={() => setImportMode("append")}
              />
              <div className="import-option-text">
                <strong>追加導入</strong>
                <span>保留已有數據，跳過重複記錄</span>
              </div>
            </label>
            <label className="import-option import-option--highlight">
              <input
                type="radio"
                name="importMode"
                checked={importMode === "failuresOnly"}
                onChange={() => setImportMode("failuresOnly")}
              />
              <div className="import-option-text">
                <strong>僅補錄交易失敗</strong>
                <span>不重複導入成功交易；已導入過全量數據時用</span>
              </div>
            </label>
            <label className="import-option">
              <input
                type="radio"
                name="importMode"
                checked={importMode === "replace"}
                onChange={() => setImportMode("replace")}
              />
              <div className="import-option-text">
                <strong>全量替換</strong>
                <span>清空舊數據後導入，適合每次導出全量檔案</span>
              </div>
            </label>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xls,.xlsx"
            multiple
            hidden
            onChange={(e) => {
              const files = e.target.files;
              if (files?.length) upload(files);
            }}
          />

          <div className="upload-zone">
            <div className="upload-zone-icon">📂</div>
            <p>拖曳或點擊上傳 CSV / Excel 檔案，支援多選</p>
            <button
              type="button"
              className="btn btn-primary"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? "導入中…" : "選擇檔案上傳"}
            </button>
          </div>

          {uploadPhase !== "idle" && (
            <div className="upload-progress-wrap">
              <div className="upload-progress-head">
                <span>{phaseLabel}</span>
                <span className="upload-progress-pct">{uploadPercent}%</span>
              </div>
              {uploadFileLabel && <p className="upload-progress-file muted">{uploadFileLabel}</p>}
              <div
                className="upload-progress-bar"
                role="progressbar"
                aria-valuenow={uploadPercent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className={`upload-progress-fill ${
                    uploadPhase === "processing" || uploadPercent === 0
                      ? "upload-progress-fill--pulse"
                      : ""
                  }`}
                  style={{ width: `${Math.max(uploadPercent, uploadPhase === "idle" ? 0 : 4)}%` }}
                />
              </div>
            </div>
          )}

          <div className="panel-subsection" style={{ marginTop: 32 }}>
            <h3 className="panel-subtitle">導入商戶額度</h3>
            <p className="panel-desc">
              上傳支付後台導出的商戶額度表，按<strong>商戶編號</strong>匹配。支援智付、立得多等機構導出格式（含「單筆/單日/單月限額」列）——
              系統以<strong>單月限額</strong>作為本月額度上限，與商戶列表「本月截至昨日」交易額計算使用百分比。
            </p>
            <p className="panel-desc muted">
              智付與立得多商戶在同一池，各機構各有一份刷卡、一份掃碼額度表（共 4 個 xlsx）。請用「上傳刷卡額度表」多選兩份刷卡檔（如
              <code>SMARTPAY SOLUTIONS LIMITED.xlsx</code>、<code>立得多碼合一國際有限公司.xlsx</code>）、「上傳掃碼額度表」多選兩份掃碼檔（檔名須含
              <strong>扫码</strong>，如 <code>扫码额度：…</code>）。
              系統按<strong>商戶編號去重</strong>：同一商戶重複導入時<strong>覆蓋更新</strong>額度，不會累加；刷卡與掃碼分開更新，互不覆蓋。
              <strong>切勿把掃碼檔傳到刷卡按鈕</strong>，否則單月限額會顯示錯誤（例如刷卡應為 400 萬卻變成 30 萬）。
            </p>
            {limitStats && (
              <p className="panel-desc muted">
                已導入刷卡額度 {limitStats.cardLimitCount} 家
                {limitStats.scanLimitCount > 0 ? `、掃碼額度 ${limitStats.scanLimitCount} 家` : ""}
                {limitStats.lastImportedAt
                  ? ` · 最近更新 ${new Date(limitStats.lastImportedAt).toLocaleString("zh-HK")}`
                  : ""}
              </p>
            )}
            <input
              ref={limitFileRef}
              type="file"
              accept=".csv,.xls,.xlsx"
              multiple
              hidden
              onChange={(e) => {
                const files = e.target.files;
                if (files?.length) uploadLimits(files, limitUploadKind);
              }}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={uploadingLimits}
                onClick={() => {
                  setLimitUploadKind("card");
                  limitFileRef.current?.click();
                }}
              >
                {uploadingLimits && limitUploadKind === "card" ? "導入中…" : "上傳刷卡額度表"}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={uploadingLimits}
                onClick={() => {
                  setLimitUploadKind("scan");
                  limitFileRef.current?.click();
                }}
              >
                {uploadingLimits && limitUploadKind === "scan" ? "導入中…" : "上傳掃碼額度表"}
              </button>
            </div>
          </div>

          {importBatches.some((b) => b.unassigned_merchants > 0) && (
            <div className="panel-subsection" style={{ marginTop: 24 }}>
              <h3 className="panel-subtitle">待補銷售歸屬的導入批次</h3>
              <p className="panel-desc muted">
                以下批次中有商戶尚未寫入銷售名（常見於代理訂單導出）。選擇對應銷售後點「補歸屬」即可，無需重新導入。
              </p>
              <div className="table-wrap">
                <table className="data-table data-table--compact">
                  <thead>
                    <tr>
                      <th>檔案</th>
                      <th>導入時間</th>
                      <th>未歸屬商戶</th>
                      <th>指定銷售</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {importBatches
                      .filter((b) => b.unassigned_merchants > 0)
                      .map((b) => (
                        <BatchAssignRow
                          key={b.id}
                          batch={b}
                          salesUsers={users.filter((u) => u.role === "sales" && u.enabled)}
                          defaultSalesName={importSalesName}
                          assigning={assigningBatchId === b.id}
                          onAssign={assignBatchSales}
                        />
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {messageBlock}
        </section>
      )}

      {section === "rules" && (
        <section className="panel">
          <p className="panel-desc">
            當商戶交易額<strong>週環比或月環比</strong>下降超過設定比例時觸發預警（不含日維度）。
          </p>
          <div className="rules-grid">
            {rules.map((r) => (
              <RuleEditor key={r.period} rule={r} onSave={saveRule} />
            ))}
            <form className="rule-card" onSubmit={saveDailyDeclineThreshold}>
              <h3>下跌中判定（日均環比）</h3>
              <p className="panel-desc panel-desc-tight">
                管理者看板中，商戶本月日均較上月日均下降超過此比例時標記為「下跌中」。
              </p>
              <label>
                下降閾值 (%)
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={dailyDeclineThreshold}
                  onChange={(e) => setDailyDeclineThreshold(e.target.value)}
                />
              </label>
              <button type="submit" className="btn btn-primary btn-sm">
                儲存
              </button>
            </form>
            <form className="rule-card" onSubmit={saveMastercardHighlightThreshold}>
              <h3>萬事達累計標黃（預警）</h3>
              <p className="panel-desc panel-desc-tight">
                「萬事達排名」頁中，商戶歷史 Mastercard 累計交易額達此金額及以上時以黃色預警標示。
              </p>
              <label>
                標黃閾值（萬港幣）
                <input
                  type="number"
                  min={1}
                  max={9999}
                  step={1}
                  value={mastercardHighlightWan}
                  onChange={(e) => setMastercardHighlightWan(e.target.value)}
                />
              </label>
              <button type="submit" className="btn btn-primary btn-sm">
                儲存
              </button>
            </form>
            <form className="rule-card" onSubmit={saveMastercardAlertThreshold}>
              <h3>萬事達累計標紅</h3>
              <p className="panel-desc panel-desc-tight">
                累計達此金額及以上時改以紅色標示（須高於標黃閾值）。
              </p>
              <label>
                標紅閾值（萬港幣）
                <input
                  type="number"
                  min={1}
                  max={9999}
                  step={1}
                  value={mastercardAlertWan}
                  onChange={(e) => setMastercardAlertWan(e.target.value)}
                />
              </label>
              <button type="submit" className="btn btn-primary btn-sm">
                儲存
              </button>
            </form>
          </div>
          {messageBlock}
        </section>
      )}

      {section === "developer" && <DeveloperViewPanel />}
    </AppShell>
  );
}

function BatchAssignRow({
  batch,
  salesUsers,
  defaultSalesName,
  assigning,
  onAssign,
}: {
  batch: {
    id: number;
    filename: string;
    imported_at: string;
    unassigned_merchants: number;
  };
  salesUsers: AppUser[];
  defaultSalesName: string;
  assigning: boolean;
  onAssign: (batchId: number, salesName: string) => void;
}) {
  const [salesName, setSalesName] = useState(defaultSalesName);

  return (
    <tr>
      <td className="truncate" title={batch.filename}>
        {batch.filename}
      </td>
      <td>{batch.imported_at.replace("T", " ").slice(0, 16)}</td>
      <td>{batch.unassigned_merchants} 家</td>
      <td>
        <select value={salesName} onChange={(e) => setSalesName(e.target.value)} disabled={assigning}>
          <option value="">— 選擇 —</option>
          {salesUsers.map((u) => (
            <option key={u.id} value={u.username}>
              {u.display_name}（{u.username}）
            </option>
          ))}
        </select>
      </td>
      <td>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={assigning || !salesName}
          onClick={() => onAssign(batch.id, salesName)}
        >
          {assigning ? "處理中…" : "補歸屬"}
        </button>
      </td>
    </tr>
  );
}

function RuleEditor({
  rule,
  onSave,
}: {
  rule: AlertRule;
  onSave: (p: "week" | "month", v: number) => void;
}) {
  const [val, setVal] = useState(String(rule.threshold_percent));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave(rule.period, Number(val));
  };

  return (
    <form className="rule-card" onSubmit={submit}>
      <h3>{PERIOD_LABEL[rule.period]}環比預警</h3>
      <label>
        下降閥值 (%)
        <input type="number" min={1} max={99} value={val} onChange={(e) => setVal(e.target.value)} />
      </label>
      <button type="submit" className="btn btn-primary btn-sm">
        儲存並重算
      </button>
    </form>
  );
}
