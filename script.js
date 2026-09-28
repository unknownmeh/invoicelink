/* ==========================================================================
   Invoice Link — Dashboard Script
   Vanilla JS only. No frameworks, no build step.
   ========================================================================== */

/* Public configuration only. Never place secrets here. */
const CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbyOiIoFltcl5PeaCTI5nNxFdUTY6X_aiPdOyytoQ_7DCXQsk9iRJIqCrq6R4OcUw2ZMYw/exec"
};

const ADMIN_ACTIONS = new Set(["adminCheck", "adminLogout", "listInvoices", "listPayments", "createInvoice", "verifyPayment", "rejectPayment"]);
const ADMIN_SESSION_KEY = "invoiceLink.adminSessionToken";
let adminSessionToken = sessionStorage.getItem(ADMIN_SESSION_KEY) || "";
let dashboardInitialized = false;

const STORAGE_KEYS = {
  settings: "invoiceLink.settings",
  demoInvoices: "invoiceLink.demoInvoices",
  demoPayments: "invoiceLink.demoPayments"
};

/* --------------------------------------------------------------------------
   Backend selection
   The dashboard works two ways:
   1. A real Google Apps Script Web App URL is configured -> all reads and
      writes go through that endpoint (see apps-script/Code.gs).
   2. No URL is configured yet -> a local demo backend keeps sample data in
      this browser only, so the UI can be explored before wiring a backend.
      Nothing here is sensitive; it is throwaway demo data, not invoice
      records used in production.
   -------------------------------------------------------------------------- */

function isBackendConfigured() {
  const url = getScriptUrl();
  return !!url && url !== "YOUR_PUBLIC_APPS_SCRIPT_WEB_APP_URL" && url.startsWith("http");
}

function getScriptUrl() {
  return getSettings().scriptUrl || CONFIG.APPS_SCRIPT_URL;
}

async function callBackend(action, payload, method) {
  method = method || "POST";
  const url = getScriptUrl();
  if (method === "GET") {
    const params = new URLSearchParams(Object.assign({ action: action }, payload || {}));
    const res = await fetch(url + "?" + params.toString(), { method: "GET" });
    return res.json();
  }
  const requestBody = Object.assign({ action: action }, payload || {});
  if (ADMIN_ACTIONS.has(action)) requestBody.sessionToken = adminSessionToken;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoids CORS preflight on Apps Script
    body: JSON.stringify(requestBody)
  });
  const result = await res.json();
  if (ADMIN_ACTIONS.has(action) && action !== "adminCheck" && result.error === "Unauthorized.") {
    requireAdminSignIn();
  }
  return result;
}

/* ---------------------------- Local demo backend --------------------------- */

function readLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    return fallback;
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    /* storage unavailable — demo data just won't persist */
  }
}

