/**
 * 認証状態管理 - 共通JavaScript
 * ログイン状態に応じてUIを更新
 */

// 認証トークンの取得
function getAuthToken() {
  return localStorage.getItem("japanft_token");
}

// ユーザー情報の取得
function getUserInfo() {
  try {
    const userStr = localStorage.getItem("japanft_user");
    return userStr ? JSON.parse(userStr) : null;
  } catch (error) {
    console.error('ユーザー情報の読み込みエラー:', error);
    return null;
  }
}

// ログイン状態の確認
async function checkAuthStatus() {
  const token = getAuthToken();
  if (!token) {
    console.log("DEBUG: checkAuthStatus - No token found");
    return false;
  }

  console.log("DEBUG: checkAuthStatus - Token found, making request to /api/auth/me");
  console.log("DEBUG: checkAuthStatus - Token:", token.substring(0, 20) + "...");

  try {
    const response = await fetch("/api/auth/me", {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      credentials: "include"  // CORS対応
    });

    console.log("DEBUG: checkAuthStatus - Response status:", response.status);

    if (!response.ok) {
      if (response.status === 401) {
        // トークンが無効（古い形式のトークンの可能性）
        console.log("DEBUG: checkAuthStatus - 401 Unauthorized, removing token");
        console.log("INFO: 古い形式のトークンの可能性があります。再度ログインしてください。");
        localStorage.removeItem("japanft_token");
        localStorage.removeItem("japanft_user");
        return false;
      }
      const errorText = await response.text();
      console.error("DEBUG: checkAuthStatus - Error response:", errorText);
      return false;
    }

    const userInfo = await response.json();
    console.log("DEBUG: checkAuthStatus - User info received:", userInfo);
    // ユーザー情報を更新
    localStorage.setItem("japanft_user", JSON.stringify(userInfo));
    return true;
  } catch (error) {
    console.error("認証状態確認エラー:", error);
    return false;
  }
}

// ログアウト
function logout() {
  localStorage.removeItem("japanft_token");
  localStorage.removeItem("japanft_user");
  window.location.href = "/";
}

// ナビゲーションボタンの更新
async function updateNavigation() {
  const token = getAuthToken();
  const userInfo = getUserInfo();
  
  // トークンがある場合は認証状態を確認
  let isLoggedIn = false;
  if (token) {
    try {
      isLoggedIn = await checkAuthStatus();
    } catch (error) {
      console.error("認証状態確認エラー:", error);
      // エラーが発生した場合、ローカルストレージの情報を使用
      isLoggedIn = !!userInfo;
    }
  }

  // プロフィールボタン、ログインボタン、ログアウトボタンを取得
  const profileButtons = document.querySelectorAll('a[href="/profile"]');
  const loginButtons = document.querySelectorAll('a[href="/login"]');
  const logoutBtn = document.querySelector('a[href="#logout"]');

  if (isLoggedIn && userInfo) {
    // ログインしている場合、プロフィールボタンを表示
    profileButtons.forEach(btn => {
      btn.style.display = 'inline-block';
    });

    // ログインボタンを非表示
    loginButtons.forEach(btn => {
      btn.style.display = 'none';
    });

    // ログアウトボタンを追加（まだ存在しない場合）
    const navActions = document.querySelector('.nav-actions');
    if (navActions) {
      // 既存のログアウトボタンをチェック
      let logoutButton = navActions.querySelector('a[href="#logout"]');
      if (!logoutButton) {
        logoutButton = document.createElement('a');
        logoutButton.className = 'btn';
        logoutButton.href = '#logout';
        logoutButton.textContent = 'ログアウト';
        logoutButton.addEventListener('click', (e) => {
          e.preventDefault();
          if (confirm('ログアウトしますか？')) {
            logout();
          }
        });
        
        // プロフィールボタンの後に挿入
        const profileBtn = navActions.querySelector('a[href="/profile"]');
        if (profileBtn && profileBtn.nextSibling) {
          navActions.insertBefore(logoutButton, profileBtn.nextSibling);
        } else {
          navActions.appendChild(logoutButton);
        }
      }
      logoutButton.style.display = 'inline-block';
    }
  } else {
    // ログインしていない場合、プロフィールボタンを非表示
    profileButtons.forEach(btn => {
      btn.style.display = 'none';
    });

    // ログインボタンを表示
    loginButtons.forEach(btn => {
      btn.style.display = 'inline-block';
    });

    // ログアウトボタンを非表示
    if (logoutBtn) {
      logoutBtn.style.display = 'none';
    }
  }
}

// ページ読み込み時に実行
function initAuth() {
  // 少し遅延させて、他のスクリプトが実行された後に確実に実行されるようにする
  setTimeout(() => {
    updateNavigation();
  }, 100);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuth);
} else {
  initAuth();
}

// ページ遷移時にも実行（SPA的な動作に対応）
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    // ブラウザの戻る/進むボタンでページが復元された場合
    initAuth();
  }
});

// localStorageの変更を監視（別タブでログイン/ログアウトされた場合を検知）
window.addEventListener('storage', (event) => {
  // japanft_tokenまたはjapanft_userが変更された場合
  if (event.key === 'japanft_token' || event.key === 'japanft_user') {
    console.log('認証状態が変更されました。再確認します...');
    // 認証状態を再確認してUIを更新
    setTimeout(() => {
      updateNavigation();
      // ページをリロードして最新の状態を反映
      if (event.key === 'japanft_token') {
        // トークンが削除された場合（ログアウト）は即座にリロード
        if (!event.newValue) {
          window.location.reload();
        } else {
          // トークンが変更された場合（別アカウントでログイン）もリロード
          window.location.reload();
        }
      }
    }, 100);
  }
});

