import { useEffect, useMemo, useState } from "react";
import { api, getToken } from "@/api/client";
import { AppShell } from "@/components/AppShell";
import { NeoButton } from "@/components/NeoButton";
import { PageLoader } from "@/components/PageLoader";
import { useAuth } from "@/context/AuthContext";
import { matchedBank, pickUniqueBank, searchSettlementBanks, type HkiclBank } from "@/data/hkiclBanks";

type Payload = Record<string, string>;

interface ApplicationRecord {
  id: number;
  ownerUserId: number;
  ownerName: string;
  legalName: string;
  payload: Payload;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
}

const CHOICES: { key: string; label: string; options: { value: string; label: string }[] }[] = [
  {
    key: "lang",
    label: "語言偏好",
    options: [
      { value: "繁體中文 Traditional Chinese", label: "繁體中文" },
      { value: "英文 English", label: "英文" },
    ],
  },
  {
    key: "ownership",
    label: "所有權類型",
    options: [
      { value: "Sole Proprietor 獨資經營者", label: "獨資經營者" },
      { value: "Partnership 合夥", label: "合夥" },
      { value: "Company Limited 有限公司", label: "有限公司" },
      { value: "Other 其他", label: "其他" },
    ],
  },
  {
    key: "years",
    label: "經營店鋪年期",
    options: [
      { value: "Less than 1 year 1年以下", label: "1年以下" },
      { value: "1-3 years 1-3年", label: "1–3年" },
      { value: "More than 3 years 3年以上", label: "3年以上" },
    ],
  },
];

type RateCell = { key: string } | { text: string };

const CARD_HEADERS = ["支付方式", "本地卡（境內卡）", "境外卡", "中小型商戶計劃 SME"];
const WALLET_HEADERS = ["支付方式", "線上／線下", "香港錢包", "大陸錢包"];

const RATE_GROUPS: { title: string; headers: string[]; rows: { name: string; cells: RateCell[] }[] }[] = [
  {
    title: "線下持卡 Card-present（CP）",
    headers: CARD_HEADERS,
    rows: [
      { name: "Visa", cells: [{ key: "cpVisaDom" }, { key: "cpVisaFor" }, { key: "cpVisaSme" }] },
      { name: "MasterCard 萬事達", cells: [{ key: "cpMcDom" }, { key: "cpMcFor" }, { key: "cpMcSme" }] },
      { name: "AMEX 美國運通", cells: [{ key: "cpAmexDom" }, { key: "cpAmexFor" }, { text: "不適用" }] },
      { name: "銀聯", cells: [{ key: "cpUpDom" }, { text: "不適用" }, { text: "不適用" }] },
    ],
  },
  {
    title: "線上掃碼 Card-not-present（CNP）",
    headers: CARD_HEADERS,
    rows: [
      { name: "Visa", cells: [{ key: "cnpVisaDom" }, { key: "cnpVisaFor" }, { text: "不適用" }] },
      { name: "MasterCard 萬事達", cells: [{ key: "cnpMcDom" }, { key: "cnpMcFor" }, { text: "不適用" }] },
      { name: "AMEX 美國運通", cells: [{ key: "cnpAmexDom" }, { key: "cnpAmexFor" }, { text: "不適用" }] },
    ],
  },
  {
    title: "電子錢包 Digital Wallet",
    headers: WALLET_HEADERS,
    rows: [
      { name: "支付寶", cells: [{ text: "線下" }, { key: "alipayOffHk" }, { key: "alipayOffCn" }] },
      { name: "支付寶", cells: [{ text: "線上" }, { key: "alipayOn" }, { text: "不適用" }] },
      { name: "微信", cells: [{ text: "線下" }, { key: "wxOffHk" }, { key: "wxOffCn" }] },
      { name: "微信", cells: [{ text: "線上" }, { key: "wxOn" }, { text: "不適用" }] },
      { name: "八達通", cells: [{ text: "線下" }, { key: "octOffHk" }, { text: "不適用" }] },
      { name: "八達通", cells: [{ text: "線上" }, { key: "octOn" }, { text: "不適用" }] },
    ],
  },
];

function blankPayload(salesName: string): Payload {
  const payload: Payload = { lang: "繁體中文 Traditional Chinese", sales: salesName };
  return payload;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("zh-HK", { hour12: false });
}

