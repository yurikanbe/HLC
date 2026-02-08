/**
 * product.html専用のJavaScript
 * 商品詳細ページ - API連携実装済み
 */

// API関数
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

function getAuthToken() {
  return localStorage.getItem('japanft_token');
}

// ユーティリティ関数
function fmt(v) {
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getCart() {
  try {
    return JSON.parse(localStorage.getItem('nft_cart') || '[]');
  } catch {
    return [];
  }
}

function setCart(list) {
  localStorage.setItem('nft_cart', JSON.stringify(list));
  updateCartCount();
}

function updateCartCount() {
  const el = document.getElementById('cartCount');
  if (el) el.textContent = String(getCart().length);
}

function showToast(m) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = m;
  t.style.display = 'block';
  setTimeout(() => {
    t.style.display = 'none';
  }, 2000);
}

function qs() {
  const p = new URLSearchParams(location.search);
  return { id: p.get('id') };
}

// 取引履歴を取得
async function fetchTransactionHistory(nftId) {
  try {
    const token = getAuthToken();
    const headers = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`/api/nfts/${nftId}/transaction-history`, { headers });
    if (!response.ok) {
      if (response.status === 404) {
        return [];
      }
      return [];
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching transaction history:', error);
    return [];
  }
}

// 取引履歴を表示
async function loadTransactionHistory(nftId) {
  const historySection = document.getElementById('transactionHistorySection');
  const historyList = document.getElementById('transactionHistory');
  
  if (!historySection || !historyList) {
    return;
  }
  
  try {
    const transactions = await fetchTransactionHistory(nftId);
    
    if (transactions.length === 0) {
      historyList.innerHTML = '<div class="muted">取引履歴がありません</div>';
      return;
    }
    
    let html = '';
    transactions.forEach((tx, index) => {
      const txDate = tx.transaction_date ? new Date(tx.transaction_date) : null;
      const txDateStr = txDate ? `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}-${String(txDate.getDate()).padStart(2, '0')} ${String(txDate.getHours()).padStart(2, '0')}:${String(txDate.getMinutes()).padStart(2, '0')}` : '';
      
      html += `
        <div class="transaction-item" style="padding: 12px; margin-bottom: 8px; background: var(--card); border: 1px solid var(--border); border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <div style="font-size: 14px; color: var(--fg);">
              <span style="font-weight: 500;">${tx.seller_username || '不明'}</span>
              <span style="margin: 0 8px; color: var(--muted);">→</span>
              <span style="font-weight: 500;">${tx.buyer_username || '不明'}</span>
            </div>
            <div style="font-size: 16px; font-weight: 600; color: var(--accent-2);">
              ${fmt(tx.price)} HLC
            </div>
          </div>
          ${txDateStr ? `<div style="font-size: 12px; color: var(--muted);">${txDateStr}</div>` : ''}
        </div>
      `;
    });
    
    historyList.innerHTML = html;
  } catch (error) {
    console.error('取引履歴の読み込みエラー:', error);
    if (historyList) {
      historyList.innerHTML = '<div class="muted">取引履歴の取得に失敗しました</div>';
    }
  }
}

