// access.html用のJavaScript

(function() {
  'use strict';

  const grid = document.getElementById("grid");
  const emptyMsg = document.getElementById("emptyMsg");

  if (!grid || !emptyMsg) {
    console.error('必要な要素が見つかりません');
    return;
  }

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem("japanft_session") || "null");
    } catch (error) {
      console.error('セッションの読み込みエラー:', error);
      return null;
    }
  }

  function getPurchases() {
    try {
      return JSON.parse(localStorage.getItem("nft_purchases") || "[]");
    } catch (error) {
      console.error('購入履歴の読み込みエラー:', error);
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

  function issueUrl(purchaseId) {
    const map = getAccessMap();
    const token = randomToken();
    map[purchaseId] = { token, createdAt: Date.now() };
    setAccessMap(map);
    return buildUrl(purchaseId, token);
  }

  function ensureUrl(purchaseId) {
    const map = getAccessMap();
    if (map[purchaseId] && map[purchaseId].token) {
      return buildUrl(purchaseId, map[purchaseId].token);
    }
    return issueUrl(purchaseId);
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        alert("URLをコピーしました");
      }).catch(error => {
        console.error('クリップボードへのコピーに失敗しました:', error);
        fallbackCopyToClipboard(text);
      });
    } else {
      fallbackCopyToClipboard(text);
    }
  }

  function fallbackCopyToClipboard(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      alert("URLをコピーしました");
    } catch (error) {
      console.error('フォールバックコピーに失敗しました:', error);
      alert("URLのコピーに失敗しました");
    }
  }

  function render() {
    try {
      const session = getSession();
      const items = getPurchases();
      grid.innerHTML = "";
      
      if (!session) {
        emptyMsg.hidden = false;
        emptyMsg.textContent = "ログインが必要です";
        return;
      }
      
      if (items.length === 0) {
        emptyMsg.hidden = false;
        emptyMsg.textContent = "購入済みの商品がありません。";
        return;
      }
      
      emptyMsg.hidden = true;

      items.forEach(nft => {
        const card = document.createElement("article");
        card.className = "card";
        card.innerHTML = `
          <div class="thumb"><img src="${nft.image}" alt="${nft.name}"></div>
          <div class="content">
            <div class="card-title">${nft.name}</div>
            <div class="urlbox">
              <input class="input" id="url_${nft.id}" readonly value="${ensureUrl(nft.id)}">
              <div class="row">
                <button class="btn" type="button" data-action="copy">コピー</button>
                <button class="btn" type="button" data-action="reissue">URL再発行</button>
                <a class="btn primary" href="${ensureUrl(nft.id)}" target="_blank">閲覧ページを開く</a>
              </div>
            </div>
          </div>
        `;
        
        const copyBtn = card.querySelector('[data-action="copy"]');
        const reBtn = card.querySelector('[data-action="reissue"]');
        const input = card.querySelector('#url_' + nft.id);
        
        copyBtn.addEventListener('click', () => copyToClipboard(input.value));
        reBtn.addEventListener('click', () => {
          input.value = issueUrl(nft.id);
        });
        
        grid.appendChild(card);
      });
    } catch (error) {
      console.error('レンダリングでエラーが発生しました:', error);
    }
  }

  render();
})();