function seedDemoDataIfEmpty() {
  const invoices = readLocal(STORAGE_KEYS.demoInvoices, null);
  if (invoices) return;

  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return d; };

  const demoInvoices = [
    { invoiceId: "INV-DEMO-001", serviceTitle: "Landing Page Build", description: "Marketing site, 4 sections", amount: 18000, currency: "INR", dueDate: iso(daysAgo(-5)), clientName: "Rakesh Mehta", clientEmail: "rakesh@example.com", clientPhone: "", company: "Mehta Retail", upiId: "creator@upi", upiName: "Aditya", notes: "", status: "Paid", createdAt: daysAgo(20).toISOString() },
    { invoiceId: "INV-DEMO-002", serviceTitle: "SOP Editing Package", description: "Two rounds of edits", amount: 4500, currency: "INR", dueDate: iso(daysAgo(-2)), clientName: "Priya Nair", clientEmail: "priya@example.com", clientPhone: "", company: "", upiId: "creator@upi", upiName: "Aditya", notes: "", status: "Paid", createdAt: daysAgo(15).toISOString() },
    { invoiceId: "INV-DEMO-003", serviceTitle: "Social Media Setup", description: "3-month content calendar", amount: 22000, currency: "INR", dueDate: iso(daysAgo(1)), clientName: "ABC Technologies", clientEmail: "accounts@abctech.example", clientPhone: "", company: "ABC Technologies", upiId: "creator@upi", upiName: "Aditya", notes: "", status: "Verification Pending", createdAt: daysAgo(4).toISOString() },
    { invoiceId: "INV-DEMO-004", serviceTitle: "Website Development", description: "Website design and development", amount: 5000, currency: "INR", dueDate: iso(daysAgo(-7)), clientName: "Sunrise Traders", clientEmail: "hello@sunrise.example", clientPhone: "", company: "Sunrise Traders", upiId: "creator@upi", upiName: "Aditya", notes: "", status: "Pending", createdAt: daysAgo(1).toISOString() }
  ];

  const demoPayments = [
    { paymentId: "PAY-DEMO-1", invoiceId: "INV-DEMO-003", clientName: "ABC Technologies", clientEmail: "accounts@abctech.example", amount: 22000, currency: "INR", utr: "308812349981", paymentDate: iso(daysAgo(1)), notes: "", status: "Verification Pending", submissionDate: daysAgo(1).toISOString() },
    { paymentId: "PAY-DEMO-2", invoiceId: "INV-DEMO-001", clientName: "Rakesh Mehta", clientEmail: "rakesh@example.com", amount: 18000, currency: "INR", utr: "441029981123", paymentDate: iso(daysAgo(19)), notes: "", status: "Paid", submissionDate: daysAgo(19).toISOString(), verificationDate: daysAgo(18).toISOString() },
    { paymentId: "PAY-DEMO-3", invoiceId: "INV-DEMO-002", clientName: "Priya Nair", clientEmail: "priya@example.com", amount: 4500, currency: "INR", utr: "998877665544", paymentDate: iso(daysAgo(14)), notes: "", status: "Paid", submissionDate: daysAgo(14).toISOString(), verificationDate: daysAgo(13).toISOString() }
  ];

  writeLocal(STORAGE_KEYS.demoInvoices, demoInvoices);
  writeLocal(STORAGE_KEYS.demoPayments, demoPayments);
}

/* ------------------------------- Settings ---------------------------------- */

function getSettings() {
  return readLocal(STORAGE_KEYS.settings, { scriptUrl: "", upiId: "", upiName: "" });
}

function saveSettings(settings) {
  writeLocal(STORAGE_KEYS.settings, settings);
}

/* ------------------------------- Data access -------------------------------- */

async function fetchInvoices() {
  if (isBackendConfigured()) {
    const res = await callBackend("listInvoices", null, "POST");
    return res.invoices || [];
  }
  seedDemoDataIfEmpty();
  return readLocal(STORAGE_KEYS.demoInvoices, []);
}

async function fetchPayments() {
  if (isBackendConfigured()) {
    const res = await callBackend("listPayments", null, "POST");
    return res.payments || [];
  }
  seedDemoDataIfEmpty();
  return readLocal(STORAGE_KEYS.demoPayments, []);
}

async function createInvoiceRecord(invoice) {
  if (isBackendConfigured()) {
    const res = await callBackend("createInvoice", invoice, "POST");
    if (!res || res.ok === false) {
      showToast(res && res.error ? res.error : "Failed to create invoice on backend.", "error");
      return { ok: false };
    }
    return res;
  }
  const invoices = readLocal(STORAGE_KEYS.demoInvoices, []);
  invoices.unshift(invoice);
  writeLocal(STORAGE_KEYS.demoInvoices, invoices);
  return { ok: true, invoiceId: invoice.invoiceId };
}

async function setPaymentStatus(paymentId, status, extra) {
  if (isBackendConfigured()) {
    return callBackend(status === "Paid" ? "verifyPayment" : "rejectPayment", Object.assign({ paymentId: paymentId }, extra || {}), "POST");
  }
  const payments = readLocal(STORAGE_KEYS.demoPayments, []);
  const payment = payments.find((p) => p.paymentId === paymentId);
  if (payment) {
    payment.status = status;
    if (status === "Paid") payment.verificationDate = new Date().toISOString();
    if (extra && extra.rejectionReason) payment.rejectionReason = extra.rejectionReason;
  }
  writeLocal(STORAGE_KEYS.demoPayments, payments);

  if (payment) {
    const invoices = readLocal(STORAGE_KEYS.demoInvoices, []);
    const invoice = invoices.find((i) => i.invoiceId === payment.invoiceId);
    if (invoice) invoice.status = status;
    writeLocal(STORAGE_KEYS.demoInvoices, invoices);
  }
  return { ok: true };
}

