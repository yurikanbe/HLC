// view.html用のJavaScript

(function() {
  'use strict';

  function parseQuery() {
    const p = new URLSearchParams(location.search);
    return { pid: p.get('pid'), t: p.get('t') };
  }

  // 認証トークンの取得
  function getAuthToken() {
    return localStorage.getItem("japanft_token");
  }

  // APIから購入履歴を取得
  async function getPurchases() {
    const token = getAuthToken();
    if (!token) {
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
          localStorage.removeItem("japanft_token");
          localStorage.removeItem("japanft_user");
          return [];
        }
        return [];
      }

      const purchases = await response.json();
      return purchases;
    } catch (error) {
      console.error('購入履歴の取得エラー:', error);
      return [];
    }
  }

  function getAccessMap() {
    try {
      return JSON.parse(localStorage.getItem('nft_access_tokens') || '{}');
    } catch (error) {
      console.error('アクセストークンマップの読み込みエラー:', error);
      return {};
    }
  }

  const notice = document.getElementById('notice');
  const viewer = document.getElementById('viewer');
  const title = document.getElementById('title');
  const image = document.getElementById('image');
  const meta = document.getElementById('meta');

  if (!notice || !viewer || !title || !image || !meta) {
    console.error('必要な要素が見つかりません');
    return;
  }

  // NFT情報を取得
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

  // DOMContentLoadedを待ってから実行
  function runInit() {
    (async function init() {
      try {
        const { pid, t } = parseQuery();
      
        if (!pid) {
          notice.hidden = false;
          notice.textContent = '無効なURLです（pid がありません）';
          return;
        }
        
        const purchases = await getPurchases();
        
        // pidを数値に変換して比較
        const pidNum = parseInt(pid, 10);
        const purchase = purchases.find(x => {
          // nft_idとpidを数値として比較
          return x.nft_id === pidNum || String(x.nft_id) === String(pid);
        });
        
        if (!purchase) {
          notice.hidden = false;
          notice.innerHTML = 'この作品は購入履歴にありません。<a class="btn" href="/purchases">購入履歴へ</a>';
          return;
        }
      
      // NFT情報を取得
      const nft = await getNFTDetails(purchase.nft_id);
      if (!nft) {
        notice.hidden = false;
        notice.textContent = 'NFT情報の取得に失敗しました';
        return;
      }
      
      const map = getAccessMap();
      const rec = map[pid];
      
      if (!rec || !rec.token) {
        notice.hidden = false;
        notice.innerHTML = '閲覧URLが発行されていません。<a class="btn" href="/access">URLを発行</a>';
        return;
      }
      
      if (!t || t !== rec.token) {
        notice.hidden = false;
        notice.textContent = 'アクセス権がありません（トークンが無効です）';
        return;
      }
      
      // OK: show content
      title.textContent = nft.name;
      image.src = nft.image;
      image.alt = nft.name;
      const purchaseDate = purchase.transaction_date ? new Date(purchase.transaction_date) : null;
      meta.textContent = `購入日: ${purchaseDate ? purchaseDate.toLocaleString('ja-JP') : ''}`;
      notice.hidden = true;
      viewer.hidden = false;
    } catch (error) {
      console.error('初期化でエラーが発生しました:', error);
      if (notice) {
        notice.hidden = false;
        notice.textContent = 'エラーが発生しました。ページを再読み込みしてください。';
      }
    }
    })();
  }
  
  // DOMContentLoadedを待つ
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runInit);
  } else {
    runInit();
  }
})();

