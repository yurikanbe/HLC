/**
 * 通知機能のJavaScript
 */

// DOM要素の取得
const notificationBtn = document.getElementById("notificationBtn");
const notificationBadge = document.getElementById("notificationBadge");
const notificationDropdown = document.getElementById("notificationDropdown");
const notificationList = document.getElementById("notificationList");
const markAllReadBtn = document.getElementById("markAllReadBtn");

let notificationUpdateInterval = null;

// 認証トークンの取得
function getAuthToken() {
  return localStorage.getItem("japanft_token");
}

// 未読通知数を取得
async function updateNotificationBadge() {
  const token = getAuthToken();
  if (!token) {
    if (notificationBadge) notificationBadge.style.display = "none";
    return;
  }

  try {
    const response = await fetch("/api/notifications/unread-count", {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      const count = data.unread_count || 0;
      
      if (notificationBadge) {
        if (count > 0) {
          notificationBadge.textContent = count > 99 ? "99+" : count;
          notificationBadge.style.display = "block";
        } else {
          notificationBadge.style.display = "none";
        }
      }
    }
  } catch (error) {
    console.error("通知数の取得エラー:", error);
  }
}

// 通知一覧を取得
async function loadNotifications() {
  const token = getAuthToken();
  if (!token) return;

  try {
    const response = await fetch("/api/notifications?limit=20", {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (response.ok) {
      const notifications = await response.json();
      renderNotifications(notifications);
    }
  } catch (error) {
    console.error("通知一覧の取得エラー:", error);
  }
}

// 通知一覧を表示
function renderNotifications(notifications) {
  if (!notificationList) return;

  if (notifications.length === 0) {
    notificationList.innerHTML = '<div class="notification-empty">通知はありません</div>';
    return;
  }

  notificationList.innerHTML = notifications.map(notification => {
    const date = notification.created_at ? new Date(notification.created_at) : null;
    const timeStr = date ? formatTime(date) : "";
    const unreadClass = notification.is_read ? "" : "unread";
    
    return `
      <div class="notification-item ${unreadClass}" data-notification-id="${notification.notification_id}" data-is-read="${notification.is_read}">
        <div class="notification-item-title">${escapeHtml(notification.title)}</div>
        ${notification.message ? `<div class="notification-item-message">${escapeHtml(notification.message)}</div>` : ""}
        <div class="notification-item-time">${timeStr}</div>
      </div>
    `;
  }).join("");

  // 通知アイテムのクリックイベント
  notificationList.querySelectorAll(".notification-item").forEach(item => {
    item.addEventListener("click", async () => {
      const notificationId = parseInt(item.dataset.notificationId);
      const isRead = item.dataset.isRead === "true";
      
      if (!isRead) {
        await markAsRead(notificationId);
        item.classList.remove("unread");
        item.dataset.isRead = "true";
        await updateNotificationBadge();
      }
      
      // 通知タイプに応じて遷移
      const notification = notifications.find(n => n.notification_id === notificationId);
      if (notification) {
        handleNotificationClick(notification);
      }
    });
  });
}

// 通知を既読にする
async function markAsRead(notificationId) {
  const token = getAuthToken();
  if (!token) return;

  try {
    await fetch(`/api/notifications/${notificationId}/read`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });
  } catch (error) {
    console.error("既読処理エラー:", error);
  }
}

// すべて既読にする
async function markAllAsRead() {
  const token = getAuthToken();
  if (!token) return;

  try {
    const response = await fetch("/api/notifications?limit=100", {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (response.ok) {
      const notifications = await response.json();
      const unreadNotifications = notifications.filter(n => !n.is_read);
      
      for (const notification of unreadNotifications) {
        await markAsRead(notification.notification_id);
      }
      
      await loadNotifications();
      await updateNotificationBadge();
    }
  } catch (error) {
    console.error("すべて既読処理エラー:", error);
  }
}

// 通知クリック時の処理
function handleNotificationClick(notification) {
  switch (notification.type) {
    case "purchase":
      // 購入通知の場合は購入履歴ページへ
      window.location.href = "/purchases";
      break;
    case "transfer":
      // 送金通知の場合は送金ページへ
      window.location.href = "/transfer";
      break;
    case "chat":
      // チャット通知の場合はチャットページへ
      window.location.href = "/chat";
      break;
    default:
      break;
  }
}

// 時刻をフォーマット
function formatTime(date) {
  const now = new Date();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) {
    return "たった今";
  } else if (minutes < 60) {
    return `${minutes}分前`;
  } else if (hours < 24) {
    return `${hours}時間前`;
  } else if (days < 7) {
    return `${days}日前`;
  } else {
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  }
}

// HTMLエスケープ
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// 通知ドロップダウンの表示/非表示
function toggleNotificationDropdown() {
  if (!notificationDropdown) return;
  
  const isVisible = notificationDropdown.style.display !== "none";
  
  if (isVisible) {
    notificationDropdown.style.display = "none";
  } else {
    notificationDropdown.style.display = "block";
    loadNotifications();
  }
}

// 初期化
function initNotifications() {
  // 通知ボタンのクリックイベント
  if (notificationBtn) {
    notificationBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleNotificationDropdown();
    });
  }

  // すべて既読ボタンのクリックイベント
  if (markAllReadBtn) {
    markAllReadBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await markAllAsRead();
    });
  }

  // ドロップダウン外をクリックしたら閉じる
  document.addEventListener("click", (e) => {
    if (notificationDropdown && 
        !notificationDropdown.contains(e.target) && 
        !notificationBtn.contains(e.target)) {
      notificationDropdown.style.display = "none";
    }
  });

  // 未読通知数を定期的に更新（30秒ごと）
  updateNotificationBadge();
  notificationUpdateInterval = setInterval(updateNotificationBadge, 30000);
}

// DOMContentLoaded時に初期化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNotifications);
} else {
  initNotifications();
}

// ページを離れるときにインターバルをクリア
window.addEventListener("beforeunload", () => {
  if (notificationUpdateInterval) {
    clearInterval(notificationUpdateInterval);
  }
});

