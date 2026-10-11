// QRIS checkout UI. Authentication stays in same-origin Astro proxies via the httpOnly session cookie.
(function () {
  // Astro proxies authenticate requests with the httpOnly session cookie.
  // Do not read or expose session tokens in browser JavaScript.

  var flashBox = document.getElementById("flashBox");
  var modal = document.getElementById("qrisModal");
  var modalOverlay = document.getElementById("qrisOverlay");
  var modalBody = document.getElementById("qrisModalBody");
  var pollTimer = null;
  var countdownTimer = null;

  // ── Helpers ──
  function showFlash(msg, type) {
    if (!flashBox) return;
    var cls = type === "ok" ? "flash-ok" : "flash-err";
    flashBox.innerHTML = '<div class="flash ' + cls + '">' + msg + '</div>';
    flashBox.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function fmtIDR(n) {
    return "Rp" + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  // setBtnLoading toggles the buy button's busy state. It was referenced by the
  // click handler below but never defined, which threw a ReferenceError before
  // the modal opened — the reported "Bayar does nothing".
  function setBtnLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
      if (!btn.dataset.origText) btn.dataset.origText = btn.textContent;
      btn.setAttribute("disabled", "true");
      btn.textContent = "Memproses...";
    } else {
      btn.removeAttribute("disabled");
      if (btn.dataset.origText) btn.textContent = btn.dataset.origText;
    }
  }

  // safePaymentLink returns the URL only when it is a plain http(s) link,
  // otherwise "#". Provider payloads are untrusted, so javascript:/data: URLs
  // must never reach href/src.
  function safePaymentLink(url) {
    if (!url) return "#";
    try {
      var u = new URL(String(url), window.location.origin);
      if (u.protocol === "http:" || u.protocol === "https:") return u.href;
    } catch (e) { /* not a URL */ }
    return "#";
  }


  // ── QR encoder (QRIS EMV → data URI) ─────────────────────────────────────
  // Uses the vendored qrcode-generator library (public/js/qrcode.js, MIT) so the
  // buyer's EMV payment string renders into a scanable QR locally — the payload
  // never leaves this origin.
  function qrToDataURI(text) {
    try {
      if (typeof qrcode !== "function") return "";
      var qr = qrcode(0, "L");
      qr.addData(text);
      qr.make();
      var size = qr.getModuleCount();
      var scale = 8;
      var canvas = document.createElement("canvas");
      canvas.width = size * scale;
      canvas.height = size * scale;
      var ctx = canvas.getContext("2d");
      if (!ctx) return "";
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#000";
      for (var y = 0; y < size; y++) {
        for (var x = 0; x < size; x++) {
          if (qr.isDark(y, x)) ctx.fillRect(x * scale, y * scale, scale, scale);
        }
      }
      return canvas.toDataURL("image/png");
    } catch (e) {
      return "";
    }
  }

  // ── Modal control ──
  function openModal() {
    if (modal) modal.style.display = "flex";
    if (modalOverlay) modalOverlay.style.display = "block";
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    if (modal) modal.style.display = "none";
    if (modalOverlay) modalOverlay.style.display = "none";
    document.body.style.overflow = "";
    clearTimers();
  }

  function clearTimers() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  }
  function renderLoading(planName) {
    if (!modalBody) return;
    clearTimers();
    modalBody.innerHTML =
      '<div role="status" aria-live="polite" style="text-align:center;padding:30px 20px;">' +
        '<div style="font-size:32px;margin-bottom:12px;">⌛</div>' +
        '<div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:8px;">Menyiapkan pembayaran</div>' +
        '<div style="font-size:14px;color:var(--muted);">' + escapeHtml(planName || "Plan") + '</div>' +
      '</div>';
  }

  // renderQRIS builds the payment modal. The QR image is ALWAYS the provider's
  // own qris_image. There is deliberately no third-party encoder fallback: the
  // EMV payload is a live payment instruction, and shipping it to an external
  // image service (previously api.qrserver.com) disclosed every buyer's payment
  // string to a party with no role in the transaction. When the provider gives no
  // image we render the payload as copyable text with instructions instead, which
  // is payable in every Indonesian banking app and leaves the payload on this
  // origin.
  function renderQRIS(planCode, period, planName, data) {
    if (!modalBody) return;
    var expiredAt = data.expiresIn ? new Date(Date.now() + Number(data.expiresIn) * 1000) : new Date(Date.now() + 5 * 60 * 1000);
    var ticketId = data.trxId || data.qrisId || data.orderId;
    var qrPayload = String(data.qrString || data.qrisUrl || "");
    var providerImage = safePaymentLink(data.qrisImage);
    var hasProviderImage = providerImage !== "#";
    // qrString (EMV QRIS) dirender jadi QR image LOKAL via canvas — payload
    // tidak pernah dikirim ke pihak ketiga (lihat catatan renderQRIS).
    var qrImg = "";
    if (data.qrString) {
      try {
        var uri = qrToDataURI(data.qrString);
        if (uri) qrImg = '<img id="qrImage" src="' + uri + '" alt="Kode QRIS untuk pembayaran" style="width:280px;max-width:100%;image-rendering:pixelated;" />';
      } catch (e) { /* fall through ke text path */ }
    }
    if (!qrImg && !hasProviderImage && !qrPayload) { renderFailed(data.orderId || "", "QRIS tidak tersedia."); return; }
    var safeLink = safePaymentLink(qrPayload);
    // Metode non-QR (OVO/DANA/alfamart): tampilkan pay_code + instruksi.
    var payBlock = "";
    if (data.payCode) {
      payBlock =
        '<div style="border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px;">' +
          '<div style="font-size:11px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;">Kode Pembayaran</div>' +
          '<div style="font-size:24px;font-weight:700;font-family:monospace;color:var(--accent);word-break:break-all;">' + escapeHtml(data.payCode) + '</div>' +
          '<button id="btnCopyQris" class="btn" type="button" style="margin-top:8px;background:var(--track);color:var(--text);">Salin kode</button>' +
          '<span id="copyQrisStatus" role="status" aria-live="polite" style="font-size:12px;color:var(--muted);margin-left:8px;"></span>' +
        '</div>';
    }
    var instrBlock = "";
    if (Array.isArray(data.instructions) && data.instructions.length) {
      var rows = "";
      data.instructions.forEach(function (ins) {
        if (!ins || !ins[0]) return;
        rows += '<div style="margin-bottom:10px;"><div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px;">' + escapeHtml(ins[0]) + '</div>' +
          '<ol style="margin:0;padding-left:18px;font-size:13px;color:var(--muted);">' +
          String(ins[1] || "").split("\n").map(function (st) { return st.trim() ? "<li>" + escapeHtml(st) + "</li>" : ""; }).join("") +
          "</ol></div>";
      });
      if (rows) instrBlock = '<div style="border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px;"><div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:8px;">Cara bayar</div>' + rows + "</div>";
    }
    var qrBlock = qrImg
      ? '<div style="background:#fff;border-radius:12px;padding:20px;text-align:center;margin-bottom:16px;">' + qrImg + '</div>'
      : hasProviderImage && !payBlock
        ? '<div style="background:#fff;border-radius:12px;padding:20px;text-align:center;margin-bottom:16px;">' +
            '<img id="qrImage" src="' + providerImage + '" alt="Kode QRIS untuk pembayaran" style="width:280px;max-width:100%;image-rendering:pixelated;" />' +
          '</div>'
        : (payBlock ? payBlock : '<div style="border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:16px;">' +
          '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:6px;">Gambar QR tidak tersedia</div>' +
          '<p style="font-size:13px;color:var(--muted);margin:0 0 10px;">Salin kode QRIS di bawah, lalu buka aplikasi bank atau e-wallet kamu dan pilih <b>bayar QRIS</b> &rarr; <b>tempel/masukkan kode QR</b>. Jangan bagikan kode ini ke siapa pun.</p>' +
          '<label for="qrisPayload" style="display:block;font-size:11px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">Kode QRIS</label>' +
          '<textarea id="qrisPayload" readonly rows="4" style="width:100%;font-family:monospace;font-size:12px;word-break:break-all;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:8px;">' + escapeHtml(qrPayload) + '</textarea>' +
          '<button id="btnCopyQris" class="btn" type="button" style="margin-top:8px;background:var(--track);color:var(--text);">Salin kode</button>' +
          '<span id="copyQrisStatus" role="status" aria-live="polite" style="font-size:12px;color:var(--muted);margin-left:8px;"></span>' +
        '</div>');
    if (payBlock && qrImg) qrBlock = '<div style="background:#fff;border-radius:12px;padding:20px;text-align:center;margin-bottom:16px;">' + qrImg + '</div>' + payBlock;
    if (instrBlock) qrBlock += instrBlock;
    var identifiers = [data.qrisId ? "QRIS: " + escapeHtml(data.qrisId) : "", data.trxId ? "Transaksi: " + escapeHtml(data.trxId) : ""].filter(Boolean).join(" · ");
    modalBody.innerHTML =
      '<div style="text-align:center;margin-bottom:16px;">' +
        '<div style="font-size:11px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;">TICKET</div>' +
        '<div style="font-size:18px;font-weight:700;font-family:monospace;color:var(--accent);margin:4px 0;">' + escapeHtml(ticketId) + '</div>' +
        '<div style="font-size:13px;color:var(--muted);">' + escapeHtml(planName) + ' · ' + fmtIDR(data.amount || 0) + '</div>' +
        (identifiers ? '<div style="font-size:11px;color:var(--muted);margin-top:5px;">' + identifiers + '</div>' : '') +
      '</div>' +
      '<div id="countdown" style="text-align:center;margin-bottom:16px;">' +
        '<div style="font-size:11px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;">BAYAR DALAM</div>' +
        '<div id="countdownTime" style="font-size:32px;font-weight:700;font-family:monospace;color:var(--err);margin:4px 0;">05:00</div>' +
        '<div style="height:4px;background:var(--track);border-radius:2px;overflow:hidden;"><div id="countdownBar" style="height:100%;background:var(--accent);width:100%;transition:width 1s linear;"></div></div>' +
      '</div>' +
      qrBlock +
      (safeLink !== "#" ? '<p style="text-align:center;font-size:12px;color:var(--muted);">Jika QR tidak terbuka, gunakan <a href="' + safeLink + '" target="_blank" rel="noreferrer">tautan pembayaran</a>.</p>' : '') +
      '<div id="payStatus" style="text-align:center;margin-bottom:16px;"><div style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:var(--panel);border:1px solid var(--border);border-radius:8px;"><span id="statusDot" style="width:8px;height:8px;border-radius:50%;background:var(--warn);animation:pulse 1.5s infinite;"></span><span id="statusText" style="font-size:13px;color:var(--muted);">Menunggu pembayaran...</span></div></div>' +
      '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;"><button id="btnCheck" class="btn btn-primary" style="min-width:160px;">Cek Pembayaran</button><button id="btnCancel" class="btn" style="min-width:120px;background:var(--track);color:var(--err);">Batalkan Pembayaran</button><button id="btnClose" class="btn" style="min-width:120px;background:var(--track);color:var(--text);">Tutup</button></div>' +
      '<div style="text-align:center;margin-top:12px;font-size:11px;color:var(--muted);">Order: ' + escapeHtml(data.orderId) + '</div>';
    var btnCheck = document.getElementById("btnCheck");
    var btnCancel = document.getElementById("btnCancel");
    var btnClose = document.getElementById("btnClose");
    if (btnCheck) btnCheck.addEventListener("click", function() { checkPayment(data.orderId); });
    if (btnCancel) btnCancel.addEventListener("click", function() { cancelPayment(data.orderId); });
    if (btnClose) btnClose.addEventListener("click", function() { closeModal(); });
    bindCopyQris(data.payCode || qrPayload);
    startCountdown(expiredAt, data.orderId);
    startAutoPoll(data.orderId);
  }

  // bindCopyQris wires the copy affordance for the no-image path. Clipboard access
  // can be unavailable (insecure context, denied permission), so selecting the
  // textarea is the fallback — the payload stays visible and hand-copyable either
  // way, and nothing is sent anywhere.
  function bindCopyQris(payload) {
    var btn = document.getElementById("btnCopyQris");
    if (!btn) return;
    var status = document.getElementById("copyQrisStatus");
    var field = document.getElementById("qrisPayload");
    btn.addEventListener("click", function() {
      var done = function(msg) { if (status) status.textContent = msg; };
      var clip = typeof navigator !== "undefined" && navigator.clipboard;
      if (clip && clip.writeText) {
        clip.writeText(payload).then(function() { done("Kode disalin."); }, function() { done("Salin manual dari kotak di atas."); });
        return;
      }
      if (field && field.select) {
        field.select();
        done("Kode dipilih — tekan Ctrl+C untuk menyalin.");
        return;
      }
      done("Salin manual dari kotak di atas.");
    });
  }

  function renderSuccess(data) {
    if (!modalBody) return;
    clearTimers();
    modalBody.innerHTML =
      '<div style="text-align:center;padding:30px 20px;">' +
        '<div style="font-size:64px;margin-bottom:16px;">✅</div>' +
        '<div style="font-size:20px;font-weight:700;color:var(--ok);margin-bottom:8px;">Pembayaran Berhasil!</div>' +
        '<div style="font-size:14px;color:var(--muted);margin-bottom:24px;">Plan kamu sudah aktif. Terima kasih!</div>' +
        (data.ticketId ? '<div style="font-size:12px;color:var(--muted);margin-bottom:16px;">Ticket: <b>' + data.ticketId + '</b></div>' : '') +
        '<button id="btnDone" class="btn btn-primary" style="min-width:160px;">✓ Selesai</button>' +
      '</div>';
    var btnDone = document.getElementById("btnDone");
    if (btnDone) btnDone.addEventListener("click", function() { closeModal(); location.reload(); });
    // Auto close after 5s
    setTimeout(function() { closeModal(); location.reload(); }, 5000);
  }

  function renderExpired(orderId) {
    if (!modalBody) return;
    clearTimers();
    modalBody.innerHTML =
      '<div style="text-align:center;padding:30px 20px;">' +
        '<div style="font-size:64px;margin-bottom:16px;">⏰</div>' +
        '<div style="font-size:20px;font-weight:700;color:var(--err);margin-bottom:8px;">Waktu Habis</div>' +
        '<div style="font-size:14px;color:var(--muted);margin-bottom:24px;">QRIS sudah kadaluarsa. Silakan buat pembayaran baru.</div>' +
        '<div style="font-size:12px;color:var(--muted);margin-bottom:16px;">Order: ' + orderId + '</div>' +
        '<button id="btnRetry" class="btn btn-primary" style="min-width:160px;">🔄 Buat Baru</button> ' +
        '<button id="btnClose2" class="btn" style="min-width:120px;background:var(--track);color:var(--text);">✕ Tutup</button>' +
      '</div>';
    var btnRetry = document.getElementById("btnRetry");
    var btnClose2 = document.getElementById("btnClose2");
    if (btnRetry) btnRetry.addEventListener("click", function() { closeModal(); });
    if (btnClose2) btnClose2.addEventListener("click", function() { closeModal(); });
  }

  function renderFailed(orderId, reason) {
    if (!modalBody) return;
    clearTimers();
    modalBody.innerHTML =
      '<div style="text-align:center;padding:30px 20px;">' +
        '<div style="font-size:64px;margin-bottom:16px;">❌</div>' +
        '<div style="font-size:20px;font-weight:700;color:var(--err);margin-bottom:8px;">Pembayaran Gagal</div>' +
        '<div style="font-size:14px;color:var(--muted);margin-bottom:24px;">' + (reason || 'Terjadi kesalahan. Silakan coba lagi.') + '</div>' +
        '<div style="font-size:12px;color:var(--muted);margin-bottom:16px;">Order: ' + orderId + '</div>' +
        '<button id="btnClose3" class="btn btn-primary" style="min-width:160px;">✕ Tutup</button>' +
      '</div>';
    var btnClose3 = document.getElementById("btnClose3");
    if (btnClose3) btnClose3.addEventListener("click", function() { closeModal(); });
  }

  // ── Cancel payment ──
  function renderCancelled(orderId) {
    if (!modalBody) return;
    clearTimers();
    modalBody.innerHTML =
      '<div style="text-align:center;padding:30px 20px;">' +
        '<div style="font-size:64px;margin-bottom:16px;">🚫</div>' +
        '<div style="font-size:20px;font-weight:700;color:var(--text);margin-bottom:8px;">Pembayaran Dibatalkan</div>' +
        '<div style="font-size:14px;color:var(--muted);margin-bottom:24px;">Pesanan ini sudah dibatalkan dan slotnya dibebaskan. Silakan buat pembayaran baru jika masih ingin membeli.</div>' +
        '<div style="font-size:12px;color:var(--muted);margin-bottom:16px;">Order: ' + escapeHtml(orderId) + '</div>' +
        '<button id="btnCloseCancelled" class="btn btn-primary" style="min-width:160px;">✕ Tutup</button>' +
      '</div>';
    var btnCloseCancelled = document.getElementById("btnCloseCancelled");
    if (btnCloseCancelled) btnCloseCancelled.addEventListener("click", function() { closeModal(); });
  }

  function cancelPayment(orderId) {
    if (!orderId) return;
    if (typeof window.confirm === "function") {
      if (!window.confirm("Batalkan pembayaran ini? QRIS yang sudah dibuat tidak bisa digunakan lagi.")) return;
    }
    fetch("/api/cancel-payment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: orderId }),
    }).then(function(resp) {
      return resp.text().then(function(text) {
        var contentType = (resp.headers.get("content-type") || "").toLowerCase();
        if (!/^application\/json(?:\s*;|\s*$)|^[^;\s]+\+json(?:\s*;|\s*$)/i.test(contentType)) {
          throw new Error("Layanan pembayaran mengembalikan respons yang tidak valid.");
        }
        var data;
        try { data = JSON.parse(text); } catch (_) {
          throw new Error("Layanan pembayaran mengembalikan respons yang tidak valid.");
        }
        if (!resp.ok) {
          throw new Error((data && data.error && data.error.message) || (data && data.error) || (data && data.message) || ("HTTP " + resp.status));
        }
        return data;
      });
    }).then(function(data) {
      renderCancelled(orderId);
      showFlash("Pembayaran telah dibatalkan.", "ok");
    }).catch(function(e) {
      var msg = e && e.message ? e.message : "Gagal membatalkan pembayaran. Coba lagi.";
      showFlash(msg, "err");
    });
  }

  // ── Mayar hosted-checkout waiting state ──

  function renderMayarWaiting(planName, data) {
    if (!modalBody) return;
    clearTimers();
    modalBody.innerHTML =
      '<div style="text-align:center;padding:30px 20px;">' +
        '<div style="font-size:56px;margin-bottom:16px;">💳</div>' +
        '<div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:8px;">Menunggu pembayaran</div>' +
        '<div style="font-size:14px;color:var(--muted);margin-bottom:6px;">' + escapeHtml(planName || "Plan") + ' · ' + fmtIDR(data.amount || 0) + '</div>' +
        '<div style="font-size:13px;color:var(--muted);margin-bottom:16px;">Halaman pembayaran Mayar sudah dibuka di tab baru. Selesaikan pembayaran di sana.</div>' +
        '<div id="payStatus" style="text-align:center;margin-bottom:16px;"><div style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:var(--panel);border:1px solid var(--border);border-radius:8px;"><span id="statusDot" style="width:8px;height:8px;border-radius:50%;background:var(--warn);animation:pulse 1.5s infinite;"></span><span id="statusText" style="font-size:13px;color:var(--muted);">Menunggu pembayaran...</span></div></div>' +
        '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;"><button id="btnCheck" class="btn btn-primary" style="min-width:160px;">Cek Pembayaran</button><button id="btnCancel" class="btn" style="min-width:120px;background:var(--track);color:var(--err);">Batalkan Pembayaran</button><button id="btnClose" class="btn" style="min-width:120px;background:var(--track);color:var(--text);">Tutup</button></div>' +
        '<div style="text-align:center;margin-top:12px;font-size:11px;color:var(--muted);">Order: ' + escapeHtml(data.orderId) + '</div>' +
      '</div>';
    var btnCheck = document.getElementById("btnCheck");
    var btnCancel = document.getElementById("btnCancel");
    var btnClose = document.getElementById("btnClose");
    if (btnCheck) btnCheck.addEventListener("click", function() { checkPayment(data.orderId); });
    if (btnCancel) btnCancel.addEventListener("click", function() { cancelPayment(data.orderId); });
    if (btnClose) btnClose.addEventListener("click", function() { closeModal(); });
    startAutoPoll(data.orderId);
  }
  // ── Countdown timer ──
  function startCountdown(expiredAt, orderId) {
    var countdownEl = document.getElementById("countdownTime");
    var barEl = document.getElementById("countdownBar");
    var totalSeconds = Math.max(0, Math.floor((expiredAt.getTime() - Date.now()) / 1000));
    var remaining = totalSeconds;

    countdownTimer = setInterval(function() {
      remaining--;
      if (remaining <= 0) {
        clearInterval(countdownTimer);
        countdownTimer = null;
        renderExpired(orderId);
        return;
      }
      var m = Math.floor(remaining / 60);
      var s = remaining % 60;
      if (countdownEl) {
        countdownEl.textContent = (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
        // Change color when < 1 min
        countdownEl.style.color = remaining <= 60 ? "var(--err)" : remaining <= 120 ? "var(--warn)" : "var(--err)";
      }
      if (barEl) {
        barEl.style.width = (remaining / totalSeconds * 100) + "%";
        barEl.style.background = remaining <= 60 ? "var(--err)" : remaining <= 120 ? "var(--warn)" : "var(--accent)";
      }
    }, 1000);
  }

  // ── Auto-poll ──
  function startAutoPoll(orderId) {
    pollTimer = setInterval(function() { checkPayment(orderId, true); }, 5000);
  }

  // ── Check payment status ──
  function checkPayment(orderId, silent) {
    var statusDot = document.getElementById("statusDot");
    var statusText = document.getElementById("statusText");
    var btnCheck = document.getElementById("btnCheck");

    if (!silent && btnCheck) {
      btnCheck.setAttribute("disabled", "true");
      btnCheck.textContent = "⏳ Mengecek...";
    }

    // Read text first and parse defensively: an expired session or a proxy
    // error answers with an HTML page, and a bare r.json() surfaced the raw
    // "Unexpected token '<'" parse error to the buyer.
    fetch("/api/payment-status?orderId=" + encodeURIComponent(orderId))
      .then(function(r) {
        return r.text().then(function(text) {
          try { return JSON.parse(text); } catch (e) {
            throw new Error("Status pembayaran belum bisa dibaca (HTTP " + r.status + ").");
          }
        });
      })
      .then(function(s) {
        if (!s) return;

        if (String(s.status || "").toLowerCase() === "paid") {
          showFlash("Pembayaran diterima! Plan sudah aktif.", "ok");
          renderSuccess(s);
          return;
        }

        if (["expired", "cancelled", "failed"].indexOf(String(s.status || "").toLowerCase()) !== -1) {
          renderExpired(orderId);
          return;
        }

        if (!silent && statusText) {
          statusText.textContent = "Status: " + (s.status || "pending") + " — belum ada pembayaran";
          // Flash effect
          if (statusDot) {
            statusDot.style.background = "var(--warn)";
            setTimeout(function() { statusDot.style.background = "var(--ok)"; }, 200);
            setTimeout(function() { statusDot.style.background = "var(--warn)"; }, 400);
          }
        }
      })
      .catch(function(e) {
        if (!silent) showFlash("Gagal cek status: " + e.message, "err");
      })
      .finally(function() {
        if (!silent && btnCheck) {
          btnCheck.removeAttribute("disabled");
          btnCheck.textContent = "🔍 Cek Pembayaran";
        }
      });
  }

  // ── Buy button click ──
  document.querySelectorAll("[data-buy]").forEach(function(el) {
    el.addEventListener("click", function() {
      var planCode = el.getAttribute("data-buy");
      var period = el.getAttribute("data-period");
      var planName = el.getAttribute("data-plan") || planCode;
      var btn = el;
      // Harga paket MUTLAK: nominal selalu harga plan (data-min), input
      // "Jumlah" dari customer tidak dipakai. Backend juga meng-ignore amount.
      var minAmount = Number(el.getAttribute("data-min"));
      var amount = minAmount;
      if (!Number.isSafeInteger(amount) || amount <= 0) {
        showFlash("Harga paket tidak valid.", "err");
        return;
      }
      var idempotencyKey = (window.crypto && typeof window.crypto.randomUUID === "function") ? window.crypto.randomUUID() : (String(Date.now()) + "-" + String(Math.random()).slice(2));
      var methodSel = document.getElementById("payMethod");
      var method = methodSel && methodSel.value ? methodSel.value : "";
      setBtnLoading(btn, true);
      openModal();
      renderLoading(planName);
      var phoneEl = document.getElementById("payPhone");
      var phone = phoneEl && phoneEl.value ? phoneEl.value.trim() : "";
      fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ planCode: planCode, period: period, amount: amount, method: method, customer_phone: phone, idempotencyKey: idempotencyKey }),
      }).then(function(resp) {
        return resp.text().then(function(text) {
          var contentType = (resp.headers.get("content-type") || "").toLowerCase();
          var data;
          if (!/^application\/json(?:\s*;|\s*$)|^[^;\s]+\+json(?:\s*;|\s*$)/i.test(contentType)) {
            throw new Error("Layanan pembayaran mengembalikan respons yang tidak valid.");
          }
          try { data = JSON.parse(text); } catch (_) {
            throw new Error("Layanan pembayaran mengembalikan respons yang tidak valid.");
          }
          if (!resp.ok) {
            throw new Error((data && data.error && data.error.message) || (data && data.error) || (data && data.message) || ("HTTP " + resp.status));
          }
          return data;
        });
      }).then(function(data) {
        if (data && data.paymentUrl) {
          // Mayar: open the hosted checkout and poll the order status in the
          // modal so the user returns to a settled result.
          window.open(data.paymentUrl, "_blank", "noopener");
          renderMayarWaiting(planName, data);
          return;
        }
        // The provider can answer with a raw EMV payload (qrString), a hosted
        // QR image (qrisImage/qrisUrl), or a wallet/retail code (payCode).
        // Gating on qrisImage||qrisUrl alone rejected the qrString case and
        // showed "Gagal membuat pembayaran" instead of a payable QR.
        if (data && (data.qrString || data.payCode || data.qrisImage || data.qrisUrl)) {
          renderQRIS(planCode, period, planName, data);
        } else {
          var errMsg = data && data.error && data.error.message ? data.error.message : "Gagal membuat pembayaran";
          renderFailed("", errMsg);
          showFlash(errMsg, "err");
        }
      }).catch(function(e) {
        var msg = e && e.message ? e.message : "Layanan pembayaran sedang tidak tersedia.";
        renderFailed("", msg);
        showFlash(msg, "err");
      }).finally(function() {
        setBtnLoading(btn, false);
      });
    });
  });
  // ── Toggle phone input for e-wallet / convenience methods ──
  var payMethodSelToggle = document.getElementById("payMethod");
  var phoneRow = document.getElementById("phoneRow");
  if (payMethodSelToggle && phoneRow) {
    function syncPhoneRow() {
      var m = String(payMethodSelToggle.value || "").toUpperCase();
      var needsPhone = m === "OVO" || m === "DANA" || m === "SHOPEEPAY" || m === "ALFAMART" || m === "INDOMARET" || m === "ALFAMIDI" || m === "QRIS2";
      phoneRow.style.display = needsPhone ? "flex" : "none";
    }
    payMethodSelToggle.addEventListener("change", syncPhoneRow);
    // Saat channels dimuat, sinkronkan ulang (handle QRIS default)
    var origChannelsSet = null;
    var channelObs = new MutationObserver(function () { if (payMethodSelToggle.value) syncPhoneRow(); });
    channelObs.observe(payMethodSelToggle, { childList: true, subtree: true });
  }

  // ── Payment method picker ──
  var payMethodSel = document.getElementById("payMethod");
  if (payMethodSel) {
    fetch("/api/payment-channels")
      .then(function (resp) { return resp.json().catch(function () { return {}; }); })
      .then(function (data) {
        var channels = (data && data.channels) || [];
        if (!channels.length) {
          payMethodSel.innerHTML = '<option value="">QRIS</option>';
          return;
        }
        var html = '<option value="QRIS">QRIS</option>';
        channels.forEach(function (c) {
          if (c && c.code && c.code !== "QRIS") {
            var fee = c.feeIdr ? " \u00b7 fee " + fmtIDR(c.feeIdr) : "";
            html += '<option value="' + escapeHtml(c.code) + '">' + escapeHtml(c.group + " — " + c.name) + fee + "</option>";
          }
        });
        payMethodSel.innerHTML = html;
      })
      .catch(function () { payMethodSel.innerHTML = '<option value="">QRIS</option>'; });
  }

  // ── Topup saldo ──
  // Saldo is also where a slot-collision refund lands, so this is the control
  // a buyer returns to after a promo sells out under them. It reuses the same
  // modal as plan checkout: Tripay answers with an EMV qrString, Mayar with a
  // hosted link, and the poll settles the order either way.
  var btnTopup = document.getElementById("btnTopup");
  var topupInput = document.getElementById("topupAmount");
  var topupMsg = document.getElementById("topupMsg");
  if (btnTopup) {
    btnTopup.addEventListener("click", function() {
      var amount = Number(topupInput && topupInput.value);
      if (!Number.isSafeInteger(amount) || amount < 10000) {
        if (topupMsg) topupMsg.innerHTML = '<div class="flash flash-err">Nominal topup minimal Rp10.000.</div>';
        return;
      }
      var idempotencyKey = (window.crypto && typeof window.crypto.randomUUID === "function")
        ? window.crypto.randomUUID()
        : String(Date.now()) + "-" + String(Math.random()).slice(2);
      var methodSel = document.getElementById("payMethod");
      var method = methodSel && methodSel.value ? methodSel.value : "";
      var phoneEl = document.getElementById("payPhone");
      var phone = phoneEl && phoneEl.value ? phoneEl.value.trim() : "";
      if (topupMsg) topupMsg.innerHTML = "";
      setBtnLoading(btnTopup, true);
      openModal();
      renderLoading("Topup Balance");
      fetch("/api/balance/topup", {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ amount: amount, method: method, customer_phone: phone, idempotencyKey: idempotencyKey }),
      })
        .then(function(resp) {
          return resp.text().then(function(text) {
            // A proxy or provider that answers HTML would otherwise surface as
            // "Unexpected token '<'" — say what actually happened instead.
            var contentType = (resp.headers.get("content-type") || "").toLowerCase();
            if (!/^application\/json(?:\s*;|\s*$)|^[^;\s]+\+json(?:\s*;|\s*$)/i.test(contentType)) {
              throw new Error("Layanan pembayaran mengembalikan respons yang tidak valid.");
            }
            var parsed;
            try { parsed = JSON.parse(text); } catch (_) {
              throw new Error("Layanan pembayaran mengembalikan respons yang tidak valid.");
            }
            if (!resp.ok) {
              var msg = (parsed && parsed.error && parsed.error.message) || (parsed && parsed.error) || ("HTTP " + resp.status);
              throw new Error(typeof msg === "string" ? msg : "Gagal membuat pembayaran.");
            }
            return parsed;
          });
        })
        .then(function(data) {
          // renderQRIS owns the modal for provider-shaped payloads; it needs a
          // plan label and the same data envelope the plan checkout uses.
          renderQRIS("balance", "topup", "Topup Balance", data);
        })
        .catch(function(e) {
          closeModal();
          if (topupMsg) topupMsg.innerHTML = '<div class="flash flash-err">' + escapeHtml(e.message) + "</div>";
        })
        .finally(function() {
          setBtnLoading(btnTopup, false);
        });
    });
  }

  // ── Close modal on ESC ──
  document.addEventListener("keydown", function(e) {
    if (e.key === "Escape" && modal && modal.style.display === "flex") closeModal();
  });

  // ── Promo code ──
  var btnRedeem = document.getElementById("btnRedeem");
  var promoInput = document.getElementById("promoCode");
  var promoMsg = document.getElementById("promoMsg");
  if (btnRedeem) {
    btnRedeem.addEventListener("click", function() {
      var code = (promoInput && promoInput.value) ? promoInput.value.trim() : "";
      if (!code) {
        if (promoMsg) promoMsg.innerHTML = '<div class="flash flash-err">Masukkan kode promo dulu.</div>';
        return;
      }
      btnRedeem.setAttribute("disabled", "true");
      fetch("/api/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: code }),
      })
        .then(function(resp) { return resp.json().then(function(d) { return { ok: resp.ok, data: d }; }); })
        .then(function(result) {
          if (result.ok) {
            if (promoMsg) promoMsg.innerHTML = '<div class="flash flash-ok">' + (result.data.message || "Promo code berhasil!") + "</div>";
            if (promoInput) promoInput.value = "";
            setTimeout(function() { location.reload(); }, 1500);
          } else {
            var msg = (result.data && result.data.error && result.data.error.message) || "Gagal redeem";
            if (promoMsg) promoMsg.innerHTML = '<div class="flash flash-err">' + msg + "</div>";
          }
        })
        .catch(function(e) {
          if (promoMsg) promoMsg.innerHTML = '<div class="flash flash-err">Error: ' + e.message + "</div>";
        })
        .finally(function() {
          btnRedeem.removeAttribute("disabled");
        });
    });
  }
  if (promoInput) {
    promoInput.addEventListener("keydown", function(e) {
      if (e.key === "Enter" && btnRedeem) btnRedeem.click();
    });
  }
})();
