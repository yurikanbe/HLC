/**
 * create.html専用のJavaScript
 * NFT出品ページ
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

// ファイルアップロード機能
let uploadedFileUrl = null;

async function uploadFile(file) {
  try {
    const token = getAuthToken();
    if (!token) {
      showToast('ログインが必要です');
      return null;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'エラーが発生しました' }));
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    return result.url; // 相対パスを返す
  } catch (error) {
    console.error('Error uploading file:', error);
    showToast(error.message || 'ファイルのアップロードに失敗しました');
    return null;
  }
}

// メディアプレビュー機能
function setupMediaPreview() {
  const fileInput = document.getElementById('fileInput');
  const imageUrlInput = document.getElementById('imageUrl');
  const mediaPreview = document.getElementById('mediaPreview');
  const previewContainer = document.getElementById('previewContainer');
  
  // ファイル選択時の処理
  if (fileInput && mediaPreview && previewContainer) {
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) {
        mediaPreview.style.display = 'none';
        uploadedFileUrl = null;
        return;
      }
      
      // ファイルサイズチェック
      if (file.size > 100 * 1024 * 1024) {
        showToast('ファイルサイズは100MB以下である必要があります');
        fileInput.value = '';
        return;
      }
      
      // プレビュー表示
      previewContainer.innerHTML = '';
      
      if (file.type.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.style.maxWidth = '300px';
        img.style.maxHeight = '300px';
        img.style.borderRadius = '8px';
        img.style.display = 'block';
        previewContainer.appendChild(img);
        mediaPreview.style.display = 'block';
      } else if (file.type.startsWith('audio/')) {
        const audio = document.createElement('audio');
        audio.src = URL.createObjectURL(file);
        audio.controls = true;
        audio.style.width = '100%';
        audio.style.maxWidth = '400px';
        previewContainer.appendChild(audio);
        mediaPreview.style.display = 'block';
      }
      
      // ファイルをアップロード
      const submitBtn = document.getElementById('submitBtn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'アップロード中...';
      }
      
      const url = await uploadFile(file);
      if (url) {
        uploadedFileUrl = url;
        showToast('ファイルのアップロードが完了しました');
      } else {
        fileInput.value = '';
        mediaPreview.style.display = 'none';
      }
      
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '出品する';
      }
    });
  }
  
  // URL入力時の処理
  if (imageUrlInput && mediaPreview && previewContainer) {
    imageUrlInput.addEventListener('input', () => {
      const url = imageUrlInput.value.trim();
      if (url) {
        previewContainer.innerHTML = '';
        
        // URLが画像か音声かを判定
        if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
          const img = document.createElement('img');
          img.src = url;
          img.onload = () => {
            img.style.maxWidth = '300px';
            img.style.maxHeight = '300px';
            img.style.borderRadius = '8px';
            img.style.display = 'block';
            previewContainer.appendChild(img);
            mediaPreview.style.display = 'block';
            uploadedFileUrl = url;
          };
          img.onerror = () => {
            mediaPreview.style.display = 'none';
            showToast('画像の読み込みに失敗しました');
          };
        } else if (url.match(/\.(mp3)$/i)) {
          const audio = document.createElement('audio');
          audio.src = url;
          audio.controls = true;
          audio.style.width = '100%';
          audio.style.maxWidth = '400px';
          previewContainer.appendChild(audio);
          mediaPreview.style.display = 'block';
          uploadedFileUrl = url;
        } else {
          // 拡張子がない場合、画像として試す
          const img = document.createElement('img');
          img.src = url;
          img.onload = () => {
            img.style.maxWidth = '300px';
            img.style.maxHeight = '300px';
            img.style.borderRadius = '8px';
            img.style.display = 'block';
            previewContainer.appendChild(img);
            mediaPreview.style.display = 'block';
            uploadedFileUrl = url;
          };
          img.onerror = () => {
            mediaPreview.style.display = 'none';
          };
        }
      } else {
        mediaPreview.style.display = 'none';
        uploadedFileUrl = null;
      }
    });
  }
}

// NFT作成API
async function createNFT(data) {
  try {
    const token = getAuthToken();
    if (!token) {
      showToast('ログインが必要です');
      window.location.replace('/login');
      return null;
    }
    
    const response = await fetch('/api/nfts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'エラーが発生しました' }));
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error creating NFT:', error);
    throw error;
  }
}

// フォーム送信処理
function setupForm() {
  const form = document.getElementById('createForm');
  const submitBtn = document.getElementById('submitBtn');
  
  if (!form || !submitBtn) return;
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // フォームデータを取得
    const name = document.getElementById('name').value.trim();
    const description = document.getElementById('description').value.trim();
    const imageUrl = document.getElementById('imageUrl').value.trim();
    const category = document.getElementById('category').value;
    const price = parseFloat(document.getElementById('price').value);
    
    // バリデーション
    if (!name) {
      showToast('作品名を入力してください');
      return;
    }
    
    // ファイルまたはURLのいずれかが必要
    const fileInput = document.getElementById('fileInput');
    const hasFile = fileInput && fileInput.files.length > 0;
    const hasUrl = imageUrl.trim().length > 0;
    
    if (!uploadedFileUrl && !hasUrl) {
      showToast('ファイルをアップロードするか、URLを入力してください');
      return;
    }
    
    if (!price || price <= 0) {
      showToast('有効な価格を入力してください');
      return;
    }
    
    // 送信ボタンを無効化
    submitBtn.disabled = true;
    submitBtn.textContent = '出品中...';
    
    try {
      // ファイルがアップロードされていない場合、URLを使用
      const mediaUrl = uploadedFileUrl || imageUrl;
      
      const result = await createNFT({
        name: name,
        description: description || null,
        image_url: mediaUrl,
        category: category || null,
        price: price,
        currency: "HLC"  // デフォルトでHLCを使用
      });
      
      if (result) {
        showToast(`${result.name} の出品が完了しました！`);
        // 2秒後にプロフィールページにリダイレクト
        setTimeout(() => {
          window.location.href = '/profile';
        }, 2000);
      }
    } catch (error) {
      showToast(error.message || '出品に失敗しました');
      submitBtn.disabled = false;
      submitBtn.textContent = '出品する';
    }
  });
}

// 初期化
function init() {
  setupMediaPreview();
  setupForm();
  updateCartCount();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

////////
/*$(function(){
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
*/
document.addEventListener("DOMContentLoaded", () => {
  const hamburger = document.querySelector(".hamburger");
  const nav = document.querySelector(".nav-actions");
  const overlay = document.querySelector(".overlay");

  let scrollY = 0;

  if (!hamburger || !nav) return;

  // スクロール完全停止用
  const preventScroll = (e) => {
    e.preventDefault();
  };

  function lockScroll() {
    scrollY = window.scrollY;
    document.body.style.top = `-${scrollY}px`;
    document.body.classList.add("menu-open");

    // スマホ・PC両対応でスクロール殺す
    document.addEventListener("touchmove", preventScroll, { passive: false });
    document.addEventListener("wheel", preventScroll, { passive: false });
  }

  function unlockScroll() {
    document.body.classList.remove("menu-open");
    document.body.style.top = "";
    window.scrollTo(0, scrollY);

    document.removeEventListener("touchmove", preventScroll);
    document.removeEventListener("wheel", preventScroll);
  }

  hamburger.addEventListener("click", () => {
    const isOpen = hamburger.classList.toggle("active");
    nav.classList.toggle("active", isOpen);
    if (overlay) overlay.classList.toggle("active", isOpen);

    if (isOpen) {
      lockScroll();
    } else {
      unlockScroll();
    }
  });

  if (overlay) {
    overlay.addEventListener("click", () => {
      hamburger.classList.remove("active");
      nav.classList.remove("active");
      overlay.classList.remove("active");
      unlockScroll();
    });
  }

  nav.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      hamburger.classList.remove("active");
      nav.classList.remove("active");
      if (overlay) overlay.classList.remove("active");
      unlockScroll();
    });
  });
});
