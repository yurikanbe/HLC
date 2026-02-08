// purchases.html用のJavaScript

(function() {
  'use strict';

  const grid = document.getElementById("grid");
  const emptyMsg = document.getElementById("emptyMsg");
  const cartCountEl = document.getElementById("cartCount");

  if (!grid || !emptyMsg || !cartCountEl) {
    console.error('必要な要素が見つかりません');
    return;
  }

  function formatEth(value) {
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // 認証トークンの取得
  function getAuthToken() {
    return localStorage.getItem("japanft_token");
  }

  // APIから購入履歴を取得
  async function fetchPurchases() {
    const token = getAuthToken();
    if (!token) {
      console.log("ログインが必要です");
      return [];
    }

    try {
      const response = await fetch("/api/purchases", {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          console.log("認証エラー。再度ログインしてください");
          localStorage.removeItem("japanft_token");
          localStorage.removeItem("japanft_user");
          window.location.href = "/login";
          return [];
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const purchases = await response.json();
      return purchases;
    } catch (error) {
      console.error('購入履歴の取得エラー:', error);
      return [];
    }
  }

  // 購入履歴からNFT情報を取得
  async function getNFTDetails(nftId) {
    try {
      const response = await fetch(`/api/nfts/${nftId}`);
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error(`NFT ${nftId} の取得エラー:`, error);
      return null;
    }
  }

  // NFTの取引履歴を取得
  async function getNFTTransactionHistory(nftId) {
    const token = getAuthToken();
    if (!token) {
      return [];
    }

    try {
      const response = await fetch(`/api/nfts/${nftId}/transaction-history`, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        return [];
      }

      return await response.json();
    } catch (error) {
      console.error(`NFT ${nftId} の取引履歴取得エラー:`, error);
      return [];
    }
  }

  function getAccessMap() {
    try {
      return JSON.parse(localStorage.getItem("nft_access_tokens") || "{}");
    } catch (error) {
      console.error('アクセストークンマップの読み込みエラー:', error);
      return {};
    }
  }

  function setAccessMap(map) {
    try {
      localStorage.setItem("nft_access_tokens", JSON.stringify(map));
    } catch (error) {
      console.error('アクセストークンマップの保存エラー:', error);
    }
  }

  function randomToken() {
    try {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      console.warn('crypto.getRandomValuesが使用できないため、代替方法を使用:', error);
      return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    }
  }

  function buildUrl(pid, token) {
    return `/view?pid=${encodeURIComponent(pid)}&t=${encodeURIComponent(token)}`;
  }

  function issueUrl(pid) {
    const map = getAccessMap();
    const token = randomToken();
    map[pid] = { token, createdAt: Date.now() };
    setAccessMap(map);
    return buildUrl(pid, token);
  }

  function ensureUrl(pid) {
    const map = getAccessMap();
    if (map[pid] && map[pid].token) {
      return buildUrl(pid, map[pid].token);
    }
    return issueUrl(pid);
  }

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

  async function render() {
    try {
      grid.innerHTML = "<div class='muted'>読み込み中...</div>";
      
      const purchases = await fetchPurchases();
      
      if (purchases.length === 0) {
        emptyMsg.hidden = false;
        grid.innerHTML = "";
        return;
      }
      
      emptyMsg.hidden = true;
      grid.innerHTML = "";
      
      // 各購入履歴についてNFT情報を取得
      for (const purchase of purchases) {
        const nft = await getNFTDetails(purchase.nft_id);
        if (!nft) {
          console.warn(`NFT ${purchase.nft_id} の情報が取得できませんでした`);
          continue;
        }
        
        // 取引履歴を取得
        const transactionHistory = await getNFTTransactionHistory(purchase.nft_id);
        
        const card = document.createElement("article");
        card.className = "card";
        const date = purchase.transaction_date ? new Date(purchase.transaction_date) : null;
        const dateStr = date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` : "";
        
        // 取引履歴のHTMLを生成
        let historyHTML = "";
        if (transactionHistory.length > 0) {
          historyHTML = '<div class="transaction-history" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border);">';
          historyHTML += '<div class="muted" style="font-size: 12px; margin-bottom: 8px;">取引履歴:</div>';
          transactionHistory.forEach((tx, index) => {
            const txDate = tx.transaction_date ? new Date(tx.transaction_date) : null;
            const txDateStr = txDate ? `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}-${String(txDate.getDate()).padStart(2, '0')}` : "";
            historyHTML += `<div style="font-size: 11px; color: var(--muted); margin-bottom: 4px;">`;
            historyHTML += `${tx.seller_username} → ${tx.buyer_username} (${formatEth(tx.price)} HLC)`;
            if (txDateStr) {
              historyHTML += ` <span style="opacity: 0.7;">${txDateStr}</span>`;
            }
            historyHTML += `</div>`;
          });
          historyHTML += '</div>';
        }
        
        card.innerHTML = `
          <div class="thumb"><img src="${nft.image}" alt="${nft.name}"></div>
          <div class="content">
            <div class="title">${nft.name}</div>
            <div class="meta">
              <div class="muted">購入日: ${dateStr}</div>
              <div class="price"><span>HLC</span><span>${formatEth(purchase.price)}</span></div>
            </div>
            ${historyHTML}
            <div class="card-actions">
              <a class="btn" href="/product?id=${nft.id}">詳細を見る</a>
              <a class="btn" href="${ensureUrl(nft.id)}" target="_blank">閲覧する</a>
            </div>
          </div>
        `;
        grid.appendChild(card);
      }
    } catch (error) {
      console.error('レンダリングでエラーが発生しました:', error);
      grid.innerHTML = "<div class='muted'>エラーが発生しました。ページを再読み込みしてください。</div>";
    }
  }

  updateCartCount();
  render();
})();