// 初期化
async function init() {
  const { id } = qs();
  if (!id) {
    showToast('商品IDが指定されていません');
    return;
  }
  
  try {
    // APIからNFT詳細を取得
    const item = await fetchNFT(id);
    
    if (!item) {
      showToast('該当する商品が見つかりません');
      return;
    }
    
    // ページタイトルを更新
    document.title = `${item.name} - 商品詳細`;
    
    // DOM要素の取得
    const titleEl = document.getElementById('title');
    const priceEl = document.getElementById('price');
    const likesEl = document.getElementById('likes');
    const likeIconEl = document.getElementById('likeIcon');
    const likeBtnEl = document.getElementById('likeBtn');
    const descEl = document.getElementById('desc');
    const imgEl = document.getElementById('image');
    
    // データの表示
    if (titleEl) titleEl.textContent = item.name;
    if (priceEl) priceEl.textContent = fmt(item.priceEth);
    if (likesEl) likesEl.textContent = String(item.likes || 0);
    if (descEl) {
      descEl.textContent = item.description || '説明文がありません';
    }
    if (imgEl) {
      imgEl.src = item.image;
      imgEl.alt = item.name;
    }
    
    // いいねボタンの状態を更新
    if (likeIconEl) {
      likeIconEl.textContent = item.is_liked ? '❤️' : '🤍';
    }
    
    // いいねボタンのイベントリスナー
    if (likeBtnEl) {
      likeBtnEl.addEventListener('click', async () => {
        const result = await toggleLike(item.id);
        if (result) {
          // いいね数を更新
          if (likesEl) likesEl.textContent = String(result.likes);
          // アイコンを更新
          if (likeIconEl) {
            likeIconEl.textContent = result.is_liked ? '❤️' : '🤍';
          }
          showToast(result.is_liked ? 'いいねしました' : 'いいねを解除しました');
        }
      });
    }
    
    // カートに追加ボタンのイベントリスナー
    const addCartBtn = document.getElementById('addCart');
    if (addCartBtn) {
      addCartBtn.addEventListener('click', () => {
        const list = getCart();
        if (!list.some(x => x.id === item.id)) {
          list.unshift(item);
          setCart(list);
          showToast('カートに追加しました');
        } else {
          showToast('すでにカートにあります');
        }
      });
    }
    
    // 決済ページへのリンクに商品IDを追加
    const goCheckoutBtn = document.getElementById('goCheckout');
    if (goCheckoutBtn) {
      // 商品IDを確実に保持
      const productId = item.id;
      
      if (!productId) {
        console.error('商品IDが取得できません。item:', item);
        showToast('商品IDが取得できませんでした');
        goCheckoutBtn.style.display = 'none'; // ボタンを非表示にする
        return;
      }
      
      // data属性にも保存（念のため）
      goCheckoutBtn.setAttribute('data-product-id', productId);
      
      const checkoutUrl = `/checkout?id=${productId}`;
      
      // hrefを設定
      goCheckoutBtn.href = checkoutUrl;
      
      // 既存のイベントリスナーを削除（重複を防ぐ）
      const newGoCheckoutBtn = goCheckoutBtn.cloneNode(true);
      goCheckoutBtn.parentNode.replaceChild(newGoCheckoutBtn, goCheckoutBtn);
      
      // クリックイベントで確実にリダイレクト
      newGoCheckoutBtn.addEventListener('click', (e) => {
        e.preventDefault(); // デフォルトのリンク動作をキャンセル
        e.stopPropagation(); // イベントの伝播を停止
        
        // data属性からも取得を試みる
        const idFromData = newGoCheckoutBtn.getAttribute('data-product-id');
        const finalProductId = productId || idFromData;
        
        if (finalProductId) {
          // 商品IDを使って確実にリダイレクト
          window.location.href = `/checkout?id=${finalProductId}`;
        } else {
          console.error('productIdがundefinedです');
          showToast('商品IDが取得できませんでした');
        }
      });
    }
    
    // 自分の出品した商品の場合、ミント管理ボタンを表示
    const goMintBtn = document.getElementById('goMint');
    if (goMintBtn && item.is_my_nft) {
      goMintBtn.style.display = 'inline-block';
      goMintBtn.href = `/mint?nft_id=${item.id}`;
    }
    
    // 出品者情報を表示
    const sellerSection = document.getElementById('sellerSection');
    const sellerAvatar = document.getElementById('sellerAvatar');
    const sellerName = document.getElementById('sellerName');
    const sellerTag = document.getElementById('sellerTag');
    const sellerLink = document.getElementById('sellerLink');
    
    // 出品者情報を取得（出品者 > 所有者 > 作成者の順でフォールバック）
    let displaySeller = item.seller;
    
    // sellerがnullまたはundefinedの場合、所有者または作成者を使用
    if (!displaySeller || displaySeller === null) {
      if (item.owner_id) {
        // 所有者のIDがある場合は所有者を使用
        displaySeller = {
          username: item.owner,
          user_tag: null,
          profile_image_url: null,
          user_id: item.owner_id
        };
      } else if (item.creator_id) {
        // 作成者のIDがある場合は作成者を使用
        displaySeller = {
          username: item.creator,
          user_tag: null,
          profile_image_url: null,
          user_id: item.creator_id
        };
      } else if (item.owner) {
        // IDがないが所有者名がある場合
        displaySeller = {
          username: item.owner,
          user_tag: null,
          profile_image_url: null,
          user_id: null
        };
      } else if (item.creator) {
        // IDがないが作成者名がある場合
        displaySeller = {
          username: item.creator,
          user_tag: null,
          profile_image_url: null,
          user_id: null
        };
      }
    }
    
    // 出品者情報を表示（出品者情報がある場合、または所有者/作成者情報がある場合）
    if (displaySeller && sellerSection) {
      sellerSection.style.display = 'flex';
      sellerSection.style.visibility = 'visible';
      
      // デフォルトアイコンのパス
      const DEFAULT_ICON_PATH = '/static/img/default_icon.png';
      
      // アバター画像またはデフォルトアイコンを表示
      if (sellerAvatar) {
        const avatarImageUrl = displaySeller.profile_image_url || DEFAULT_ICON_PATH;
        sellerAvatar.innerHTML = `<img src="${avatarImageUrl}" alt="${displaySeller.username || '出品者'}" onerror="this.onerror=null; this.src='${DEFAULT_ICON_PATH}'">`;
      }
      
      // 名前とタグ
      if (sellerName) {
        sellerName.textContent = displaySeller.username || '出品者';
      }
      if (sellerTag) {
        sellerTag.textContent = displaySeller.user_tag ? `#${displaySeller.user_tag}` : '';
      }
      
      // プロフィールページへのリンク（user_idがある場合のみ）
      if (sellerLink) {
        // 既存のイベントリスナーを削除
        const newLink = sellerLink.cloneNode(true);
        sellerLink.parentNode.replaceChild(newLink, sellerLink);
        const updatedSellerLink = document.getElementById('sellerLink');
        
        if (displaySeller.user_id) {
          const profileUrl = `/user/${displaySeller.user_id}`;
          updatedSellerLink.href = profileUrl;
          updatedSellerLink.style.pointerEvents = 'auto';
          updatedSellerLink.style.cursor = 'pointer';
          updatedSellerLink.style.textDecoration = 'none';
          updatedSellerLink.setAttribute('data-user-id', displaySeller.user_id);
          
          // クリックイベントを追加
          updatedSellerLink.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = profileUrl;
          });
        } else {
          updatedSellerLink.href = '#';
          updatedSellerLink.style.pointerEvents = 'none';
          updatedSellerLink.style.cursor = 'default';
          updatedSellerLink.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
          };
        }
      }
      // 出品者情報がない場合でも、所有者または作成者の名前だけでも表示
      if (sellerSection && (item.owner || item.creator)) {
        sellerSection.style.display = 'flex';
        const fallbackName = item.owner || item.creator || '出品者';
        if (sellerName) {
          sellerName.textContent = fallbackName;
        }
        if (sellerTag) {
          sellerTag.textContent = '';
        }
        // デフォルトアイコンを表示
        const DEFAULT_ICON_PATH = '/static/img/default_icon.png';
        if (sellerAvatar) {
          sellerAvatar.innerHTML = `<img src="${DEFAULT_ICON_PATH}" alt="${fallbackName}" onerror="this.onerror=null; this.src='${DEFAULT_ICON_PATH}'">`;
        }
        if (sellerLink) {
          sellerLink.href = '#';
          sellerLink.style.pointerEvents = 'none';
        }
      } else if (sellerSection) {
        sellerSection.style.display = 'none';
      }
    }
    
    // 所有者情報を表示
    const ownerSection = document.getElementById('ownerSection');
    const ownerAvatar = document.getElementById('ownerAvatar');
    const ownerName = document.getElementById('ownerName');
    const ownerTag = document.getElementById('ownerTag');
    const ownerLink = document.getElementById('ownerLink');
    
    // 所有者情報を取得（owner_info > owner_id/owner の順でフォールバック）
    let displayOwner = item.owner_info;
    
    // owner_infoがnullまたはundefinedの場合、owner_idやownerから情報を構築
    if (!displayOwner || displayOwner === null) {
      if (item.owner_id) {
        // 所有者のIDがある場合は所有者を使用
        displayOwner = {
          username: item.owner,
          user_tag: null,
          profile_image_url: null,
          user_id: item.owner_id
        };
      } else if (item.owner) {
        // IDがないが所有者名がある場合
        displayOwner = {
          username: item.owner,
          user_tag: null,
          profile_image_url: null,
          user_id: null
        };
      }
    }
    
    // 所有者情報を表示（所有者情報がある場合）
    if (displayOwner && ownerSection) {
      ownerSection.style.display = 'flex';
      ownerSection.style.visibility = 'visible';
      
      const DEFAULT_ICON_PATH = '/static/img/default_icon.png';
      
      // アバター画像またはデフォルトアイコンを表示
      if (ownerAvatar) {
        const avatarImageUrl = displayOwner.profile_image_url || DEFAULT_ICON_PATH;
        ownerAvatar.innerHTML = `<img src="${avatarImageUrl}" alt="${displayOwner.username || '保有者'}" onerror="this.onerror=null; this.src='${DEFAULT_ICON_PATH}'">`;
      }
      
      // 名前とタグ
      if (ownerName) {
        ownerName.textContent = `所有者：${displayOwner.username || '保有者'}`;
      }
      if (ownerTag) {
        ownerTag.textContent = displayOwner.user_tag ? `#${displayOwner.user_tag}` : '';
      }
      
      // プロフィールページへのリンク
      if (ownerLink) {
        // 既存のイベントリスナーを削除
        const newLink = ownerLink.cloneNode(true);
        ownerLink.parentNode.replaceChild(newLink, ownerLink);
        const updatedOwnerLink = document.getElementById('ownerLink');
        
        if (displayOwner.user_id) {
          const profileUrl = `/user/${displayOwner.user_id}`;
          updatedOwnerLink.href = profileUrl;
          updatedOwnerLink.style.pointerEvents = 'auto';
          updatedOwnerLink.style.cursor = 'pointer';
          updatedOwnerLink.style.textDecoration = 'none';
          updatedOwnerLink.setAttribute('data-user-id', displayOwner.user_id);
          
          // クリックイベントを追加
          updatedOwnerLink.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = profileUrl;
          });
        } else {
          updatedOwnerLink.href = '#';
          updatedOwnerLink.style.pointerEvents = 'none';
          updatedOwnerLink.style.cursor = 'default';
          updatedOwnerLink.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
          };
        }
      }
    } else if (ownerSection) {
      // 所有者情報がない場合は非表示
      ownerSection.style.display = 'none';
    }
    
    // 取引履歴を取得して表示
    await loadTransactionHistory(item.id);
    
  } catch (error) {
    console.error('初期化エラー:', error);
    showToast(error.message || '商品情報の取得に失敗しました');
  }
  
  updateCartCount();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

