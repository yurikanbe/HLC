/**
 * mint.html専用のJavaScript
 * NFTミント管理ページ
 */

// ユーティリティ関数
function getAuthToken() {
  return localStorage.getItem('japanft_token');
}

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
}

function updateCartCount() {
  try {
    const cart = JSON.parse(localStorage.getItem('nft_cart') || '[]');
    const cartCount = document.getElementById('cartCount');
    if (cartCount) {
      cartCount.textContent = String(cart.length);
    }
  } catch (error) {
    console.error('カートカウント更新エラー:', error);
  }
}

// NFT一覧を取得
async function fetchMyNFTs() {
  try {
    const token = getAuthToken();
    if (!token) {
      showToast('ログインが必要です');
      window.location.replace('/login');
      return [];
    }

    const response = await fetch('/api/profile/nfts', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        showToast('ログインが必要です');
        window.location.replace('/login');
        return [];
      }
      const errorData = await response.json().catch(() => ({ detail: 'エラーが発生しました' }));
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching NFTs:', error);
    showToast(error.message || 'NFT一覧の取得に失敗しました');
    return [];
  }
}

// NFTをミント
async function mintNFT(nftId, price = 0.1) {
  try {
    const token = getAuthToken();
    if (!token) {
      showToast('ログインが必要です');
      return null;
    }

    const response = await fetch(`/api/nfts/${nftId}/mint`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ price: price })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'エラーが発生しました' }));
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error minting NFT:', error);
    throw error;
  }
}

// NFTカードをレンダリング
function renderNFTCard(nft) {
  const isMinted = nft.is_minted;
  const isListed = nft.is_listed || false;
  const statusClass = isMinted ? 'minted' : 'not-minted';
  const statusText = isMinted ? '✓ ミント済み' : '未ミント';
  const listingStatusText = isListed ? '販売中' : (isMinted ? '販売停止中' : '');

  return `
    <div class="nft-card" data-nft-id="${nft.nft_id}" data-minted="${isMinted}" data-listed="${isListed}">
      <img src="${nft.image || '/static/images/placeholder.png'}" alt="${nft.name}" class="nft-image" onerror="this.src='/static/images/placeholder.png'">
      <div class="nft-info">
        <div class="nft-name">${escapeHtml(nft.name)}</div>
        ${nft.description ? `<p class="muted" style="font-size: 0.9em; margin: 8px 0;">${escapeHtml(nft.description.substring(0, 60))}${nft.description.length > 60 ? '...' : ''}</p>` : ''}
        <div class="nft-meta">
          <span class="mint-status ${statusClass}">${statusText}</span>
          ${listingStatusText ? `<span class="mint-status ${isListed ? 'minted' : 'not-minted'}" style="margin-left: 8px;">${listingStatusText}</span>` : ''}
        </div>
        ${nft.priceEth ? `<div style="margin-top: 8px; font-weight: 600;">HLC ${nft.priceEth.toFixed(4)}</div>` : ''}
        ${nft.blockchain_hash ? `<div class="blockchain-hash">Hash: ${nft.blockchain_hash.substring(0, 16)}...</div>` : ''}
        <div class="mint-actions">
          ${!isMinted ? `<button class="btn primary" onclick="handleMint(${nft.nft_id}, ${isListed})" id="mintBtn-${nft.nft_id}">ミントする</button>` : ''}
          ${isMinted && isListed ? `<button class="btn" onclick="handleStopSelling(${nft.nft_id})" id="stopBtn-${nft.nft_id}">販売停止</button>` : ''}
          ${isMinted && !isListed ? `<button class="btn primary" onclick="handleRelist(${nft.nft_id})" id="relistBtn-${nft.nft_id}">再出品</button>` : ''}
          <a href="/product?id=${nft.nft_id}" class="btn">詳細を見る</a>
        </div>
      </div>
    </div>
  `;
}

// HTMLエスケープ
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ミント処理
// isListed: 既に出品価格が決まっている（作成時の出品）なら true → 価格入力不要。転売なら false → ミント時に価格入力
async function handleMint(nftId, isListed) {
  const btn = document.getElementById(`mintBtn-${nftId}`);
  if (!btn) return;

  let price = 0;
  if (isListed) {
    // 最初の出品: 出品時に決めた価格を使うので価格入力不要
    if (!confirm('このNFTをブロックチェーン上にミントしますか？（出品時に設定した価格で出品されます）')) {
      return;
    }
  } else {
    // 転売: 購入者が再ミントするときはミント時に価格を決める
    const priceStr = prompt('転売価格を入力してください（HLC）:', '0.1');
    if (priceStr === null) return;
    price = parseFloat(priceStr);
    if (isNaN(price) || price <= 0) {
      showToast('有効な価格を入力してください');
      return;
    }
    if (!confirm(`このNFTをブロックチェーン上にミントし、${price} HLCで出品しますか？`)) {
      return;
    }
  }

  btn.disabled = true;
  btn.textContent = 'ミント中...';

  try {
    const result = await mintNFT(nftId, price);
    if (result) {
      showToast(`${result.name} のミントと出品が完了しました！`);
      setTimeout(() => location.reload(), 1500);
    }
  } catch (error) {
    showToast(error.message || 'ミントに失敗しました');
    btn.disabled = false;
    btn.textContent = 'ミントする';
  }
}

