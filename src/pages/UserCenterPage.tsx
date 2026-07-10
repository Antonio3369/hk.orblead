import { FormEvent, useEffect, useState } from "react";
import { api, stashLoginNotice } from "@/api/client";
import { AppShell } from "@/components/AppShell";
import { PageLoader } from "@/components/PageLoader";
import { useAuth } from "@/context/AuthContext";

const ROLE_LABEL: Record<string, string> = {
  admin: "管理員",
  leader: "主管",
  sales: "銷售",
};

interface UserCenterPageProps {
  onBack: () => void;
}

export function UserCenterPage({ onBack }: UserCenterPageProps) {
  const { user, logout } = useAuth();
  const [email, setEmail] = useState("");
  const [profileLoading, setProfileLoading] = useState(true);
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailMsg, setEmailMsg] = useState("");
  const [pwdForm, setPwdForm] = useState({ current: "", next: "", confirm: "" });
  const [changingPwd, setChangingPwd] = useState(false);
  const [pwdMsg, setPwdMsg] = useState("");

  useEffect(() => {
    setProfileLoading(true);
    api<{ user: { email?: string | null } }>("/auth/me")
      .then((r) => setEmail(r.user.email ?? ""))
      .finally(() => setProfileLoading(false));
  }, []);

  const saveEmail = async (e: FormEvent) => {
    e.preventDefault();
    setSavingEmail(true);
    setEmailMsg("");
    try {
      await api("/auth/me", {
        method: "PUT",
        json: { email: email.trim() || null },
      });
      setEmailMsg("郵箱已儲存");
    } catch (err) {
      setEmailMsg(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setSavingEmail(false);
    }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwdMsg("");
    if (pwdForm.next !== pwdForm.confirm) {
      setPwdMsg("兩次輸入的新密碼不一致");
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
      setPwdMsg(err instanceof Error ? err.message : "修改失敗");
    } finally {
      setChangingPwd(false);
    }
  };

  return (
    <AppShell title="用戶中心" subtitle="個人資料與帳號安全" onBack={onBack}>
      <section className="panel">
        <h2 className="panel-title">個人信息</h2>
        {profileLoading ? (
          <PageLoader block />
        ) : (
          <dl className="profile-dl">
            <div>
              <dt>顯示名</dt>
              <dd>{user?.displayName}</dd>
            </div>
            <div>
              <dt>登入用戶名</dt>
              <dd>{user?.username}</dd>
            </div>
            <div>
              <dt>角色</dt>
              <dd>{ROLE_LABEL[user?.role ?? "sales"] ?? user?.role}</dd>
            </div>
          </dl>
        )}
        <p className="panel-desc muted">
          顯示名須與支付導出數據中的銷售名一致，如需修改請聯繫管理員。
        </p>
        <form className="user-center-form" onSubmit={saveEmail}>
          <label>
            工作郵箱
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="用於後續郵件提醒（可選）"
            />
          </label>
          <button type="submit" className="btn btn-primary btn-sm" disabled={savingEmail}>
            {savingEmail ? "儲存中…" : "儲存郵箱"}
          </button>
          {emailMsg && <p className={emailMsg.includes("失敗") ? "form-error" : "form-success"}>{emailMsg}</p>}
        </form>
      </section>

      <section className="panel">
        <h2 className="panel-title">修改密碼</h2>
        <form className="user-center-form" onSubmit={changePassword}>
          <label>
            當前密碼
            <input
              type="password"
              value={pwdForm.current}
              onChange={(e) => setPwdForm((s) => ({ ...s, current: e.target.value }))}
              autoComplete="current-password"
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
              autoComplete="new-password"
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
              autoComplete="new-password"
              required
            />
          </label>
          <button type="submit" className="btn btn-primary btn-sm" disabled={changingPwd}>
            {changingPwd ? "儲存中…" : "更新密碼"}
          </button>
          {pwdMsg && (
            <p className={pwdMsg.includes("失敗") || pwdMsg.includes("不一致") ? "form-error" : "form-success"}>
              {pwdMsg}
            </p>
          )}
        </form>
      </section>
    </AppShell>
  );
}
