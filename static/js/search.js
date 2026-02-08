// search.html用のJavaScript

(function() {
  'use strict';

  const urlParams = new URLSearchParams(location.search);
  const query = urlParams.get('q') || '';
  const sortParam = urlParams.get('sort') || '';
  const sortEl = document.getElementById('sort');
  const grid = document.getElementById('grid');
  const empty = document.getElementById('empty');
  const q2 = document.getElementById('q2');

  if (!sortEl || !grid || !empty || !q2) {
    console.error('必要な要素が見つかりません');
    return;
  }

  q2.value = query;
  
  // URLパラメータからsortが指定されている場合は、ソートセレクトボックスに反映
  if (sortParam) {
    sortEl.value = sortParam;
  }
  
  // ページタイトルと説明を動的に更新
  const pageTitle = document.getElementById('pageTitle');
  const pageDescription = document.getElementById('pageDescription');
  if (pageTitle && pageDescription) {
    if (sortParam === 'hot') {
      pageTitle.textContent = '人気のコレクション';
      pageDescription.textContent = '人気順で作品を表示しています。';
    } else if (sortParam === 'new') {
      pageTitle.textContent = '新着作品';
      pageDescription.textContent = '新着順で作品を表示しています。';
    } else if (sortParam === 'price-asc') {
      pageTitle.textContent = '価格が安い順';
      pageDescription.textContent = '価格が安い順で作品を表示しています。';
    } else if (sortParam === 'price-desc') {
      pageTitle.textContent = '価格が高い順';
      pageDescription.textContent = '価格が高い順で作品を表示しています。';
    } else if (query) {
      pageTitle.textContent = `「${query}」の検索結果`;
      pageDescription.textContent = 'キーワードから作品を探します。';
    }
  }

  // API関数
  function getAuthToken() {
    return localStorage.getItem('japanft_token');
  }

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
      return [];
    }
  }

  async function toggleLike(nftId) {
    try {
      const token = getAuthToken();
      if (!token) {
        alert('いいねするにはログインが必要です');
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
          alert('ログインが必要です');
          return null;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error toggling like:', error);
      alert('いいねの処理に失敗しました');
      return null;
    }
  }

  function fmt(v) {
    return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  async function apply() {
    try {
      const q = new URLSearchParams(location.search).get('q') || '';
      const sort = sortEl.value;
      
      // APIからNFTデータを取得
      const items = await fetchNFTs({ q: q, sort: sort });
      
      render(items);
    } catch (error) {
      console.error('検索処理でエラーが発生しました:', error);
      empty.hidden = false;
      empty.textContent = 'データの取得に失敗しました';
    }
  }

  function render(items) {
    try {
      grid.innerHTML = '';
      if (items.length === 0) {
        empty.hidden = false;
        return;
      } else {
        empty.hidden = true;
      }
      
      items.forEach(nft => {
        const card = document.createElement('article');
        card.className = 'card';
        const likeIcon = nft.is_liked ? '❤️' : '🤍';
        card.innerHTML = `
          <div class="thumb">
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
                <span class="like-count">${nft.likes}</span> | 在庫:1/1
              </div>
              <div class="price"><span>HLC</span><span>${fmt(nft.priceEth)}</span></div>
            </div>
            <div class="card-actions">
              <button class="btn" type="button" data-action="add-cart" data-nft-id="${nft.id}">カートに追加</button>
              <a class="btn purchase-btn" href="/checkout" data-product-id="${nft.id}">購入</a>
              <a class="btn" href="/product?id=${nft.id}">詳細</a>
            </div>
          </div>
        `;
        grid.appendChild(card);
        
        // カートに追加ボタンのイベントリスナー
        const addCartBtn = card.querySelector('[data-action="add-cart"]');
        if (addCartBtn) {
          addCartBtn.addEventListener('click', () => {
            try {
              const cart = JSON.parse(localStorage.getItem("nft_cart") || "[]");
              if (!cart.some(x => x.id === nft.id)) {
                cart.unshift(nft);
                localStorage.setItem("nft_cart", JSON.stringify(cart));
                alert("カートに追加しました");
              } else {
                alert("すでにカートにあります");
              }
            } catch (error) {
              console.error('カート追加エラー:', error);
            }
          });
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
              alert('商品IDが取得できませんでした');
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
      });
    } catch (error) {
      console.error('レンダリングでエラーが発生しました:', error);
    }
  }

  sortEl.addEventListener('change', apply);
  apply();
})();

