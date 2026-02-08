// user_profile.html用のJavaScript

(function() {
  'use strict';

  // URLからユーザーIDを取得
  const pathParts = window.location.pathname.split('/');
  const userId = pathParts[pathParts.length - 1];

  // DOM要素
  const userNameEl = document.getElementById("userName");
  const userTagEl = document.getElementById("userTag");
  const displayNameEl = document.getElementById("displayName");
  const userTypeEl = document.getElementById("userType");
  const bioEl = document.getElementById("bio");
  const listingsEl = document.getElementById("listings");
  const emptyMsgEl = document.getElementById("emptyMsg");
  const cartCountEl = document.getElementById("cartCount");

  if (!userNameEl || !userTagEl || !displayNameEl || !userTypeEl || !bioEl || !listingsEl || !emptyMsgEl) {
    console.error('必要な要素が見つかりません');
    return;
  }

  // カート機能
  function getCart() {
    try {
      return JSON.parse(localStorage.getItem("nft_cart") || "[]");
    } catch (error) {
      console.error('カートの読み込みエラー:', error);
      return [];
    }
  }

  function updateCartCount() {
    if (cartCountEl) {
      cartCountEl.textContent = String(getCart().length);
    }
  }

  // ユーザー情報を取得
  async function fetchUserInfo() {
    try {
      const response = await fetch(`/api/users/${userId}`);
      if (!response.ok) {
        if (response.status === 404) {
          userNameEl.textContent = "ユーザーが見つかりません";
          return null;
        }
        throw new Error('ユーザー情報の取得に失敗しました');
      }
      return await response.json();
    } catch (error) {
      console.error('ユーザー情報取得エラー:', error);
      userNameEl.textContent = "エラーが発生しました";
      return null;
    }
  }

  // 出品一覧を取得
  async function fetchUserListings() {
    try {
      const response = await fetch(`/api/users/${userId}/listings`);
      if (!response.ok) {
        throw new Error('出品一覧の取得に失敗しました');
      }
      return await response.json();
    } catch (error) {
      console.error('出品一覧取得エラー:', error);
      return [];
    }
  }

  // プロフィール情報を表示
  async function loadProfile() {
    const userInfo = await fetchUserInfo();
    
    if (userInfo) {
      userNameEl.textContent = userInfo.username || 'ユーザー';
      if (userInfo.user_tag) {
        userTagEl.textContent = `#${userInfo.user_tag}`;
      }
      displayNameEl.textContent = userInfo.username || '未設定';
      userTypeEl.textContent = userInfo.user_type === 'seller' ? '出品者' : '一般ユーザー';
      bioEl.textContent = userInfo.bio || '自己紹介がありません';
    } else {
      userNameEl.textContent = "ユーザーが見つかりません";
    }
  }

  // 出品一覧を表示
  async function loadListings() {
    const listings = await fetchUserListings();
    
    if (listings.length === 0) {
      emptyMsgEl.hidden = false;
      listingsEl.innerHTML = '';
      return;
    }
    
    emptyMsgEl.hidden = true;
    listingsEl.innerHTML = '';
    
    listings.forEach(listing => {
      const card = document.createElement('article');
      card.className = 'card';
      card.innerHTML = `
        <div class="thumb">
          <img src="${listing.image || '/static/images/placeholder.png'}" alt="${listing.name}" onerror="this.src='/static/images/placeholder.png'">
        </div>
        <div class="content">
          <div class="title">${escapeHtml(listing.name)}</div>
          ${listing.description ? `<p class="muted">${escapeHtml(listing.description.substring(0, 100))}${listing.description.length > 100 ? '...' : ''}</p>` : ''}
          <div class="price" style="margin-top: 8px;">
            <span>HLC</span>
            <span>${formatEth(listing.priceEth || 0)}</span>
          </div>
          ${listing.blockchain_hash ? `<div class="blockchain-hash" style="margin-top: 8px; font-size: 12px; color: var(--muted);">Hash: ${listing.blockchain_hash.substring(0, 16)}...</div>` : ''}
          <div class="actions" style="margin-top: 12px;">
            <a class="btn primary" href="/product?id=${listing.nft_id}">詳細を見る</a>
          </div>
        </div>
      `;
      listingsEl.appendChild(card);
    });
  }

  function formatEth(v) {
    return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 初期化
  (async function init() {
    try {
      await loadProfile();
      await loadListings();
      updateCartCount();
    } catch (error) {
      console.error('初期化エラー:', error);
    }
  })();
})();