// 出品停止処理
async function handleStopSelling(nftId) {
  if (!confirm('このNFTの出品を停止しますか？（ミント状態は維持されます）')) {
    return;
  }

  try {
    const token = getAuthToken();
    if (!token) {
      showToast('ログインが必要です');
      return;
    }

    const response = await fetch(`/api/nfts/${nftId}/stop-selling`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'エラーが発生しました' }));
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    showToast(result.message || '出品を停止しました');
    setTimeout(() => {
      location.reload();
    }, 1500);
  } catch (error) {
    console.error('Error stopping sale:', error);
    showToast(error.message || '出品停止に失敗しました');
  }
}

// 再出品処理
async function handleRelist(nftId) {
  // 価格を入力
  const priceStr = prompt('再出品価格を入力してください（HLC）:', '0.1');
  if (priceStr === null) return; // キャンセル
  
  const price = parseFloat(priceStr);
  if (isNaN(price) || price <= 0) {
    showToast('有効な価格を入力してください');
    return;
  }

  try {
    const token = getAuthToken();
    if (!token) {
      showToast('ログインが必要です');
      return;
    }

    const response = await fetch(`/api/nfts/${nftId}/relist`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ price: price })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'エラーが発生しました' }));
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    showToast(result.message || '再出品が完了しました');
    setTimeout(() => {
      location.reload();
    }, 1500);
  } catch (error) {
    console.error('Error relisting:', error);
    showToast(error.message || '再出品に失敗しました');
  }
}

// NFT一覧を表示
function renderNFTs(nfts, filter = 'all') {
  const grid = document.getElementById('nftGrid');
  const emptyState = document.getElementById('emptyState');
  const loading = document.getElementById('loading');

  if (!grid || !emptyState || !loading) return;

  loading.style.display = 'none';

  // フィルタリング
  let filteredNFTs = nfts;
  if (filter === 'minted') {
    filteredNFTs = nfts.filter(nft => nft.is_minted);
  } else if (filter === 'not-minted') {
    filteredNFTs = nfts.filter(nft => !nft.is_minted);
  }

  if (filteredNFTs.length === 0) {
    grid.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }

  grid.style.display = 'grid';
  emptyState.style.display = 'none';
  grid.innerHTML = filteredNFTs.map(nft => renderNFTCard(nft)).join('');
}

// フィルタタブの処理
function setupFilterTabs() {
  const tabs = document.querySelectorAll('.filter-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // アクティブ状態を更新
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // 現在のNFT一覧を取得して再表示
      const filter = tab.dataset.filter;
      loadAndRenderNFTs(filter);
    });
  });
}

// NFT一覧を読み込んで表示
let allNFTs = [];

async function loadAndRenderNFTs(filter = 'all') {
  const loading = document.getElementById('loading');
  const grid = document.getElementById('nftGrid');

  if (loading) loading.style.display = 'block';
  if (grid) grid.style.display = 'none';

  try {
    if (allNFTs.length === 0) {
      allNFTs = await fetchMyNFTs();
    }
    renderNFTs(allNFTs, filter);
    
    // URLパラメータで特定のNFT IDが指定されている場合、そのNFTにスクロール
    const urlParams = new URLSearchParams(window.location.search);
    const nftId = urlParams.get('nft_id');
    if (nftId) {
      setTimeout(() => {
        const nftCard = document.querySelector(`[data-nft-id="${nftId}"]`);
        if (nftCard) {
          nftCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // ハイライト表示
          nftCard.style.border = '2px solid var(--accent)';
          nftCard.style.boxShadow = '0 0 20px rgba(124, 92, 255, 0.5)';
          setTimeout(() => {
            nftCard.style.border = '';
            nftCard.style.boxShadow = '';
          }, 3000);
        }
      }, 500);
    }
  } catch (error) {
    console.error('Error loading NFTs:', error);
    showToast('NFT一覧の読み込みに失敗しました');
  } finally {
    if (loading) loading.style.display = 'none';
  }
}

// 初期化
function init() {
  updateCartCount();
  setupFilterTabs();
  loadAndRenderNFTs('all');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

