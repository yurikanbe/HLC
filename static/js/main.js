/**
 * NFT販売所 - メインJavaScript
 * API連携実装済み
 */

// API関数
async function fetchNFTs(params = {}) {
  try {
    const queryParams = new URLSearchParams();
    if (params.q) queryParams.append('q', params.q);
    if (params.category) queryParams.append('category', params.category);
    if (params.sort) queryParams.append('sort', params.sort);
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.offset) queryParams.append('offset', params.offset);
    
    const url = `/api/nfts${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    const token = getAuthToken();
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching NFTs:', error);
    showToast('NFTデータの取得に失敗しました');
    return [];
  }
}

function getAuthToken() {
  return localStorage.getItem('japanft_token');
}

async function toggleLike(nftId) {
  try {
    const token = getAuthToken();
    if (!token) {
      showToast('いいねするにはログインが必要です');
      return null;
    }
    
    const response = await fetch(`/api/nfts/${nftId}/like`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        showToast('ログインが必要です');
        return null;
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error toggling like:', error);
    showToast('いいねの処理に失敗しました');
    return null;
  }
}

async function fetchBlockchainInfo() {
  try {
    const response = await fetch('/api/blockchain/info');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching blockchain info:', error);
    return null;
  }
}

// DOM要素の取得
const popular = document.getElementById("popular");
const toast = document.getElementById("toast");
const cartCount = document.getElementById("cartCount");
const modal = document.getElementById("modal");
const modalSummary = document.getElementById("modalSummary");
const modalClose = document.getElementById("modalClose");
const confirmBuy = document.getElementById("confirmBuy");

// ローカルストレージ管理（フォールバック用）
function seedCatalogIfEmpty() {
  // APIから取得するため、この関数は使用しない
}

let selectedNft = null;

// カート管理
function getCart() {
  try {
    return JSON.parse(localStorage.getItem("nft_cart") || "[]");
  } catch {
    return [];
  }
}

function setCart(list) {
  localStorage.setItem("nft_cart", JSON.stringify(list));
  updateCartCount();
}

// 購入履歴管理
function getPurchases() {
  try {
    return JSON.parse(localStorage.getItem("nft_purchases") || "[]");
  } catch {
    return [];
  }
}

function setPurchases(list) {
  localStorage.setItem("nft_purchases", JSON.stringify(list));
}

// カートカウント更新
function updateCartCount() {
  if (cartCount) {
    cartCount.textContent = String(getCart().length);
  }
}

// ユーティリティ関数
function formatEth(value) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.style.display = "block";
  setTimeout(() => {
    toast.style.display = "none";
  }, 2200);
}

// モーダル管理
function openModal(nft) {
  selectedNft = nft;
  if (modalSummary) {
    modalSummary.textContent = `${nft.name} を ${formatEth(nft.priceEth)} HLC で購入します。`;
  }
  if (modal) {
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
  }
}

function closeModal() {
  if (modal) {
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
  }
  selectedNft = null;
}

// カートに追加
function addToCart(nft) {
  const list = getCart();
  if (!list.some(x => x.id === nft.id)) {
    list.unshift(nft);
    setCart(list);
    showToast("カートに追加しました");
  } else {
    showToast("すでにカートにあります");
  }
}

// NFT一覧のレンダリング
function renderPopular(items) {
  if (!popular) return;
  
  popular.innerHTML = "";
  items.sort((a, b) => b.likes - a.likes).slice(0, 12).forEach((nft) => {
    const card = document.createElement("article");
    card.className = "hcard";
    const likeIcon = nft.is_liked ? '❤️' : '🤍';
    card.innerHTML = `
      <div class="hthumb">
        <img src="${nft.image}" alt="${nft.name}">
        <div class="badge">❤️ ${nft.likes}</div>
      </div>
      <div class="content">
        <div class="title">${nft.name}</div>
        <div class="meta">
          <div class="muted">
            <button class="like-btn" type="button" data-nft-id="${nft.id}" style="background: none; border: none; cursor: pointer; font-size: 1.2em; padding: 0; margin-right: 0.5em;">
              <span class="like-icon">${likeIcon}</span>
            </button>
            <span class="like-count">${nft.likes}</span>
          </div>
          <div class="price"><span>HLC</span><span>${formatEth(nft.priceEth)}</span></div>
        </div>
        <div class="actions">
          <button class="btn" type="button">カート</button>
          <a class="btn purchase-btn" href="/checkout" data-product-id="${nft.id}">購入</a>
          <a class="btn" href="/product?id=${nft.id}">詳細</a>
        </div>
      </div>
    `;
    const addBtn = card.querySelector(".actions .btn");
    if (addBtn) {
      addBtn.addEventListener("click", () => addToCart(nft));
    }
    
    // 購入ボタンのイベントリスナー
    const purchaseBtn = card.querySelector(".purchase-btn");
    if (purchaseBtn) {
      purchaseBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const productId = purchaseBtn.getAttribute('data-product-id') || nft.id;
        if (productId) {
          window.location.href = `/checkout?id=${productId}`;
        } else {
          console.error('商品IDが取得できません');
          showToast('商品IDが取得できませんでした');
        }
      });
    }
    
    // いいねボタンのイベントリスナー
    const likeBtn = card.querySelector('.like-btn');
    const likeIconEl = card.querySelector('.like-icon');
    const likeCountEl = card.querySelector('.like-count');
    if (likeBtn) {
      likeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const result = await toggleLike(nft.id);
        if (result) {
          if (likeIconEl) {
            likeIconEl.textContent = result.is_liked ? '❤️' : '🤍';
          }
          if (likeCountEl) {
            likeCountEl.textContent = result.likes;
          }
          // バッジも更新
          const badge = card.querySelector('.badge');
          if (badge) {
            badge.textContent = `❤️ ${result.likes}`;
          }
          // データも更新
          nft.likes = result.likes;
          nft.is_liked = result.is_liked;
        }
      });
    }
    
    popular.appendChild(card);
  });
}

// 初期化処理
async function init() {
  try {
    // ブロックチェーン情報の取得（オプション）
    const chainInfo = await fetchBlockchainInfo();
    if (chainInfo) {
      console.log('ブロックチェーン情報:', chainInfo);
    }
    
    // APIからNFT一覧を取得（人気順でソート）
    const nfts = await fetchNFTs({ sort: 'hot', limit: 12 });
    
    // 人気NFTの表示
    if (nfts && nfts.length > 0) {
      renderPopular(nfts);
    } else {
      // フォールバック: ローカルストレージから取得
      const localNfts = JSON.parse(localStorage.getItem('japanft_catalog') || '[]');
      if (localNfts.length > 0) {
        renderPopular(localNfts);
      }
    }
  } catch (error) {
    console.error('初期化エラー:', error);
    // フォールバック処理
    const localNfts = JSON.parse(localStorage.getItem('japanft_catalog') || '[]');
    if (localNfts.length > 0) {
      renderPopular(localNfts);
    }
  }
  
  // モーダルのイベントリスナー
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });
  }
  
  if (modalClose) {
    modalClose.addEventListener("click", closeModal);
  }
  
  if (confirmBuy) {
    confirmBuy.addEventListener("click", () => {
      if (!selectedNft) return;
      const purchases = getPurchases();
      purchases.unshift({ ...selectedNft, purchasedAt: Date.now() });
      setPurchases(purchases);
      closeModal();
      showToast(`${selectedNft.name} を購入しました！`);
    });
  }
  
  // カートカウントの更新
  updateCartCount();
}

// DOMContentLoaded時に初期化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/////////////////////////
// ハンバーガーメニュー //
$(function(){
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
});