/* -------------------------------- Helpers ----------------------------------- */

function generateInvoiceId() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 900 + 100);
  return `INV-${y}${m}${d}-${rand}`;
}

function formatCurrency(amount, currency) {
  currency = currency || "INR";
  const n = Number(amount) || 0;
  if (currency === "INR") {
    return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  }
  return n.toLocaleString(undefined, { style: "currency", currency: currency });
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function showToast(message, type) {
  const stack = document.getElementById("toastStack");
  if (!stack) return;
  const el = document.createElement("div");
  el.className = "toast" + (type ? " toast--" + type : "");
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 3600);
}

function badgeForStatus(status) {
  const map = {
    "Paid": "paid",
    "Verification Pending": "pending",
    "Pending": "pending",
    "Rejected": "rejected",
    "Disabled": "disabled"
  };
  const cls = map[status] || "pending";
  return `<span class="badge badge--${cls}">${status}</span>`;
}

function buildPaymentUrl(invoiceId) {
  const base = window.location.href.replace(/index\.html.*$/, "").replace(/\/$/, "");
  return `${base}/payment.html?id=${encodeURIComponent(invoiceId)}`;
}

/* -------------------------------- Navigation -------------------------------- */

function navigateTo(view) {
  document.querySelectorAll(".view").forEach((el) => el.classList.remove("is-active"));
  const target = document.getElementById("view-" + view);
  if (target) target.classList.add("is-active");

  document.querySelectorAll(".nav-link").forEach((link) => {
    if (link.dataset.nav === view) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  document.getElementById("sidebar").classList.remove("is-open");
  document.getElementById("menuToggle").setAttribute("aria-expanded", "false");

  if (view === "dashboard") renderDashboard();
  if (view === "links") renderLinksTable();
  if (view === "payments") renderPaymentsView();
  if (view === "clients") renderClientsTable();
  if (view === "create") document.getElementById("invoiceNumber").value = generateInvoiceId();
}

function setupNavigation() {
  document.querySelectorAll("[data-nav]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      navigateTo(el.dataset.nav);
    });
  });

  const menuToggle = document.getElementById("menuToggle");
  const sidebar = document.getElementById("sidebar");
  menuToggle.addEventListener("click", () => {
    const isOpen = sidebar.classList.toggle("is-open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  });

  const initial = window.location.hash.replace("#", "") || "dashboard";
  navigateTo(document.getElementById("view-" + initial) ? initial : "dashboard");
}

/* -------------------------------- Rendering --------------------------------- */

async function renderDashboard() {
  const invoices = await fetchInvoices();
  const totalInvoiced = invoices.reduce((sum, i) => sum + Number(i.amount || 0), 0);
  const paid = invoices.filter((i) => i.status === "Paid").reduce((sum, i) => sum + Number(i.amount || 0), 0);
  const pending = invoices.filter((i) => i.status !== "Paid" && i.status !== "Rejected").reduce((sum, i) => sum + Number(i.amount || 0), 0);

  document.getElementById("statTotalInvoiced").textContent = formatCurrency(totalInvoiced);
  document.getElementById("statPaid").textContent = formatCurrency(paid);
  document.getElementById("statPending").textContent = formatCurrency(pending);
  document.getElementById("statLinkCount").textContent = String(invoices.length);

  const recent = invoices.slice(0, 5);
  const body = document.getElementById("dashboardRecentBody");
  body.innerHTML = recent.map((i) => `
    <tr>
      <td>${i.invoiceId}</td>
      <td>${escapeHtml(i.clientName || "—")}</td>
      <td>${formatCurrency(i.amount, i.currency)}</td>
      <td>${badgeForStatus(i.status)}</td>
      <td>${formatDate(i.createdAt)}</td>
    </tr>
  `).join("") || `<tr><td colspan="5" style="color:var(--color-text-secondary)">No invoices yet.</td></tr>`;
}

async function renderLinksTable() {
  const invoices = await fetchInvoices();
  const body = document.getElementById("linksTableBody");
  const empty = document.getElementById("linksEmptyState");

  if (invoices.length === 0) {
    body.innerHTML = "";
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  body.innerHTML = invoices.map((i) => `
    <tr>
      <td>${i.invoiceId}</td>
      <td>${escapeHtml(i.clientName || "—")}</td>
      <td>${formatCurrency(i.amount, i.currency)}</td>
      <td>${badgeForStatus(i.status)}</td>
      <td>${formatDate(i.createdAt)}</td>
      <td class="cell-actions">
        <button class="btn btn-secondary btn-sm" data-action="open" data-id="${i.invoiceId}">Open</button>
        <button class="btn btn-secondary btn-sm" data-action="copy" data-id="${i.invoiceId}">Copy</button>
        <button class="btn btn-secondary btn-sm" data-action="share" data-id="${i.invoiceId}" data-amount="${formatCurrency(i.amount, i.currency)}">Share</button>
      </td>
    </tr>
  `).join("");

  body.querySelectorAll('[data-action="open"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const invoice = invoices.find((item) => item.invoiceId === btn.dataset.id);
      if (invoice) showLinkDetails(invoice);
    });
  });

  body.querySelectorAll('[data-action="copy"], [data-action="share"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const url = buildPaymentUrl(id);
      if (btn.dataset.action === "copy") copyPaymentLink(url);
      if (btn.dataset.action === "share") shareWhatsApp(url, id, btn.dataset.amount);
    });
  });
}

