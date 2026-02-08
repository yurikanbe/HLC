/**
 * transfer.html専用のJavaScript
 * ユーザー名・識別子で送金機能
 */

// DOM要素の取得
const recipientEl = document.getElementById("recipient");
const userSearchResultsEl = document.getElementById("userSearchResults");
const selectedUserEl = document.getElementById("selectedUser");
const selectedUsernameEl = document.getElementById("selectedUsername");
const selectedTagEl = document.getElementById("selectedTag");
const clearUserBtn = document.getElementById("clearUser");
const amountEl = document.getElementById("amount");
const memoEl = document.getElementById("memo");
const sendBtn = document.getElementById("sendBtn");
const messageEl = document.getElementById("message");
const balanceEl = document.getElementById("balance");
const historyEl = document.getElementById("history");
const cartCountEl = document.getElementById("cartCount");

// 選択されたユーザー情報
let selectedUser = null;
let searchTimeout = null;

// 認証トークンの取得
function getAuthToken() {
  return localStorage.getItem("japanft_token");
}

// トーストメッセージ表示
function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.style.display = "block";
  toast.style.opacity = "1";
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => {
      toast.style.display = "none";
    }, 300);
  }, 2000);
}

// カートカウント更新
function updateCartCount() {
  if (cartCountEl) {
    try {
      const cart = JSON.parse(localStorage.getItem("nft_cart") || "[]");
      cartCountEl.textContent = String(cart.length);
    } catch {
      cartCountEl.textContent = "0";
    }
  }
}

// ユーザー検索
async function searchUsers(query) {
  if (!query || query.length < 1) {
    userSearchResultsEl.classList.remove("active");
    return;
  }

  const token = getAuthToken();
  if (!token) {
    showToast("ログインが必要です");
    return;
  }

  try {
    const response = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (!response.ok) {
      // エラーの詳細を取得
      let errorMessage = "ユーザー検索に失敗しました";
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
        console.error("ユーザー検索エラー詳細:", errorData);
      } catch (e) {
        console.error("ユーザー検索エラー:", response.status, response.statusText);
      }
      throw new Error(errorMessage);
    }

    const users = await response.json();
    console.log("検索結果（生データ）:", JSON.stringify(users, null, 2));
    
    // 各ユーザーのwallet_addressを確認
    users.forEach((user, index) => {
      const hasWallet = !!user.wallet_address;
      console.log(`ユーザー ${index + 1} (${user.username || '未設定'}):`, {
        user_id: user.user_id,
        username: user.username,
        user_tag: user.user_tag,
        wallet_address: user.wallet_address || "❌ なし",
        has_wallet_address: hasWallet,
        wallet_address_type: typeof user.wallet_address
      });
      
      if (!hasWallet) {
        console.error(`⚠️ 警告: ユーザー ${user.user_id} (${user.username}) にwallet_addressがありません！`);
      }
    });
    displaySearchResults(users);
  } catch (error) {
    console.error("ユーザー検索エラー:", error);
    userSearchResultsEl.classList.remove("active");
  }
}

