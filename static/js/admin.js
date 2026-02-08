// admin.html用のJavaScript

(function() {
  'use strict';

  const usernameEl = document.getElementById("username");
  const passwordEl = document.getElementById("password");
  const loginBtn = document.getElementById("login");
  const msgEl = document.getElementById("msg");
  const loginSection = document.getElementById("loginSection");
  const adminSection = document.getElementById("adminSection");
  const adminContent = document.getElementById("adminContent");
  const logoutBtn = document.getElementById("logout");

  if (!usernameEl || !passwordEl || !loginBtn || !msgEl || !loginSection || !adminSection) {
    console.error('必要な要素が見つかりません');
    return;
  }

  // 管理者トークンの管理
  function getAdminToken() {
    return localStorage.getItem("japanft_admin_token");
  }

  function setAdminToken(token) {
    localStorage.setItem("japanft_admin_token", token);
  }

  function removeAdminToken() {
    localStorage.removeItem("japanft_admin_token");
  }

  // 管理者認証状態を確認
  async function checkAdminAuth() {
    const token = getAdminToken();
    if (!token) {
      return false;
    }

    try {
      const response = await fetch("/api/admin/me", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      if (response.ok) {
        const adminInfo = await response.json();
        showAdminSection(adminInfo);
        return true;
      } else {
        removeAdminToken();
        return false;
      }
    } catch (error) {
      console.error("管理者認証チェックエラー:", error);
      removeAdminToken();
      return false;
    }
  }

  // 管理者セクションを表示
  function showAdminSection(adminInfo) {
    loginSection.style.display = "none";
    adminSection.style.display = "block";
    const usernameEl = document.getElementById("adminUsername");
    if (usernameEl) usernameEl.textContent = adminInfo.username || "";
    bindTransactionsButton();
  }

  // トランザクション一覧の読み込み
  function bindTransactionsButton() {
    const loadBtn = document.getElementById("loadTransactions");
    if (!loadBtn) return;
    loadBtn.onclick = loadAdminTransactions;
  }

  async function loadAdminTransactions() {
    const token = getAdminToken();
    if (!token) return;

    const loadingEl = document.getElementById("transactionsLoading");
    const errorEl = document.getElementById("transactionsError");
    const containerEl = document.getElementById("transactionsContainer");
    const bodyEl = document.getElementById("transactionsBody");
    const summaryEl = document.getElementById("transactionsSummary");

    if (loadingEl) loadingEl.style.display = "block";
    if (errorEl) { errorEl.style.display = "none"; errorEl.textContent = ""; }
    if (containerEl) containerEl.style.display = "none";
    if (bodyEl) bodyEl.innerHTML = "";

    try {
      const response = await fetch("/api/admin/transactions?limit=200", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || "トランザクションの取得に失敗しました");
      }
      const list = await response.json();

      if (summaryEl) {
        summaryEl.textContent = `全 ${list.length} 件のトランザクション（直近200件）`;
      }
      if (bodyEl && list.length > 0) {
        list.forEach(function (tx) {
          const dateStr = tx.transaction_date
            ? new Date(tx.transaction_date).toLocaleString("ja-JP")
            : "-";
          const row = document.createElement("tr");
          row.style.borderBottom = "1px solid var(--border)";
          row.innerHTML =
            "<td style='padding: 8px 12px;'>" + tx.transaction_id + "</td>" +
            "<td style='padding: 8px 12px;'>" + (tx.type || "-") + "</td>" +
            "<td style='padding: 8px 12px;'>" + (tx.seller_username || tx.seller_user_tag || tx.seller_id || "-") + "</td>" +
            "<td style='padding: 8px 12px;'>" + (tx.buyer_username || tx.buyer_user_tag || tx.buyer_id || "-") + "</td>" +
            "<td style='padding: 8px 12px;'>" + (tx.price != null ? Number(tx.price).toLocaleString() + " " + (tx.currency || "HLC") : "-") + "</td>" +
            "<td style='padding: 8px 12px;'>" + dateStr + "</td>";
          bodyEl.appendChild(row);
        });
      } else if (bodyEl) {
        bodyEl.innerHTML = "<tr><td colspan='6' style='padding: 16px;' class='muted'>トランザクションがありません</td></tr>";
      }
      if (containerEl) containerEl.style.display = "block";
    } catch (e) {
      if (errorEl) {
        errorEl.textContent = e.message || "読み込みに失敗しました";
        errorEl.style.display = "block";
      }
    } finally {
      if (loadingEl) loadingEl.style.display = "none";
    }
  }

  // ログインセクションを表示
  function showLoginSection() {
    loginSection.style.display = "block";
    adminSection.style.display = "none";
    if (usernameEl) usernameEl.value = "";
    if (passwordEl) passwordEl.value = "";
    if (msgEl) msgEl.textContent = "";
  }

  // ログイン処理
  async function handleLogin() {
    const username = usernameEl.value.trim();
    const password = passwordEl.value.trim();

    if (!username || !password) {
      if (msgEl) {
        msgEl.textContent = "ユーザー名とパスワードを入力してください";
        msgEl.style.color = "red";
      }
      return;
    }

    loginBtn.disabled = true;
    if (msgEl) {
      msgEl.textContent = "ログイン中...";
      msgEl.style.color = "";
    }

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username: username,
          password: password
        })
      });

      if (!response.ok) {
        let errorMessage = "ログインに失敗しました";
        try {
          const error = await response.json();
          errorMessage = error.detail || error.message || errorMessage;
        } catch (e) {
          if (response.status === 401) {
            errorMessage = "ユーザー名またはパスワードが正しくありません";
          }
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      setAdminToken(result.access_token);

      // 管理者情報を取得
      const adminInfoResponse = await fetch("/api/admin/me", {
        headers: {
          "Authorization": `Bearer ${result.access_token}`
        }
      });

      if (adminInfoResponse.ok) {
        const adminInfo = await adminInfoResponse.json();
        showAdminSection(adminInfo);
        if (msgEl) {
          msgEl.textContent = "ログインに成功しました";
          msgEl.style.color = "green";
        }
      } else {
        throw new Error("管理者情報の取得に失敗しました");
      }
    } catch (error) {
      console.error("ログインエラー:", error);
      if (msgEl) {
        msgEl.textContent = error.message || "ログインに失敗しました";
        msgEl.style.color = "red";
      }
    } finally {
      loginBtn.disabled = false;
    }
  }

  // ログアウト処理
  function handleLogout() {
    removeAdminToken();
    showLoginSection();
    if (msgEl) {
      msgEl.textContent = "ログアウトしました";
      msgEl.style.color = "green";
    }
  }

  // イベントリスナー
  if (loginBtn) {
    loginBtn.addEventListener("click", handleLogin);
  }

  if (usernameEl && passwordEl) {
    [usernameEl, passwordEl].forEach(el => {
      el.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          handleLogin();
        }
      });
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", handleLogout);
  }

  // 初期化: 認証状態を確認
  (async function init() {
    await checkAdminAuth();
  })();
})();