function showLinkDetails(invoice) {
  const paymentUrl = buildPaymentUrl(invoice.invoiceId);
  document.getElementById("linkDetailsInvoice").textContent = invoice.invoiceId || "—";
  document.getElementById("linkDetailsClient").textContent = invoice.clientName || "—";
  document.getElementById("linkDetailsCompany").textContent = invoice.company || "—";
  document.getElementById("linkDetailsEmail").textContent = invoice.clientEmail || "—";
  document.getElementById("linkDetailsService").textContent = invoice.serviceTitle || "—";
  document.getElementById("linkDetailsAmount").textContent = formatCurrency(invoice.amount, invoice.currency);
  document.getElementById("linkDetailsStatus").textContent = invoice.status || "Pending";
  document.getElementById("linkDetailsCreated").textContent = formatDate(invoice.createdAt);
  document.getElementById("linkDetailsUrl").textContent = paymentUrl;
  document.getElementById("linkDetailsOpen").onclick = () => window.open(paymentUrl, "_blank", "noopener,noreferrer");
  document.getElementById("linkDetailsCopy").onclick = () => copyPaymentLink(paymentUrl);
  document.getElementById("linkDetailsOverlay").classList.add("is-open");
}

function setupLinkDetailsModal() {
  const overlay = document.getElementById("linkDetailsOverlay");
  const close = () => overlay.classList.remove("is-open");
  document.getElementById("linkDetailsClose").addEventListener("click", close);
  document.getElementById("linkDetailsCancel").addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
}

