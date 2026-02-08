/**
 * checkout.html専用のJavaScript
 * カートの確認と決済処理
 */

// DOM要素の取得
const listEl = document.getElementById("list");
const totalEl = document.getElementById("total");
const cartCountEl = document.getElementById("cartCount");
const payBtn = document.getElementById("pay");
const msgEl = document.getElementById("msg");
const emailEl = document.getElementById("email");

// URLパラメータを取得
function getQueryParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    id: params.get('id')
  };
}

// NFT情報をAPIから取得
async function fetchNFT(nftId) {
  try {
    const token = getAuthToken();
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`/api/nfts/${nftId}`, { headers });
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('NFTが見つかりません');
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching NFT:', error);
    throw error;
  }
}

// 認証トークンの取得
function getAuthToken() {
  return localStorage.getItem("japanft_token");
}

// ローカルストレージ管理
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

function updateCartCount() {
  if (cartCountEl) {
    cartCountEl.textContent = String(getCart().length);
  }
}

function fmt(v) {
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// カート一覧のレンダリング
function render() {
  if (!listEl || !totalEl) return;
  
  const items = getCart();
  listEl.innerHTML = "";
  let total = 0;
  
  items.forEach(nft => {
    total += nft.priceEth;
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <img src="${nft.image}" alt="${nft.name}">
      <div>
        <div class="row-title">${nft.name}</div>
        <div class="muted">在庫: 1/1</div>
      </div>
      <div class="row-price"><span>HLC</span>${fmt(nft.priceEth)}</div>
    `;
    listEl.appendChild(row);
  });
  
  totalEl.textContent = fmt(total);
}

// URLパラメータから商品IDを取得してカートに追加
async function handleUrlParam() {
  const params = getQueryParams();
  
  if (params.id) {
    try {
      // NFT情報を取得
      const nft = await fetchNFT(params.id);
      
      // カートに既に存在するか確認
      const cart = getCart();
      const exists = cart.some(item => item.id === nft.id);
      
      if (!exists) {
        // カートに追加
        cart.unshift({
          id: nft.id,
          name: nft.name,
          image: nft.image,
          priceEth: nft.priceEth
        });
        setCart(cart);
      }
      
      // URLからidパラメータを削除（リロード時に重複追加を防ぐ）
      const url = new URL(window.location);
      url.searchParams.delete('id');
      window.history.replaceState({}, '', url);
      
      // レンダリングを更新
      render();
    } catch (error) {
      console.error('商品情報の取得に失敗しました:', error);
      if (msgEl) {
        msgEl.textContent = '商品情報の取得に失敗しました: ' + error.message;
        msgEl.style.color = 'red';
      }
    }
  }
}

// 決済処理
async function initCheckout() {
  if (!payBtn) return;
  
  payBtn.addEventListener("click", async () => {
    const token = getAuthToken();
    if (!token) {
      if (msgEl) msgEl.textContent = "ログインが必要です";
      window.location.href = "/login";
      return;
    }
    
    const items = getCart();
    if (items.length === 0) {
      if (msgEl) msgEl.textContent = "カートが空です";
      return;
    }
    
    // ローディング状態
    payBtn.disabled = true;
    if (msgEl) msgEl.textContent = "決済処理中...";
    
    try {
      // APIに購入リクエストを送信
      const nftIds = items.map(item => item.id);
      const response = await fetch("/api/purchases", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          nft_ids: nftIds
        })
      });
      
      if (!response.ok) {
        let errorMessage = "決済に失敗しました";
        try {
          const error = await response.json();
          errorMessage = error.detail || error.message || errorMessage;
          console.error("決済APIエラー詳細:", error);
        } catch (e) {
          console.error("エラーレスポンスのパースに失敗:", e);
          // JSONパースに失敗した場合はデフォルトメッセージを使用
          if (response.status === 401) {
            errorMessage = "認証エラー。再度ログインしてください";
            localStorage.removeItem("japanft_token");
            localStorage.removeItem("japanft_user");
            setTimeout(() => {
              window.location.href = "/login";
            }, 2000);
          } else if (response.status === 400) {
            errorMessage = "購入できないNFTが含まれています";
          } else if (response.status === 404) {
            errorMessage = "NFTが見つかりません";
          }
        }
        throw new Error(errorMessage);
      }
      
      const purchases = await response.json();
      
      // カートをクリア
      setCart([]);
      render();
      
      if (msgEl) {
        msgEl.textContent = `決済が完了しました！${purchases.length}件のNFTを購入しました。`;
        msgEl.style.color = "green";
      }
      
      // 購入履歴ページにリダイレクト（3秒後）
      setTimeout(() => {
        window.location.href = "/purchases";
      }, 3000);
      
    } catch (error) {
      console.error("決済エラー:", error);
      if (msgEl) {
        msgEl.textContent = error.message || "決済に失敗しました";
        msgEl.style.color = "red";
      }
      payBtn.disabled = false;
    }
  });
  
  updateCartCount();
  render();
}

// 初期化
async function init() {
  // URLパラメータから商品をカートに追加
  await handleUrlParam();
  
  // 決済処理の初期化
  initCheckout();
  
  // カートカウントとレンダリング
  updateCartCount();
  render();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}



