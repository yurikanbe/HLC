// profile.html用のJavaScript

(function() {
  'use strict';

  const displayNameEl = document.getElementById("displayName");
  const walletAddressEl = document.getElementById("walletAddress");
  const bioEl = document.getElementById("bio");
  const saveBtn = document.getElementById("saveProfile");
  const listingsEl = document.getElementById("listings");
  const emptyMsg = document.getElementById("emptyMsg");
  const cartCountEl = document.getElementById("cartCount");
  const profileImageInput = document.getElementById("profileImageInput");
  const profileImagePreview = document.getElementById("profileImagePreview");
  const profileImagePlaceholder = document.getElementById("profileImagePlaceholder");
  const profileImageInitial = document.getElementById("profileImageInitial");
  const removeProfileImageBtn = document.getElementById("removeProfileImage");

  if (!displayNameEl || !walletAddressEl || !bioEl || !saveBtn || !listingsEl || !emptyMsg || !cartCountEl) {
    console.error('必要な要素が見つかりません');
    return;
  }

  // 未保存の変更を追跡
  let hasUnsavedChanges = false;
  let initialDisplayName = '';
  let initialBio = '';
  let initialProfileImageUrl = '';
  let isProfileImageRemoved = false; // プロフィール画像が削除されたかどうか

  function getCart() {
    try {
      return JSON.parse(localStorage.getItem("nft_cart") || "[]");
    } catch (error) {
      console.error('カートの読み込みエラー:', error);
      return [];
    }
  }

  function updateCartCount() {
    cartCountEl.textContent = String(getCart().length);
  }

  // トーストメッセージ表示
  function showToast(message) {
    let toast = document.getElementById("toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "toast";
      toast.className = "toast";
      document.body.appendChild(toast);
    }
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

  function getProfile() {
    try {
      return JSON.parse(localStorage.getItem("japanft_profile") || "{}");
    } catch (error) {
      console.error('プロフィールの読み込みエラー:', error);
      return {};
    }
  }

  function setProfile(p) {
    try {
      localStorage.setItem("japanft_profile", JSON.stringify(p));
    } catch (error) {
      console.error('プロフィールの保存エラー:', error);
    }
  }

  // 出品データ（APIから取得）
  async function getListings() {
    const token = getAuthToken();
    if (!token) {
      return [];
    }
    return await fetchMyListings();
  }

  function formatEth(v) {
    return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  async function renderListings() {
    try {
      listingsEl.innerHTML = "<div class='muted'>読み込み中...</div>";
      const items = await getListings();
      listingsEl.innerHTML = "";
      
      if (items.length === 0) {
        emptyMsg.hidden = false;
        return;
      }
      
      emptyMsg.hidden = true;
      items.forEach(listing => {
        const card = document.createElement("article");
        card.className = "card";
        const statusText = listing.status === "sold" ? "SOLD" : listing.status === "active" ? "販売中" : "キャンセル";
        const statusColor = listing.status === "sold" ? "red" : listing.status === "active" ? "green" : "gray";
        card.innerHTML = `
          <div class="thumb">
            <img src="${listing.image}" alt="${listing.name}">
          </div>
          <div class="content">
            <div class="title">${listing.name}</div>
            <div class="meta">
              <div class="muted">状態: <span style="color: ${statusColor}">${statusText}</span></div>
              <div class="price"><span>HLC</span><span>${formatEth(listing.priceEth || 0)}</span></div>
            </div>
            <div class="card-actions">
              <a class="btn" href="/product?id=${listing.nft_id}">詳細を見る</a>
            </div>
          </div>
        `;
        listingsEl.appendChild(card);
      });
    } catch (error) {
      console.error('出品一覧のレンダリングでエラーが発生しました:', error);
      listingsEl.innerHTML = "<div class='muted'>エラーが発生しました。ページを再読み込みしてください。</div>";
    }
  }

  // 認証関連（auth.jsの関数を使用）
  // getAuthToken()はauth.jsで定義されている

  async function fetchUserInfo() {
    const token = getAuthToken();
    if (!token) {
      return null;
    }

    try {
      const response = await fetch("/api/auth/me", {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        credentials: "include"
      });

      if (!response.ok) {
        if (response.status === 401) {
          // トークンが無効
          localStorage.removeItem("japanft_token");
          localStorage.removeItem("japanft_user");
          return null;
        }
        throw new Error("ユーザー情報の取得に失敗しました");
      }

      const userInfo = await response.json();
      return userInfo;
    } catch (error) {
      console.error("ユーザー情報取得エラー:", error);
      return null;
    }
  }

  // デフォルトアイコンのパス
  const DEFAULT_ICON_PATH = '/static/img/default_icon.png';

  // プロフィール画像の表示を更新
  function updateProfileImageDisplay(profileImageUrl, username) {
    if (profileImageUrl) {
      if (profileImagePreview) {
        profileImagePreview.src = profileImageUrl;
        profileImagePreview.style.display = 'block';
      }
      if (profileImagePlaceholder) {
        profileImagePlaceholder.style.display = 'none';
      }
      if (removeProfileImageBtn) {
        removeProfileImageBtn.style.display = 'inline-block';
      }
    } else {
      // プロフィール画像がない場合はデフォルトアイコンを表示
      if (profileImagePreview) {
        profileImagePreview.src = DEFAULT_ICON_PATH;
        profileImagePreview.style.display = 'block';
      }
      if (profileImagePlaceholder) {
        profileImagePlaceholder.style.display = 'none';
      }
      if (removeProfileImageBtn) {
        removeProfileImageBtn.style.display = 'none';
      }
    }
  }

  async function loadProfile() {
    // まずAPIからユーザー情報を取得
    const userInfo = await fetchUserInfo();
    
    if (userInfo) {
      // ログインしている場合、APIから取得した情報を表示
      if (userInfo.username) displayNameEl.value = userInfo.username;
      if (userInfo.wallet_address) {
        walletAddressEl.value = userInfo.wallet_address;
        walletAddressEl.readOnly = true; // ウォレットアドレスは変更不可
        walletAddressEl.title = "ウォレットアドレスは変更できません";
      }
      if (userInfo.bio) bioEl.value = userInfo.bio;
      
      // プロフィール画像を表示
      updateProfileImageDisplay(userInfo.profile_image_url, userInfo.username);
      
      // 初期値を保存（変更検知用）
      initialDisplayName = displayNameEl.value.trim();
      initialBio = bioEl.value.trim();
      initialProfileImageUrl = userInfo.profile_image_url || '';
      hasUnsavedChanges = false;
      isProfileImageRemoved = false;
      
      // 残高を表示
      await updateBalanceDisplay();
      
      // ログインしている場合は保存ボタンを有効化
      saveBtn.disabled = false;
      saveBtn.title = "";
    } else {
      // ログインしていない場合、フィールドをクリア
      displayNameEl.value = "";
      walletAddressEl.value = "";
      bioEl.value = "";
      
      // プレースホルダーを設定
      displayNameEl.placeholder = "ログインが必要です";
      walletAddressEl.placeholder = "ログインが必要です";
      bioEl.placeholder = "ログインが必要です";
      
      // フィールドを無効化
      displayNameEl.disabled = true;
      walletAddressEl.disabled = true;
      bioEl.disabled = true;
      
      // 保存ボタンを無効化
      saveBtn.disabled = true;
      saveBtn.title = "ログインが必要です";
    }
  }

  async function fetchMyListings() {
    const token = getAuthToken();
    if (!token) {
      return [];
    }

    try {
      const response = await fetch("/api/profile/listings", {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          return [];
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('出品一覧の取得エラー:', error);
      return [];
    }
  }

  // 変更を検知してフラグを更新
  function checkForChanges() {
    const currentDisplayName = displayNameEl.value.trim();
    const currentBio = bioEl.value.trim();
    // 削除された場合は空文字列、そうでない場合は現在の画像URL（デフォルトアイコンは除外）
    const currentProfileImageUrl = isProfileImageRemoved 
      ? '' 
      : (profileImagePreview && profileImagePreview.style.display !== 'none' && profileImagePreview.src && !profileImagePreview.src.includes(DEFAULT_ICON_PATH))
        ? profileImagePreview.src 
        : '';
    
    hasUnsavedChanges = 
      currentDisplayName !== initialDisplayName ||
      currentBio !== initialBio ||
      currentProfileImageUrl !== initialProfileImageUrl;
  }

  // 残高を取得して表示
  async function updateBalanceDisplay() {
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
        // 残高表示用の要素を探す（存在しない場合は作成）
        let balanceEl = document.getElementById("balanceDisplay");
        if (!balanceEl) {
          // ウォレットアドレス入力欄の後に残高表示を追加
          const row = walletAddressEl.parentElement;
          balanceEl = document.createElement("div");
          balanceEl.id = "balanceDisplay";
          balanceEl.className = "muted";
          balanceEl.style.marginTop = "8px";
          row.appendChild(balanceEl);
        }
        balanceEl.textContent = `残高: ${data.total_balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}HLC`;
      }
    } catch (error) {
      console.error("残高取得エラー:", error);
    }
  }

  saveBtn.addEventListener("click", async () => {
    try {
      const token = getAuthToken();
      
      if (!token) {
        alert("ログインが必要です");
        window.location.href = "/login";
        return;
      }
      
      // 名前の空白チェック
      const username = displayNameEl.value.trim();
      if (!username) {
        alert("名前が空白です");
        saveBtn.disabled = false;
        saveBtn.textContent = "保存";
        return;
      }
      
      // ローディング状態
      saveBtn.disabled = true;
      saveBtn.textContent = "保存中...";
      
      // APIに保存（ウォレットアドレスは送信しない）
      const bio = bioEl.value.trim();
      // 画像が削除された場合は空文字列、そうでない場合は現在の画像URLを送信（デフォルトアイコンは除外）
      let profileImageUrl = null;
      if (isProfileImageRemoved) {
        // 削除フラグが立っている場合は空文字列を送信（サーバー側で削除される）
        profileImageUrl = '';
      } else if (profileImagePreview && profileImagePreview.style.display !== 'none' && profileImagePreview.src) {
        // プレビューが表示されていて、srcがある場合
        const src = profileImagePreview.src.trim();
        // 空文字列やデフォルトアイコンのパスでない場合のみURLを設定
        if (src && src !== '' && !src.includes(DEFAULT_ICON_PATH)) {
          profileImageUrl = src;
        }
      }
      
      console.log('保存するプロフィール画像URL:', profileImageUrl, 'isProfileImageRemoved:', isProfileImageRemoved);
      
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          username: username || null,
          bio: bio || null,
          profile_image_url: profileImageUrl
        })
      });
      
      if (!response.ok) {
        let errorMessage = "プロフィールの保存に失敗しました";
        try {
          const error = await response.json();
          errorMessage = error.detail || error.message || errorMessage;
        } catch (e) {
          if (response.status === 401) {
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
      
      const updatedProfile = await response.json();
      
      // プロフィール画像の表示を更新
      updateProfileImageDisplay(updatedProfile.profile_image_url, updatedProfile.username);
      
      // ローカルストレージも更新
      const p = getProfile();
      p.displayName = updatedProfile.username;
      p.bio = updatedProfile.bio;
      setProfile(p);
      
      // 初期値を更新して未保存フラグをリセット
      initialDisplayName = updatedProfile.username || '';
      initialBio = updatedProfile.bio || '';
      initialProfileImageUrl = updatedProfile.profile_image_url || '';
      hasUnsavedChanges = false;
      isProfileImageRemoved = false;
      
      alert("プロフィールを保存しました");
      
    } catch (error) {
      console.error('プロフィール保存でエラーが発生しました:', error);
      alert(error.message || "プロフィールの保存に失敗しました");
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "保存";
    }
  });

  // 即座にログインチェックを実行
  (function init() {
    // ログイン状態を確認（即座にチェック）
    const token = localStorage.getItem("japanft_token");
    
    if (!token) {
      // ログインしていない場合は即座にログインページにリダイレクト
      window.location.replace("/login");
      return;
    }
    
    // トークンが有効か確認（非同期）
    (async function() {
      const userInfo = await fetchUserInfo();
      if (!userInfo) {
        // トークンが無効な場合はログインページにリダイレクト
        window.location.replace("/login");
        return;
      }
      
      await loadProfile();
      await renderListings();
      updateCartCount();
      
      // 変更検知のイベントリスナー
      displayNameEl.addEventListener('input', checkForChanges);
      bioEl.addEventListener('input', checkForChanges);
      
      // beforeunloadイベントリスナー（未保存の変更がある場合に警告）
      window.addEventListener('beforeunload', function (event) {
        if (hasUnsavedChanges) {
          event.preventDefault();
          event.returnValue = '';
        }
      });
      
      // プロフィール画像アップロードのイベントリスナー
      if (profileImageInput) {
        profileImageInput.addEventListener('change', async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          
          if (!file.type.startsWith('image/')) {
            alert('画像ファイルを選択してください');
            return;
          }
          
          try {
            // ファイルをアップロード
            const formData = new FormData();
            formData.append('file', file);
            
            const token = getAuthToken();
            const uploadResponse = await fetch('/api/upload', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`
              },
              body: formData
            });
            
            if (!uploadResponse.ok) {
              throw new Error('画像のアップロードに失敗しました');
            }
            
            const uploadData = await uploadResponse.json();
            
            // プレビューを更新
            if (profileImagePreview) {
              profileImagePreview.src = uploadData.url;
              profileImagePreview.style.display = 'block';
            }
            if (profileImagePlaceholder) {
              profileImagePlaceholder.style.display = 'none';
            }
            if (removeProfileImageBtn) {
              removeProfileImageBtn.style.display = 'inline-block';
            }
            
            // 画像がアップロードされたので削除フラグをリセット
            isProfileImageRemoved = false;
            
            // 変更を検知
            checkForChanges();
          } catch (error) {
            console.error('画像アップロードエラー:', error);
            alert(error.message || '画像のアップロードに失敗しました');
          }
        });
      }
      
      // プロフィール画像削除のイベントリスナー
      if (removeProfileImageBtn) {
        removeProfileImageBtn.addEventListener('click', () => {
          // デフォルトアイコンを表示
          if (profileImagePreview) {
            profileImagePreview.src = DEFAULT_ICON_PATH;
            profileImagePreview.style.display = 'block';
          }
          if (profileImagePlaceholder) {
            profileImagePlaceholder.style.display = 'none';
          }
          if (profileImageInput) {
            profileImageInput.value = '';
          }
          removeProfileImageBtn.style.display = 'none';
          
          // 画像が削除されたことを記録
          isProfileImageRemoved = true;
          
          // 変更を検知
          checkForChanges();
        });
      }
    })();
  })();
})();

/////////////////////////
// ハンバーガーメニュー //
/*$(function(){
  $(".hamburger").click(function () {
    $(this).toggleClass("active");
    $(".nav-actions").toggleClass("active");
    $(".overlay").toggleClass("active");
  });
  
  $(".navi a").click(function () {
    $(".hamburger").removeClass("active");
    $(".nav-actions").removeClass("active");
    $(".overlay").removeClass("active");
  });

  $(".mask").click(function(){
    $(".hamburger").removeClass("active");
    $(".nav-actions").removeClass("active");
    $(".overlay").removeClass("active");
  });
});*/

/////////////////////////
document.addEventListener("DOMContentLoaded", () => {
  const hamburger = document.querySelector(".hamburger");
  const nav = document.querySelector(".nav-actions");
  const overlay = document.querySelector(".overlay");

  let scrollY = 0;

  if (!hamburger || !nav) return;

  // スクロール完全停止用
  const preventScroll = (e) => {
    e.preventDefault();
  };

  function lockScroll() {
    scrollY = window.scrollY;
    document.body.style.top = `-${scrollY}px`;
    document.body.classList.add("menu-open");

    // スマホ・PC両対応でスクロール殺す
    document.addEventListener("touchmove", preventScroll, { passive: false });
    document.addEventListener("wheel", preventScroll, { passive: false });
  }

  function unlockScroll() {
    document.body.classList.remove("menu-open");
    document.body.style.top = "";
    window.scrollTo(0, scrollY);

    document.removeEventListener("touchmove", preventScroll);
    document.removeEventListener("wheel", preventScroll);
  }

  hamburger.addEventListener("click", () => {
    const isOpen = hamburger.classList.toggle("active");
    nav.classList.toggle("active", isOpen);
    if (overlay) overlay.classList.toggle("active", isOpen);

    if (isOpen) {
      lockScroll();
    } else {
      unlockScroll();
    }
  });

  if (overlay) {
    overlay.addEventListener("click", () => {
      hamburger.classList.remove("active");
      nav.classList.remove("active");
      overlay.classList.remove("active");
      unlockScroll();
    });
  }

  nav.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      hamburger.classList.remove("active");
      nav.classList.remove("active");
      if (overlay) overlay.classList.remove("active");
      unlockScroll();
    });
  });
});





