import { FormEvent, useEffect, useState } from "react";
import { LOGIN_NOTICE_KEY } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { SiteLegalFooter } from "@/components/SiteLegalFooter";
import { BRAND } from "@/config/branding";

interface PublicConfig {
  appTitle: string;
  siteSlug: string;
  publicSiteUrl: string | null;
}

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [config, setConfig] = useState<PublicConfig | null>(null);

  useEffect(() => {
    const reloginMsg = sessionStorage.getItem(LOGIN_NOTICE_KEY);
    if (reloginMsg) {
      setNotice(reloginMsg);
      sessionStorage.removeItem(LOGIN_NOTICE_KEY);
    }
    fetch("/api/health")
      .then((r) => setBackendOk(r.ok))
      .catch(() => setBackendOk(false));
    fetch("/api/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => null);
  }, []);

  const siteSlug = config?.siteSlug ?? BRAND.siteSlug;
  const accessUrl =
    config?.publicSiteUrl ??
    (typeof window !== "undefined" ? window.location.origin : "");

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "登入失敗";
      if (msg.includes("404")) {
        setError("介面未啟動，請聯繫管理員檢查伺服器。");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <aside className="login-hero" aria-label="品牌介紹">
        <div className="login-hero-card">
          <div className="login-hero-card__content">
            <div className="login-hero-card__top">
              <p>{siteSlug.toUpperCase()}</p>
              <p className="login-hero-card__title login-hero-card__tagline">
                <span>NO PROBLEM,</span>
                <span>NO BUSINESS!</span>
              </p>
            </div>
            <div className="login-hero-card__bottom">
              <p className="login-hero-card__title">MERCHANT TRANSACTION</p>
              <p>LET&apos;S DANCE!</p>
            </div>
          </div>
          <div className="login-hero-card__image" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round">
              <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" />
            </svg>
          </div>
        </div>
      </aside>

      <div className="login-panel">
        <div className="login-card login-card--neo">
          <div className="login-card__face">
            <h2 className="login-card__title">Welcome back</h2>
            <p className="login-card__subtitle">登入您的帳號以繼續</p>
            {accessUrl && (
              <p className="login-access-url">
                訪問地址：<strong>{accessUrl}</strong>
              </p>
            )}

            {backendOk === false && (
              <p className="form-error backend-warn login-card__message">後端未連接，請稍後重試或聯繫管理員。</p>
            )}

            {notice && <p className="form-success login-notice login-card__message">{notice}</p>}

            <form className="login-card__form" onSubmit={onSubmit}>
              <div className="login-card__field">
                <label htmlFor="username">用戶名</label>
                <input
                  id="username"
                  className="login-card__input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="請輸入用戶名"
                  autoComplete="username"
                  required
                />
              </div>
              <div className="login-card__field">
                <label htmlFor="password">密碼</label>
                <input
                  id="password"
                  className="login-card__input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="請輸入密碼"
                  autoComplete="current-password"
                  required
                />
              </div>
              {error && <p className="form-error login-card__message">{error}</p>}
              <button
                type="submit"
                className="login-card__btn"
                disabled={loading || backendOk === false}
              >
                {loading ? "登入中…" : "登入"}
              </button>
            </form>

            <p className="login-greeting">{BRAND.loginFooterGreeting}</p>
          </div>
        </div>
      </div>

      <SiteLegalFooter className="login-page__legal" />
    </div>
  );
}