// 検索結果を表示
function displaySearchResults(users) {
  userSearchResultsEl.innerHTML = "";

  if (users.length === 0) {
    userSearchResultsEl.innerHTML = '<div class="user-search-item"><div class="muted">ユーザーが見つかりません</div></div>';
    userSearchResultsEl.classList.add("active");
    return;
  }

  users.forEach(user => {
    const item = document.createElement("div");
    item.className = "user-search-item";
    item.innerHTML = `
      <div class="user-search-item-info">
        <div class="user-search-item-name">${user.username || "未設定"}</div>
        <div class="user-search-item-tag">${user.user_tag ? `#${user.user_tag}` : "識別子なし"}</div>
      </div>
    `;
    item.addEventListener("click", () => {
      selectUser(user);
    });
    userSearchResultsEl.appendChild(item);
  });

  userSearchResultsEl.classList.add("active");
}

// ユーザーを選択
function selectUser(user) {
  console.log("selectUser呼び出し - 元のユーザーオブジェクト:", user);
  console.log("wallet_addressの値:", user.wallet_address);
  console.log("wallet_addressの型:", typeof user.wallet_address);
  
  // ユーザー情報を完全にコピー（wallet_addressが含まれていることを確認）
  selectedUser = {
    user_id: user.user_id,
    username: user.username,
    user_tag: user.user_tag,
    user_type: user.user_type,
    profile_image_url: user.profile_image_url,
    bio: user.bio,
    wallet_address: user.wallet_address  // 送金に必要
  };
  
  console.log("選択されたユーザー（完全版）:", JSON.stringify(selectedUser, null, 2));
  
  // wallet_addressが存在しない場合は警告
  if (!selectedUser.wallet_address) {
    console.warn("警告: 選択されたユーザーにwallet_addressが含まれていません。詳細情報を取得します。");
    console.warn("元のユーザーオブジェクト全体:", JSON.stringify(user, null, 2));
    // APIから再度ユーザー情報を取得
    fetchUserDetails(selectedUser.user_id);
    return;
  }
  
  console.log("wallet_addressが正常に取得されました:", selectedUser.wallet_address);
  
  recipientEl.value = "";
  userSearchResultsEl.classList.remove("active");
  
  selectedUsernameEl.textContent = user.username || "未設定";
  if (user.user_tag) {
    selectedTagEl.textContent = `#${user.user_tag}`;
    selectedTagEl.style.display = "inline-block";
  } else {
    selectedTagEl.style.display = "none";
  }
  
  selectedUserEl.style.display = "flex";
}

// ユーザー詳細情報を取得（wallet_addressを含む）
async function fetchUserDetails(userId) {
  const token = getAuthToken();
  if (!token) {
    showMessage("ログインが必要です", "error");
    return;
  }

  try {
    const response = await fetch(`/api/users/${userId}`, {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (response.ok) {
      const userDetails = await response.json();
      console.log("取得したユーザー詳細:", userDetails);
      
      // wallet_addressを含めて更新
      if (userDetails.wallet_address) {
        selectedUser.wallet_address = userDetails.wallet_address;
        console.log("wallet_addressを取得しました:", selectedUser.wallet_address);
      } else {
        showMessage("送金先ユーザーのウォレットアドレスが取得できませんでした", "error");
        clearUser();
      }
    } else {
      showMessage("ユーザー情報の取得に失敗しました", "error");
      clearUser();
    }
  } catch (error) {
    console.error("ユーザー詳細取得エラー:", error);
    showMessage("ユーザー情報の取得に失敗しました", "error");
    clearUser();
  }
}

// 選択をクリア
function clearUser() {
  selectedUser = null;
  selectedUserEl.style.display = "none";
  recipientEl.value = "";
  userSearchResultsEl.classList.remove("active");
}

// 残高を取得
async function loadBalance() {
  const token = getAuthToken();
  if (!token) return;

  try {
    const response = await fetch("/api/wallet/balance", {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      if (balanceEl) {
        balanceEl.textContent = data.total_balance.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
      }
    }
  } catch (error) {
    console.error("残高取得エラー:", error);
  }
}

// 送金処理
async function sendTransfer() {
  if (!selectedUser) {
    showMessage("送金先ユーザーを選択してください", "error");
    return;
  }

  const amount = parseFloat(amountEl.value);
  if (!amount || amount <= 0) {
    showMessage("送金額を入力してください", "error");
    return;
  }

  const token = getAuthToken();
  if (!token) {
    showToast("ログインが必要です");
    window.location.href = "/login";
    return;
  }

  sendBtn.disabled = true;
  sendBtn.textContent = "送金中...";
  showMessage("送金処理中...", "");

  try {
    // 送金先ユーザーの情報を確認
    if (!selectedUser.wallet_address) {
      showMessage("送金先ユーザーのウォレットアドレスが取得できませんでした", "error");
      sendBtn.disabled = false;
      sendBtn.textContent = "送金する";
      return;
    }

    // 送金リクエストのデータを準備
    const requestData = {
      recipient_user_id: selectedUser.user_id,
      recipient_wallet_address: selectedUser.wallet_address,
      amount: amount,
      memo: memoEl.value.trim() || null
    };

    console.log("送金リクエストデータ:", requestData);

    // 送金APIを呼び出す
    const response = await fetch("/api/transfer", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(requestData)
    });

    if (!response.ok) {
      let errorMessage = "送金に失敗しました";
      try {
        const error = await response.json();
        errorMessage = error.detail || error.message || errorMessage;
        console.error("送金APIエラー詳細:", error);
      } catch (e) {
        // JSONパースに失敗した場合
        const errorText = await response.text();
        console.error("送金APIエラー（JSON以外）:", response.status, errorText);
        if (response.status === 422) {
          errorMessage = "リクエストの形式が正しくありません。送金先ユーザーを選択してください。";
        } else if (response.status === 401) {
          errorMessage = "認証エラー。再度ログインしてください";
          localStorage.removeItem("japanft_token");
          localStorage.removeItem("japanft_user");
          setTimeout(() => {
            window.location.href = "/login";
          }, 2000);
        }
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    showMessage(`送金が完了しました！${amount} HLCを送金しました。`, "success");
    
    // フォームをリセット
    clearUser();
    amountEl.value = "";
    memoEl.value = "";
    
    // 残高を更新
    await loadBalance();
    
    // 送金履歴を更新
    await loadHistory();
  } catch (error) {
    console.error("送金エラー:", error);
    showMessage(error.message || "送金に失敗しました", "error");
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = "送金する";
  }
}

// メッセージ表示
function showMessage(text, type) {
  if (!messageEl) return;
  messageEl.textContent = text;
  messageEl.className = "message";
  if (type) {
    messageEl.classList.add(type);
  }
}

// 送金履歴を読み込み
async function loadHistory() {
  const token = getAuthToken();
  if (!token) return;

  try {
    const response = await fetch("/api/transfer/history", {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (response.ok) {
      const history = await response.json();
      renderHistory(history);
    }
  } catch (error) {
    console.error("送金履歴取得エラー:", error);
  }
}

// 送金履歴を表示
function renderHistory(history) {
  if (!historyEl) return;

  if (history.length === 0) {
    historyEl.innerHTML = '<div class="muted">送金履歴はありません</div>';
    return;
  }

  historyEl.innerHTML = "";
  history.forEach(item => {
    const historyItem = document.createElement("div");
    historyItem.className = "history-item";
    
    const date = item.created_at ? new Date(item.created_at) : null;
    const dateStr = date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` : "";
    
    historyItem.innerHTML = `
      <div class="history-item-header">
        <div class="history-item-address">${item.recipient_username || "不明"} ${item.recipient_user_tag ? `#${item.recipient_user_tag}` : ""}</div>
        <div class="history-item-amount">
          <span>HLC</span>
          <span>${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      </div>
      ${dateStr ? `<div class="history-item-date">${dateStr}</div>` : ""}
      ${item.memo ? `<div class="history-item-memo">${item.memo}</div>` : ""}
    `;
    historyEl.appendChild(historyItem);
  });
}

// 初期化
function init() {
  // ユーザー検索の入力イベント
  if (recipientEl) {
    recipientEl.addEventListener("input", (e) => {
      const query = e.target.value.trim();
      
      // 選択済みの場合は検索しない
      if (selectedUser) {
        return;
      }
      
      // 既存のタイマーをクリア
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
      
      // 空の場合は検索結果を非表示
      if (!query || query.length < 1) {
        userSearchResultsEl.classList.remove("active");
        return;
      }
      
      // 300ms後に検索（デバウンス）
      searchTimeout = setTimeout(() => {
        searchUsers(query);
      }, 300);
    });

    // 入力欄にフォーカスしたら検索結果を表示（既に入力がある場合）
    recipientEl.addEventListener("focus", () => {
      const query = recipientEl.value.trim();
      if (query && query.length >= 1 && !selectedUser) {
        searchUsers(query);
      }
    });

    // 入力欄からフォーカスが外れたら検索結果を非表示（少し遅延させてクリックイベントを処理）
    recipientEl.addEventListener("blur", () => {
      setTimeout(() => {
        // 検索結果内のクリックイベントが処理されるまで待つ
        if (!document.activeElement || !document.activeElement.closest(".user-search-results")) {
          userSearchResultsEl.classList.remove("active");
        }
      }, 200);
    });
  }

  // ユーザー選択のクリア
  if (clearUserBtn) {
    clearUserBtn.addEventListener("click", clearUser);
  }

  // 送金ボタン
  if (sendBtn) {
    sendBtn.addEventListener("click", sendTransfer);
  }

  // 残高を読み込み
  loadBalance();

  // 送金履歴を読み込み
  loadHistory();

  // カートカウントを更新
  updateCartCount();
}

// DOMContentLoaded時に初期化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

