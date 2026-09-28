/* ==========================================================================
   Invoice Link — Client Payment Page Script
   Vanilla JS only. No frameworks, no build step.
   ========================================================================== */

/* Public configuration only. Never place secrets here. */
const CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbyOiIoFltcl5PeaCTI5nNxFdUTY6X_aiPdOyytoQ_7DCXQsk9iRJIqCrq6R4OcUw2ZMYw/exec"
};

const STORAGE_KEYS = {
  settings: "invoiceLink.settings",
  demoInvoices: "invoiceLink.demoInvoices",
  demoPayments: "invoiceLink.demoPayments"
};

let currentInvoice = null;

/* -------------------------------- Backend ------------------------------------ */

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
    /* storage unavailable */
  }
}

function getScriptUrl() {
  const settings = readLocal(STORAGE_KEYS.settings, {});
  const saved = settings.scriptUrl;
  return (saved && saved.startsWith("http")) ? saved : CONFIG.APPS_SCRIPT_URL;
}

function isBackendConfigured() {
  const url = getScriptUrl();
  return !!url && url !== "YOUR_PUBLIC_APPS_SCRIPT_WEB_APP_URL" && url.startsWith("http");
}

async function callBackend(action, payload, method) {
  method = method || "POST";
  const url = getScriptUrl();
  if (method === "GET") {
    const params = new URLSearchParams(Object.assign({ action: action }, payload || {}));
    const res = await fetch(url + "?" + params.toString(), { method: "GET" });
    return res.json();
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(Object.assign({ action: action }, payload || {}))
  });
  return res.json();
}

/**
 * loadInvoice — fetches the invoice record for the id in the URL.
 * The amount and every payment detail always come from this lookup;
 * nothing about the invoice is ever read out of the URL itself.
 */
async function loadInvoice(invoiceId) {
  if (isBackendConfigured()) {
    const res = await callBackend("getInvoice", { id: invoiceId }, "GET");
    if (!res || !res.ok) return null;
    return res.invoice;
  }

  // Local demo fallback — mirrors the dashboard's demo data so the page
  // is explorable before a real Apps Script backend is connected.
  const invoices = readLocal(STORAGE_KEYS.demoInvoices, []);
  return invoices.find((i) => i.invoiceId === invoiceId) || null;
}

async function submitPayment(paymentPayload) {
  if (isBackendConfigured()) {
    return callBackend("submitPayment", paymentPayload, "POST");
  }

  // Local demo fallback: basic duplicate-UTR and required-field checks,
  // mirroring the validation the Apps Script backend performs for real.
  const payments = readLocal(STORAGE_KEYS.demoPayments, []);
  const duplicate = payments.some((p) => p.utr && p.utr.trim().toLowerCase() === paymentPayload.utr.trim().toLowerCase());
  if (duplicate) {
    return { ok: false, error: "This UTR has already been submitted for a payment." };
  }

  payments.unshift({
    paymentId: "PAY-" + paymentPayload.invoiceId.replace("INV-", "") + "-" + Date.now(),
    invoiceId: paymentPayload.invoiceId,
    clientName: paymentPayload.fullName,
    clientEmail: paymentPayload.payerEmail,
    amount: currentInvoice.amount,
    currency: currentInvoice.currency,
    utr: paymentPayload.utr,
    paymentDate: paymentPayload.paymentDate,
    notes: paymentPayload.payerNotes,
    status: "Verification Pending",
    submissionDate: new Date().toISOString()
  });
  writeLocal(STORAGE_KEYS.demoPayments, payments);

  const invoices = readLocal(STORAGE_KEYS.demoInvoices, []);
  const invoice = invoices.find((i) => i.invoiceId === paymentPayload.invoiceId);
  if (invoice) invoice.status = "Verification Pending";
  writeLocal(STORAGE_KEYS.demoInvoices, invoices);

  return { ok: true };
}

/* -------------------------------- Helpers ------------------------------------- */

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

function setState(name) {
  document.querySelectorAll(".state-block").forEach((el) => el.classList.remove("is-active"));
  const target = document.getElementById("state" + name);
  if (target) target.classList.add("is-active");
}

/**
 * Builds a UPI deep-link string and renders it as a QR code image via a
 * public QR-rendering endpoint. No credentials are involved — this only
 * encodes the same public UPI ID and amount already shown on the page.
 */