async function renderPaymentsView() {
  const payments = await fetchPayments();
  const pending = payments.filter((p) => p.status === "Verification Pending");
  const pendingList = document.getElementById("pendingPaymentsList");
  const pendingEmpty = document.getElementById("pendingEmptyState");

  if (pending.length === 0) {
    pendingList.innerHTML = "";
    pendingEmpty.hidden = false;
  } else {
    pendingEmpty.hidden = true;
    pendingList.innerHTML = pending.map((p) => `
      <div class="panel" style="margin-bottom:12px; border-color:var(--color-border);">
        <div class="panel__body" style="display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap; align-items:center;">
          <div>
            <p style="margin:0 0 4px; font-weight:600;">Invoice: ${p.invoiceId}</p>
            <p style="margin:0 0 4px; color:var(--color-text-secondary); font-size:13px;">Client: ${escapeHtml(p.clientName || "—")}</p>
            <p style="margin:0 0 4px; color:var(--color-text-secondary); font-size:13px;">Amount: ${formatCurrency(p.amount, p.currency)}</p>
            <p style="margin:0; color:var(--color-text-secondary); font-size:13px;">UTR: ${escapeHtml(p.utr)}</p>
          </div>
          <div class="cell-actions">
            <button class="btn btn-primary btn-sm" data-verify="${p.paymentId}">Verify</button>
            <button class="btn btn-danger btn-sm" data-reject="${p.paymentId}">Reject</button>
          </div>
        </div>
      </div>
    `).join("");

    pendingList.querySelectorAll("[data-verify]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        await setPaymentStatus(btn.dataset.verify, "Paid");
        showToast("Payment verified", "success");
        renderPaymentsView();
        renderDashboard();
      });
    });
    pendingList.querySelectorAll("[data-reject]").forEach((btn) => {
      btn.addEventListener("click", () => openRejectModal(btn.dataset.reject));
    });
  }

  const allBody = document.getElementById("allPaymentsBody");
  allBody.innerHTML = payments.map((p) => `
    <tr>
      <td>${p.invoiceId}</td>
      <td>${escapeHtml(p.clientName || "—")}</td>
      <td>${formatCurrency(p.amount, p.currency)}</td>
      <td>${escapeHtml(p.utr || "—")}</td>
      <td>${badgeForStatus(p.status)}</td>
      <td>${formatDate(p.submissionDate)}</td>
    </tr>
  `).join("") || `<tr><td colspan="6" style="color:var(--color-text-secondary)">No payment submissions yet.</td></tr>`;
}

