/**
 * cart.html専用のJavaScript
 * カートの表示と管理
 */

// DOM要素の取得
const grid = document.getElementById("grid");
const toast = document.getElementById("toast");
const cartCountEl = document.getElementById("cartCount");
const itemCountEl = document.getElementById("itemCount");
const totalEthEl = document.getElementById("totalEth");
const emptyMsg = document.getElementById("emptyMsg");
const summary = document.getElementById("summary");
const goCheckoutBtn = document.getElementById("goCheckout");
const clearCartBtn = document.getElementById("clearCart");

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
    const count = getCart().length;
    cartCountEl.textContent = String(count);
  }
}

// カート操作
function removeFromCart(id) {
  const list = getCart().filter(x => x.id !== id);
  setCart(list);
  render();
  showToast("カートから削除しました");
}


// レンダリング
function render() {
  if (!grid) return;
  
  const items = getCart();
  grid.innerHTML = "";
  
  if (items.length === 0) {
    if (emptyMsg) emptyMsg.hidden = false;
    if (summary) summary.hidden = true;
    if (goCheckoutBtn) {
      goCheckoutBtn.style.pointerEvents = "none";
      goCheckoutBtn.style.opacity = "0.5";
    }
  } else {
    if (emptyMsg) emptyMsg.hidden = true;
    if (summary) summary.hidden = false;
    if (goCheckoutBtn) {
      goCheckoutBtn.style.pointerEvents = "auto";
      goCheckoutBtn.style.opacity = "1";
    }
  }
  
  let total = 0;
  items.forEach((nft) => {
    total += nft.priceEth;
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `
      <div class="thumb"><img src="${nft.image}" alt="${nft.name}"></div>
      <div class="content">
        <div class="title">${nft.name}</div>
        <div class="meta">
          <div class="muted">在庫: 1/1</div>
          <div class="price"><span>HLC</span><span>${formatEth(nft.priceEth)}</span></div>
        </div>
        <div class="actions">
          <button class="btn" type="button">削除</button>
          <a class="btn primary" href="/checkout">購入</a>
        </div>
      </div>
    `;
    const removeBtn = card.querySelector(".actions .btn");
    if (removeBtn) removeBtn.addEventListener("click", () => removeFromCart(nft.id));
    grid.appendChild(card);
  });
  
  if (itemCountEl) itemCountEl.textContent = String(items.length);
  if (totalEthEl) totalEthEl.textContent = formatEth(total);
}

// 認証トークンの取得
function getAuthToken() {
  return localStorage.getItem("japanft_token");
}

// イベントリスナー
function initCart() {
  // 決済ページへのリンクはHTMLで設定済み
  // カートが空の場合は決済ページへのリンクを無効化
  if (goCheckoutBtn) {
    const items = getCart();
    if (items.length === 0) {
      goCheckoutBtn.style.pointerEvents = "none";
      goCheckoutBtn.style.opacity = "0.5";
    }
  }
  
  if (clearCartBtn) {
    clearCartBtn.addEventListener("click", () => {
      setCart([]);
      render();
      showToast("カートを空にしました");
    });
  }
  
  updateCartCount();
  render();
}

// 初期化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCart);
} else {
  initCart();
}