async function downloadPdf(id: number, legalName: string) {
  const token = getToken();
  const res = await fetch(`/api/merchant-applications/${id}/pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "PDF 生成失敗");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `YeahPay_商戶申請表及合約_${legalName || "merchant"}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}

export function MerchantApplicationPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<ApplicationRecord[]>([]);
  const [editing, setEditing] = useState<ApplicationRecord | "new" | null>(null);
  const [payload, setPayload] = useState<Payload>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [bankOpen, setBankOpen] = useState<"name" | "code" | null>(null);

  const load = () => {
    setLoading(true);
    return api<{ applications: ApplicationRecord[] }>("/merchant-applications")
      .then((res) => setRecords(res.applications))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void load();
  }, []);

  const openNew = () => {
    setEditing("new");
    setPayload(blankPayload(user?.displayName ?? ""));
    setMessage("");
    setError("");
  };

  const openRecord = (record: ApplicationRecord) => {
    setEditing(record);
    setPayload({ ...record.payload });
    setMessage("");
    setError("");
  };

  const setField = (key: string, value: string) => {
    setPayload((current) => ({ ...current, [key]: value }));
  };

  const save = async (alsoPdf: boolean) => {
    setMessage("");
    setError("");
    const account = (payload.bankAccount ?? "").replace(/\D/g, "");
    if (account && account.length < 9) {
      setError("銀行帳號不得少於 9 位數");
      return;
    }
    setSaving(true);
    try {
      const path =
        editing && editing !== "new"
          ? `/merchant-applications/${editing.id}`
          : "/merchant-applications";
      const method = editing && editing !== "new" ? "PUT" : "POST";
      const res = await api<{ application: ApplicationRecord }>(path, {
        method,
        json: { payload },
      });
      setEditing(res.application);
      setPayload({ ...res.application.payload });
      setMessage(alsoPdf ? "已儲存，正在生成 PDF…" : "已儲存，之後可以再打開修改");
      const tasks: Promise<unknown>[] = [load()];
      if (alsoPdf) tasks.push(downloadPdf(res.application.id, res.application.legalName));
      await Promise.all(tasks);
      if (alsoPdf) setMessage("已儲存，PDF 已開始下載");
    } catch (err) {
      setError(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setMessage("");
    setError("");
    if (editing && editing !== "new") setPayload({ ...editing.payload });
    else setPayload(blankPayload(user?.displayName ?? ""));
  };

  const readOnly = editing !== "new" && editing != null && !editing.canEdit;
  const showOwner = user?.role !== "sales";
  const bankQuery = bankOpen === "code" ? (payload.bankCode ?? "") : (payload.bankName ?? "");
  const bankHits = useMemo(() => searchSettlementBanks(bankQuery, 12), [bankQuery]);
  const selectedBank = matchedBank(payload.bankName ?? "", payload.bankCode ?? "");

  const applyBank = (bank: HkiclBank) => {
    setPayload((current) => ({ ...current, bankName: bank.zh, bankCode: bank.code }));
    setBankOpen(null);
  };

  const onBankNameChange = (value: string) => {
    setPayload((current) => {
      const previous = current.bankName ?? "";
      const linked = matchedBank(previous, current.bankCode ?? "");
      const shrinking = value.length < previous.length;
      if (shrinking) {
        return { ...current, bankName: value, bankCode: linked ? "" : current.bankCode };
      }
      const unique = pickUniqueBank(value);
      if (unique) return { ...current, bankName: unique.zh, bankCode: unique.code };
      return { ...current, bankName: value, bankCode: linked && value !== linked.zh ? "" : current.bankCode };
    });
    setBankOpen("name");
  };

  const onBankCodeChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 3);
    setPayload((current) => {
      const previous = current.bankCode ?? "";
      const linked = matchedBank(current.bankName ?? "", previous);
      const shrinking = digits.length < previous.length;
      if (shrinking) {
        return { ...current, bankCode: digits, bankName: linked ? "" : current.bankName };
      }
      const unique = pickUniqueBank(digits);
      if (unique) return { ...current, bankName: unique.zh, bankCode: unique.code };
      return { ...current, bankCode: digits, bankName: linked ? "" : current.bankName };
    });
    setBankOpen("code");
  };

  const bankSuggest = bankOpen && !readOnly && bankHits.length > 0 && (
    <ul className="merchant-app-suggest" role="listbox">
      {bankHits.map((bank) => (
        <li key={bank.code}>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => applyBank(bank)}>
            <strong>
              {bank.code} {bank.zh}
            </strong>
            <span>{bank.en}</span>
          </button>
        </li>
      ))}
    </ul>
  );

  const input = (key: string, extra?: { type?: string; placeholder?: string; inputMode?: "decimal" | "numeric" | "tel" | "email" }) => (
    <input
      type={extra?.type ?? "text"}
      inputMode={extra?.inputMode}
      placeholder={extra?.placeholder}
      value={payload[key] ?? ""}
      disabled={readOnly}
      onChange={(event) => setField(key, event.target.value)}
    />
  );

  if (loading && editing == null) return <PageLoader />;

  if (editing == null) {
    return (
      <AppShell
        title="商戶申請表"
        subtitle="提交後留在這裡，可以再打開修改，並重新生成 PDF"
        actions={
          <NeoButton size="sm" onClick={openNew}>
            新申請
          </NeoButton>
        }
      >
        {error && <p className="form-error">{error}</p>}
        {records.length === 0 ? (
          <section className="panel">
            <p className="panel-desc">還沒有申請。點「新申請」填寫商戶資料。</p>
          </section>
        ) : (
          <ul className="merchant-app-list">
            {records.map((record) => (
              <li key={record.id} className="merchant-app-row">
                <div>
                  <strong>{record.legalName || "未命名商戶"}</strong>
                  <p>
                    {showOwner ? `${record.ownerName} · ` : ""}
                    {formatWhen(record.updatedAt)}
                  </p>
                </div>
                <div className="merchant-app-row__actions">
                  <NeoButton size="xs" onClick={() => openRecord(record)}>
                    {record.canEdit ? "修改" : "查看"}
                  </NeoButton>
                  <NeoButton
                    size="xs"
                    onClick={() => {
                      setError("");
                      downloadPdf(record.id, record.legalName).catch((err: Error) => setError(err.message));
                    }}
                  >
                    下載 PDF
                  </NeoButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AppShell>
    );
  }

  return (
    <div className="merchant-app-sheet">
      <header className="merchant-app-banner">
        <div className="merchant-app-logo">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M4 16 12 4l8 12H4Z" fill="currentColor" />
            <path d="M8 20h8l-4-6-4 6Z" fill="currentColor" opacity="0.85" />
          </svg>
          <strong>YeahPay</strong>
        </div>
        <div className="merchant-app-version">V20250311</div>
        <h1>商戶申請表及合約</h1>
        <p>Aile Technology Limited — Merchant Application &amp; Agreement</p>
      </header>

      <form
        className="merchant-app-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save(true);
        }}
      >
        <section className="merchant-app-card">
          <h2>商戶資料 Merchant Information</h2>
          <div className="merchant-app-field">
            <label>
              商戶名稱（Legal/Registered Name）<span className="merchant-app-req">*</span>
            </label>
            {input("legalName", { placeholder: "商業登記證上的商戶全名" })}
          </div>
          <div className="merchant-app-field">
            <label>商戶營業名稱（Doing Business-As Name）</label>
            {input("dbaName", { placeholder: "門店招牌名，與上同可不填" })}
          </div>
          <div className="merchant-app-field">
            <label>語言偏好 Language Preference</label>
            <div className="merchant-app-pills">
              {CHOICES[0].options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={payload.lang === option.value ? "is-on" : ""}
                  disabled={readOnly}
                  onClick={() => setField("lang", option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="merchant-app-note">
              {payload.lang?.includes("英文")
                ? "生成 PDF 時，第一頁會勾選 English。本頁填表仍用繁體中文，不會整頁切換語言。"
                : "生成 PDF 時，第一頁會勾選 Traditional Chinese。本頁填表仍用繁體中文，不會整頁切換語言。"}
            </p>
          </div>
          <div className="merchant-app-split merchant-app-split--3">
            <div className="merchant-app-field">
              <label>
                聯絡人 Contact Person<span className="merchant-app-req">*</span>
              </label>
              {input("contact")}
            </div>
            <div className="merchant-app-field">
              <label>職銜 Title</label>
              {input("title")}
            </div>
            <div className="merchant-app-field">
              <label>MCC</label>
              {input("mcc", { inputMode: "numeric" })}
            </div>
          </div>
          <div className="merchant-app-field">
            <label>
              電話號碼 Telephone No.<span className="merchant-app-req">*</span>
            </label>
            {input("phone", { type: "tel", inputMode: "tel" })}
          </div>
          <div className="merchant-app-field">
            <label>
              電郵 Email<span className="merchant-app-req">*</span>
            </label>
            {input("email", { type: "email", inputMode: "email" })}
          </div>
          <div className="merchant-app-field">
            <label>銷售 Sales</label>
            {input("sales", { placeholder: "負責跟進的銷售姓名" })}
          </div>
          <div className="merchant-app-field">
            <label>
              營業地址 Business Address<span className="merchant-app-req">*</span>
            </label>
            <textarea
              value={payload.bizAddr ?? ""}
              disabled={readOnly}
              rows={2}
              onChange={(event) => setField("bizAddr", event.target.value)}
            />
          </div>
          <div className="merchant-app-field">
            <label>
              辦公室地址 Office Address
              <span className="merchant-app-en">（銀行戶口證明地址與 BR 不一致時填寫）</span>
            </label>
            <textarea
              value={payload.officeAddr ?? ""}
              disabled={readOnly}
              rows={2}
              placeholder="地址 + 原因"
              onChange={(event) => setField("officeAddr", event.target.value)}
            />
          </div>
        </section>

        <section className="merchant-app-card">
          <h2>交易資料 Transaction</h2>
          <div className="merchant-app-split">
            <div className="merchant-app-field">
              <label>
                單筆交易最大金額(HKD)<span className="merchant-app-req">*</span>
              </label>
              {input("maxTicket", { inputMode: "decimal" })}
            </div>
            <div className="merchant-app-field">
              <label>
                平均每筆交易金額(HKD)<span className="merchant-app-req">*</span>
              </label>
              {input("avgTicket", { inputMode: "decimal" })}
            </div>
          </div>
          <div className="merchant-app-field">
            <label>
              平均每月交易金額(HKD)<span className="merchant-app-req">*</span>
            </label>
            {input("avgMonthly", { inputMode: "decimal" })}
          </div>
          <p className="merchant-app-note">
            請如實填寫。金額過大，審核時間可能會延長；金額過小，則可能會導致交易額度不夠。
          </p>
        </section>

        <section className="merchant-app-card">
          <h2>結算銀行帳戶 Bank Information</h2>
          <div className="merchant-app-field merchant-app-bank">
            <label>
              銀行名稱 Bank Name<span className="merchant-app-req">*</span>
            </label>
            <div className="merchant-app-bank-line">
              <input
                type="text"
                autoComplete="off"
                value={payload.bankName ?? ""}
                disabled={readOnly}
                placeholder="輸入中文、英文或編號，例如 中銀 / 012"
                onFocus={() => setBankOpen("name")}
                onBlur={() => window.setTimeout(() => setBankOpen((open) => (open === "name" ? null : open)), 180)}
                onChange={(event) => onBankNameChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing || event.key !== "Backspace") return;
                  const el = event.currentTarget;
                  const start = el.selectionStart ?? 0;
                  const end = el.selectionEnd ?? 0;
                  if (start === 0 && end === 0) return;
                  event.preventDefault();
                  const next =
                    start === end
                      ? el.value.slice(0, start - 1) + el.value.slice(end)
                      : el.value.slice(0, start) + el.value.slice(end);
                  const caret = start === end ? Math.max(0, start - 1) : start;
                  onBankNameChange(next);
                  requestAnimationFrame(() => {
                    el.setSelectionRange(caret, caret);
                  });
                }}
              />
            </div>
            {selectedBank && selectedBank.en !== selectedBank.zh && (
              <p className="merchant-app-bank-en">{selectedBank.en}</p>
            )}
            {bankOpen === "name" ? bankSuggest : null}
          </div>
          <div className="merchant-app-field merchant-app-bank">
            <label>
              銀行代碼 Bank Code<span className="merchant-app-req">*</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={payload.bankCode ?? ""}
              disabled={readOnly}
              placeholder="輸入 012 會自動帶出銀行名稱"
              onFocus={() => setBankOpen("code")}
              onBlur={() => window.setTimeout(() => setBankOpen((open) => (open === "code" ? null : open)), 180)}
              onChange={(event) => onBankCodeChange(event.target.value)}
            />
            {bankOpen === "code" ? bankSuggest : null}
          </div>
          <div className="merchant-app-field">
            <label>
              銀行賬戶名稱 Bank Account Name<span className="merchant-app-req">*</span>
            </label>
            {input("bankAccName")}
          </div>
          <div className="merchant-app-field">
            <label>
              銀行帳號 Bank Account Number<span className="merchant-app-req">*</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              minLength={9}
              value={payload.bankAccount ?? ""}
              disabled={readOnly}
              placeholder="不少於 9 位數字"
              onChange={(event) => setField("bankAccount", event.target.value.replace(/\D/g, ""))}
            />
            {payload.bankAccount && payload.bankAccount.replace(/\D/g, "").length < 9 && (
              <p className="form-error">銀行帳號不得少於 9 位數</p>
            )}
          </div>
        </section>

        <section className="merchant-app-card">
          <h2>商戶類型及登記</h2>
          {CHOICES.filter((choice) => choice.key !== "lang").map((choice) => (
            <div key={choice.key} className="merchant-app-field">
              <label>{choice.label}</label>
              <div className="merchant-app-pills">
                {choice.options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={payload[choice.key] === option.value ? "is-on" : ""}
                    disabled={readOnly}
                    onClick={() => setField(choice.key, option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="merchant-app-split">
            <div className="merchant-app-field">
              <label>
                商業登記號碼 BR No.<span className="merchant-app-req">*</span>
              </label>
              {input("brNo")}
            </div>
            <div className="merchant-app-field">
              <label>商業登記到期日 BR Expiry</label>
              {input("brExpiry", { placeholder: "YYYY/MM/DD" })}
            </div>
          </div>
        </section>

        <section className="merchant-app-card">
          <h2>商戶優惠費率 MDR</h2>
          {RATE_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="merchant-app-rate-title">{group.title}</div>
              <div className="merchant-app-rate-head">
                {group.headers.map((header) => (
                  <span key={header}>{header}</span>
                ))}
              </div>
              {group.rows.map((row, rowIndex) => (
                <div key={`${row.name}-${rowIndex}`} className="merchant-app-rate-row">
                  <span>{row.name}</span>
                  {row.cells.map((cell, index) =>
                    "key" in cell ? (
                      <label key={cell.key} className="merchant-app-rate-cell">
                        <input
                          value={payload[cell.key] ?? ""}
                          disabled={readOnly}
                          inputMode="decimal"
                          aria-label={`${row.name} ${group.headers[index + 1]}`}
                          onChange={(event) => setField(cell.key, event.target.value.replace(/%/g, ""))}
                        />
                        <span aria-hidden="true">%</span>
                      </label>
                    ) : (
                      <span key={`${row.name}-${rowIndex}-${index}`} className="merchant-app-na">
                        {cell.text}
                      </span>
                    )
                  )}
                </div>
              ))}
            </div>
          ))}
          <p className="merchant-app-note">框裡只填數字，例如 1.8，不要填 %。PDF 上原有的 % 會自動對上；留空則該格空白。</p>
          <div className="merchant-app-rate-title">開戶費 Activation Fee</div>
          <div className="merchant-app-field">
            <label>金額 Amount（HKD）</label>
            {input("activationFee", { inputMode: "decimal", placeholder: "如 500" })}
          </div>
          <p className="merchant-app-note">由終端機送達日期起計 24 個月內，如總交易額滿 HK$500,000，AILE 將返還開戶費。</p>
          <div className="merchant-app-rate-title">服務費 Service Fee（以商戶後台系統為準，無需填寫）</div>
          <p className="merchant-app-note">
            Gateway fee（包含防詐騙服務和 3DS）網關費 · Dispute fee 拒付手續費 · Refund Fee 退款手續費 — 相關收費標準以商戶後台系統所列載內容為準。
          </p>
        </section>

        {message && <p className="form-success">{message}</p>}
        {error && <p className="form-error">{error}</p>}

        <div className="merchant-app-bar">
          <button
            type="button"
            className="merchant-app-btn merchant-app-btn--ghost"
            onClick={() => {
              setEditing(null);
              setMessage("");
              setError("");
            }}
          >
            返回記錄
          </button>
          {!readOnly && (
            <>
              <button type="button" className="merchant-app-btn merchant-app-btn--ghost" onClick={resetForm} disabled={saving}>
                重置
              </button>
              <button type="submit" className="merchant-app-btn merchant-app-btn--primary" disabled={saving}>
                {saving ? "正在生成…" : "生成 PDF"}
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