function buildQrImageUrl(invoice) {
  const upiUri = `upi://pay?pa=${encodeURIComponent(invoice.upiId)}&pn=${encodeURIComponent(invoice.upiName || "")}&am=${encodeURIComponent(invoice.amount)}&cu=${encodeURIComponent(invoice.currency || "INR")}&tn=${encodeURIComponent(invoice.invoiceId)}`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiUri)}`;
}

/* -------------------------------- Render invoice ------------------------------- */

function renderInvoice(invoice) {
  document.getElementById("fromName").textContent = invoice.upiName || invoice.freelancerName || "Freelancer";
  document.getElementById("invoiceIdText").textContent = invoice.invoiceId;
  document.getElementById("serviceTitleText").textContent = invoice.serviceTitle || "—";

  const descRow = document.getElementById("descriptionRow");
  if (invoice.description) {
    document.getElementById("descriptionText").textContent = invoice.description;
  } else {
    descRow.style.display = "none";
  }

  document.getElementById("dueDateText").textContent = formatDate(invoice.dueDate);
  document.getElementById("amountText").textContent = formatCurrency(invoice.amount, invoice.currency);
  document.getElementById("upiIdText").textContent = invoice.upiId;

  const qrImage = document.getElementById("qrImage");
  qrImage.src = buildQrImageUrl(invoice);
  qrImage.onerror = () => { qrImage.src = "assets/qr-placeholder.png"; };

  if (invoice.status === "Paid" || invoice.status === "Verification Pending") {
    document.getElementById("submissionCard").style.display = invoice.status === "Paid" ? "none" : "block";
  }

  if (invoice.status === "Paid") {
    setState("Status");
    document.getElementById("statusInvoiceId").textContent = invoice.invoiceId;
    document.getElementById("statusAmount").textContent = formatCurrency(invoice.amount, invoice.currency);
    document.getElementById("statusStatus").textContent = "Paid";
    document.querySelector("#stateStatus .status-card__title").textContent = "Payment Verified";
    document.querySelector("#stateStatus .status-card__body").textContent = "This invoice has been marked as paid by the freelancer.";
  } else if (invoice.status === "Verification Pending") {
    setState("Status");
    document.getElementById("statusInvoiceId").textContent = invoice.invoiceId;
    document.getElementById("statusAmount").textContent = formatCurrency(invoice.amount, invoice.currency);
    document.getElementById("statusStatus").textContent = "Verification Pending";
  } else {
    setState("Invoice");
  }
}

/* -------------------------------- Copy / scroll actions ------------------------- */

function setupPageActions(invoice) {
  document.getElementById("copyUpiBtn").addEventListener("click", () => {
    navigator.clipboard.writeText(invoice.upiId).then(
      () => showToast("UPI ID copied", "success"),
      () => showToast("Could not copy UPI ID", "error")
    );
  });

  document.getElementById("paidBtn").addEventListener("click", () => {
    document.getElementById("submissionCard").scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("fullName").focus();
  });
}

/* -------------------------------- Validation & submit --------------------------- */

function validateForm(form) {
  let valid = true;
  const fields = {
    fullName: (v) => v.trim().length > 0 || "Full name is required.",
    utr: (v) => v.trim().length >= 6 || "Enter a valid UTR / transaction ID.",
    paymentDate: (v) => v.trim().length > 0 || "Payment date is required.",
    payerEmail: (v) => v.trim() === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || "Enter a valid email address."
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

function setupSubmissionForm(invoice) {
  const form = document.getElementById("submissionForm");
  const maxDate = new Date().toISOString().slice(0, 10);
  document.getElementById("paymentDate").setAttribute("max", maxDate);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validateForm(form)) {
      showToast("Please fix the highlighted fields", "error");
      return;
    }

    const submitBtn = document.getElementById("submitPaymentBtn");
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting…";

    try {
      const payload = {
        invoiceId: invoice.invoiceId,
        fullName: form.fullName.value.trim(),
        payerEmail: form.payerEmail.value.trim(),
        payerPhone: form.payerPhone.value.trim(),
        utr: form.utr.value.trim(),
        paymentDate: form.paymentDate.value,
        payerNotes: form.payerNotes.value.trim()
      };

      const result = await submitPayment(payload);

      if (!result || result.ok === false) {
        showToast(result && result.error ? result.error : "Could not submit your payment. Please try again.", "error");
        return;
      }

      document.getElementById("statusInvoiceId").textContent = invoice.invoiceId;
      document.getElementById("statusAmount").textContent = formatCurrency(invoice.amount, invoice.currency);
      document.getElementById("statusStatus").textContent = "Verification Pending";
      setState("Status");
    } catch (err) {
      showToast("Network error — please check your connection and try again.", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Payment";
    }
  });
}

/* -------------------------------- Init ------------------------------------------ */

document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const invoiceId = (params.get("id") || "").trim();

  if (!invoiceId) {
    document.getElementById("invalidReason").textContent = "No invoice was specified in this link.";
    setState("Invalid");
    return;
  }

  try {
    const invoice = await loadInvoice(invoiceId);
    if (!invoice) {
      setState("Invalid");
      return;
    }
    currentInvoice = invoice;
    renderInvoice(invoice);
    setupPageActions(invoice);
    setupSubmissionForm(invoice);
  } catch (err) {
    document.getElementById("invalidReason").textContent = "We couldn't load this invoice right now. Please try again shortly.";
    setState("Invalid");
  }
});