async function renderClientsTable() {
  const invoices = await fetchInvoices();
  const byClient = {};
  invoices.forEach((i) => {
    const key = (i.clientEmail || i.clientName || "unknown").toLowerCase();
    if (!byClient[key]) {
      byClient[key] = { name: i.clientName, company: i.company, email: i.clientEmail, count: 0, paid: 0 };
    }
    byClient[key].count += 1;
    if (i.status === "Paid") byClient[key].paid += Number(i.amount || 0);
  });

  const clients = Object.values(byClient);
  const body = document.getElementById("clientsTableBody");
  const empty = document.getElementById("clientsEmptyState");

  if (clients.length === 0) {
    body.innerHTML = "";
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  body.innerHTML = clients.map((c) => `
    <tr>
      <td>${escapeHtml(c.name || "—")}</td>
      <td>${escapeHtml(c.company || "—")}</td>
      <td>${escapeHtml(c.email || "—")}</td>
      <td>${c.count}</td>
      <td>${formatCurrency(c.paid)}</td>
    </tr>
  `).join("");
}

function escapeHtml(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

/* -------------------------------- Reject modal ------------------------------- */

let pendingRejectId = null;

function openRejectModal(paymentId) {
  pendingRejectId = paymentId;
  document.getElementById("rejectReason").value = "";
  document.getElementById("rejectOverlay").classList.add("is-open");
}

function closeRejectModal() {
  pendingRejectId = null;
  document.getElementById("rejectOverlay").classList.remove("is-open");
}

function setupRejectModal() {
  document.getElementById("rejectModalClose").addEventListener("click", closeRejectModal);
  document.getElementById("rejectCancelBtn").addEventListener("click", closeRejectModal);
  document.getElementById("rejectOverlay").addEventListener("click", (e) => {
    if (e.target.id === "rejectOverlay") closeRejectModal();
  });
  document.getElementById("rejectConfirmBtn").addEventListener("click", async () => {
    if (!pendingRejectId) return;
    const reason = document.getElementById("rejectReason").value.trim();
    await setPaymentStatus(pendingRejectId, "Rejected", { rejectionReason: reason });
    showToast("Payment rejected", "error");
    closeRejectModal();
    renderPaymentsView();
    renderDashboard();
  });
}

/* -------------------------------- Invoice form ------------------------------- */

function validateForm(form) {
  let valid = true;
  const fields = {
    serviceTitle: (v) => v.trim().length > 0 || "Service title is required.",
    amount: (v) => (Number(v) > 0) || "Enter an amount greater than zero.",
    dueDate: (v) => v.trim().length > 0 || "Due date is required.",
    clientName: (v) => v.trim().length > 0 || "Client name is required.",
    clientEmail: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || "Enter a valid email address.",
    upiId: (v) => /^[\w.+-]+@[\w.-]+$/.test(v) || "Enter a valid UPI ID (e.g. name@bank).",
    upiName: (v) => v.trim().length > 0 || "UPI name is required."
  };

  Object.keys(fields).forEach((name) => {
    const input = form.elements[name];
    const errorEl = form.querySelector(`[data-error-for="${name}"]`);
    const result = fields[name](input.value);
    const fieldWrap = input.closest(".field");
    if (result === true) {
      if (errorEl) errorEl.textContent = "";
      if (fieldWrap) fieldWrap.classList.remove("has-error");
    } else {
      valid = false;
      if (errorEl) errorEl.textContent = result;
      if (fieldWrap) fieldWrap.classList.add("has-error");
    }
  });

  return valid;
}

function setupInvoiceForm() {
  const form = document.getElementById("invoiceForm");
  const linkResult = document.getElementById("linkResult");
  const linkResultText = document.getElementById("linkResultText");

  document.getElementById("invoiceNumber").value = generateInvoiceId();

  document.getElementById("qrUpload").addEventListener("change", (e) => {
    const file = e.target.files[0];
    const preview = document.getElementById("qrPreview");
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      preview.innerHTML = `<img src="${reader.result}" alt="Uploaded UPI QR preview">`;
    };
    reader.readAsDataURL(file);
  });

  document.getElementById("resetFormBtn").addEventListener("click", () => {
    form.reset();
    document.getElementById("invoiceNumber").value = generateInvoiceId();
    linkResult.classList.remove("is-visible");
    form.querySelectorAll(".field-error").forEach((el) => (el.textContent = ""));
    form.querySelectorAll(".has-error").forEach((el) => el.classList.remove("has-error"));
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validateForm(form)) {
      showToast("Please fix the highlighted fields", "error");
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Generating…";

    try {
      const invoiceId = document.getElementById("invoiceNumber").value || generateInvoiceId();
      const invoice = {
        invoiceId: invoiceId,
        paymentId: "PAY-" + invoiceId.replace("INV-", ""),
        serviceTitle: form.serviceTitle.value.trim(),
        description: form.description.value.trim(),
        amount: Number(form.amount.value),
        currency: form.currency.value,
        dueDate: form.dueDate.value,
        clientName: form.clientName.value.trim(),
        clientEmail: form.clientEmail.value.trim(),
        clientPhone: form.clientPhone.value.trim(),
        company: form.company.value.trim(),
        upiId: form.upiId.value.trim(),
        upiName: form.upiName.value.trim(),
        notes: form.notes.value.trim(),
        status: "Pending",
        createdAt: new Date().toISOString()
      };
      const url = buildPaymentUrl(invoiceId);
      invoice.paymentLink = url;

      const result = await createInvoiceRecord(invoice);
      if (!result || result.ok === false) return;

      linkResultText.textContent = url;
      linkResult.classList.add("is-visible");
      showToast("Payment link generated", "success");
      renderDashboard();
    } catch (err) {
      showToast("Could not generate the link. Check your backend connection.", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Generate Payment Link";
    }
  });

  document.getElementById("copyLinkBtn").addEventListener("click", () => {
    copyPaymentLink(linkResultText.textContent);
  });

  document.getElementById("shareLinkBtn").addEventListener("click", () => {
    const invoiceId = document.getElementById("invoiceNumber").value;
    const amount = formatCurrency(form.amount.value, form.currency.value);
    shareWhatsApp(linkResultText.textContent, invoiceId, amount);
  });
}

function copyPaymentLink(url) {
  navigator.clipboard.writeText(url).then(
    () => showToast("Link copied to clipboard", "success"),
    () => showToast("Could not copy the link", "error")
  );
}

function shareWhatsApp(url, invoiceId, amount) {
  const message = `Hi,\n\nPlease find the payment link for Invoice ${invoiceId}.\n\nAmount: ${amount}\n\nPayment Link:\n${url}\n\nThank you.`;
  const waUrl = "https://wa.me/?text=" + encodeURIComponent(message);
  window.open(waUrl, "_blank");
}

/* -------------------------------- Settings view ------------------------------ */

function setupSettings() {
  const settings = getSettings();
  const urlInput = document.getElementById("settingsScriptUrl");
  urlInput.value = settings.scriptUrl || "";
  const upiIdInput = document.getElementById("settingsUpiId");
  upiIdInput.value = settings.upiId || "";
  const upiNameInput = document.getElementById("settingsUpiName");
  upiNameInput.value = settings.upiName || "";

  document.getElementById("saveSettingsBtn").addEventListener("click", () => {
    const url = urlInput.value.trim();
    if (url && !url.endsWith("/exec")) {
      showToast("App Script URL must end with '/exec' (the deployed Web App endpoint).", "error");
      return;
    }
    saveSettings({
      scriptUrl: url,
      upiId: upiIdInput.value.trim(),
      upiName: upiNameInput.value.trim()
    });
    showToast("Settings saved", "success");
    // Reload to ensure new settings are used immediately
    renderDashboard();
  });
}

/* -------------------------------- Refresh button ------------------------------ */

function setupRefreshButton() {
  document.getElementById("refreshPaymentsBtn").addEventListener("click", () => {
    renderPaymentsView();
    showToast("Payments refreshed");
  });
}

function showAdminAuthMessage(message) {
  document.getElementById("adminAuthMessage").textContent = message;
}

async function handleAdminLogin(event) {
  event.preventDefault();
  const form = document.getElementById("adminAuthForm");
  const submitButton = document.getElementById("adminAuthSubmit");
  const password = form.elements.password.value;
  submitButton.disabled = true;
  showAdminAuthMessage("Checking password...");
  try {
    const result = await callBackend("adminLogin", { password: password }, "POST");
    if (!result || !result.ok) {
      showAdminAuthMessage(result && result.error ? result.error : "Incorrect password.");
      return;
    }

    adminSessionToken = result.sessionToken;
    sessionStorage.setItem(ADMIN_SESSION_KEY, adminSessionToken);
    form.reset();
    document.getElementById("adminAuthDialog").close();
    document.getElementById("adminSignOut").hidden = false;
    initializeDashboard();
  } catch (err) {
    showAdminAuthMessage("Could not sign in. Check your connection and try again.");
  } finally {
    submitButton.disabled = false;
  }
}

function requireAdminSignIn() {
  adminSessionToken = "";
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  const dialog = document.getElementById("adminAuthDialog");
  if (!dialog.open) dialog.showModal();
  document.getElementById("adminSignOut").hidden = true;
  showAdminAuthMessage("Your session expired. Enter the password again to continue.");
}

function initializeDashboard() {
  if (dashboardInitialized) {
    renderDashboard();
    return;
  }
  dashboardInitialized = true;
  setupNavigation();
  setupInvoiceForm();
  setupLinkDetailsModal();
  setupRejectModal();
  setupSettings();
  setupRefreshButton();
  document.getElementById("adminSignOut").addEventListener("click", async () => {
    try {
      await callBackend("adminLogout", {}, "POST");
    } catch (err) {
      /* The session token is removed locally even if logout cannot reach the server. */
    }
    adminSessionToken = "";
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    document.getElementById("adminSignOut").hidden = true;
    document.getElementById("adminAuthDialog").showModal();
    showAdminAuthMessage("Enter the dashboard password to continue.");
  });
}

/* -------------------------------- Init --------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("adminAuthForm").addEventListener("submit", handleAdminLogin);
  if (!isBackendConfigured()) {
    initializeDashboard();
    return;
  }

  const dialog = document.getElementById("adminAuthDialog");
  dialog.addEventListener("cancel", (event) => event.preventDefault());
  document.getElementById("adminAuthForm").addEventListener("submit", handleAdminLogin);
  if (adminSessionToken) {
    callBackend("adminCheck", {}, "POST").then((result) => {
      if (result && result.ok) {
        dialog.close();
        document.getElementById("adminSignOut").hidden = false;
        initializeDashboard();
        return;
      }
      requireAdminSignIn();
    }).catch(() => requireAdminSignIn());
    return;
  }
  dialog.showModal();
  showAdminAuthMessage("Enter the dashboard password to continue.");
});
