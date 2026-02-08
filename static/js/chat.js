// chat.html用のJavaScript - 会話アプリ版

(function() {
  'use strict';

  // 現在のユーザーID（認証トークンから取得）
  let CURRENT_USER_ID = null;
  
  // 認証トークンからユーザーIDを取得
  function getCurrentUserId() {
    if (CURRENT_USER_ID) return CURRENT_USER_ID;
    
    try {
      const userInfo = JSON.parse(localStorage.getItem("japanft_user") || "{}");
      if (userInfo.user_id) {
        CURRENT_USER_ID = userInfo.user_id;
        return CURRENT_USER_ID;
      }
    } catch (error) {
      console.error('ユーザー情報の取得エラー:', error);
    }
    
    // フォールバック: APIから取得
    return null;
  }
  
  // 認証トークンの取得
  function getAuthToken() {
    return localStorage.getItem("japanft_token");
  }
  
  // ユーザー情報をAPIから取得
  async function fetchCurrentUser() {
    const token = getAuthToken();
    if (!token) return null;
    
    try {
      const response = await fetch("/api/auth/me", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const userInfo = await response.json();
        CURRENT_USER_ID = userInfo.user_id;
        return userInfo;
      }
    } catch (error) {
      console.error('ユーザー情報取得エラー:', error);
    }
    return null;
  }
  
  // DOM要素
  const userList = document.getElementById("userList");
  const emptyState = document.getElementById("emptyState");
  const chatThread = document.getElementById("chatThread");
  const chatInputArea = document.getElementById("chatInputArea");
  const list = document.getElementById("list");
  const text = document.getElementById("text");
  const send = document.getElementById("send");
  const typing = document.getElementById("typing");
  const chips = document.getElementById("chips");
  const cartCountEl = document.getElementById("cartCount");
  const newChatBtn = document.getElementById("newChatBtn");
  const threadUserName = document.getElementById("threadUserName");
  const threadUserStatus = document.getElementById("threadUserStatus");
  
  // タブ関連
  const tabChats = document.getElementById("tabChats");
  const tabFollowing = document.getElementById("tabFollowing");
  const tabSearch = document.getElementById("tabSearch");
  const searchBar = document.getElementById("searchBar");
  const userSearchInput = document.getElementById("userSearchInput");
  const searchResults = document.getElementById("searchResults");
  const followingList = document.getElementById("followingList");

  if (!userList || !emptyState || !chatThread || !chatInputArea || !list || !text || !send || !typing || !chips) {
    console.error('必要な要素が見つかりません');
    return;
  }

  // 現在選択中のルームID
  let currentRoomId = null;
  let currentOtherUser = null;
  let rooms = [];
  let allUsers = [];
  let currentTab = "chats"; // "chats", "following", "search"
  let searchTimeout = null;

  // カート機能
  function getCart() {
    try {
      return JSON.parse(localStorage.getItem("nft_cart") || "[]");
    } catch (error) {
      console.error('カートの読み込みエラー:', error);
      return [];
    }
  }

  function updateCartCount() {
    if (cartCountEl) {
      cartCountEl.textContent = String(getCart().length);
    }
  }

  // API呼び出し
  async function fetchChatRooms() {
    const userId = getCurrentUserId();
    if (!userId) {
      console.error('ユーザーIDが取得できません');
      return;
    }
    
    try {
      const token = getAuthToken();
      const response = await fetch(`/api/chat/rooms?current_user_id=${userId}`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('チャットルームの取得に失敗しました');
      rooms = await response.json();
      renderUserList();
    } catch (error) {
      console.error('チャットルーム取得エラー:', error);
    }
  }

  async function fetchAllUsers() {
    try {
      const token = getAuthToken();
      const response = await fetch('/api/chat/users', {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('ユーザー一覧の取得に失敗しました');
      allUsers = await response.json();
    } catch (error) {
      console.error('ユーザー一覧取得エラー:', error);
    }
  }

  async function fetchMessages(roomId) {
    try {
      const token = getAuthToken();
      const response = await fetch(`/api/chat/rooms/${roomId}/messages`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('メッセージの取得に失敗しました');
      const messages = await response.json();
      renderMessages(messages);
    } catch (error) {
      console.error('メッセージ取得エラー:', error);
    }
  }

  async function sendMessage(roomId, messageText, senderId = null) {
    if (!senderId) {
      senderId = getCurrentUserId();
      if (!senderId) {
        throw new Error('ユーザーIDが取得できません');
      }
    }
    try {
      const token = getAuthToken();
      const response = await fetch(`/api/chat/rooms/${roomId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message_text: messageText,
          sender_id: senderId
        })
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'メッセージの送信に失敗しました' }));
        throw new Error(errorData.detail || 'メッセージの送信に失敗しました');
      }
      const message = await response.json();
      return message;
    } catch (error) {
      console.error('メッセージ送信エラー:', error);
      throw error;
    }
  }

  async function createChatRoom(user2Id) {
    const token = getAuthToken();
    if (!token) {
      throw new Error('ログインが必要です');
    }
    
    try {
      const response = await fetch('/api/chat/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          user2_id: user2Id
        })
      });
      if (!response.ok) throw new Error('チャットルームの作成に失敗しました');
      const result = await response.json();
      return result.room_id;
    } catch (error) {
      console.error('チャットルーム作成エラー:', error);
      throw error;
    }
  }

  // レンダリング
  function renderUserList() {
    userList.innerHTML = '';
    
    if (rooms.length === 0) {
      userList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--muted);">チャット履歴がありません</div>';
      return;
    }

    rooms.forEach(room => {
      const userItem = document.createElement('div');
      userItem.className = 'user-item';
      if (currentRoomId === room.room_id) {
        userItem.classList.add('active');
      }

      const info = document.createElement('div');
      info.className = 'user-item-info';

      const nameLink = document.createElement('a');
      nameLink.href = `/user/${room.other_user.user_id}`;
      nameLink.className = 'user-item-name';
      nameLink.style.textDecoration = 'none';
      nameLink.style.color = 'inherit';
      nameLink.style.cursor = 'pointer';
      nameLink.textContent = room.other_user.username || 'ユーザー';
      nameLink.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      
      const tag = document.createElement('div');
      tag.className = 'user-item-tag';
      tag.textContent = room.other_user.user_tag ? `#${room.other_user.user_tag}` : '';
      tag.style.fontSize = '11px';
      tag.style.color = 'var(--muted)';
      tag.style.marginTop = '2px';

      const preview = document.createElement('div');
      preview.className = 'user-item-preview';
      if (room.latest_message) {
        preview.textContent = room.latest_message.text;
      } else {
        preview.textContent = 'メッセージがありません';
      }

      info.appendChild(nameLink);
      if (room.other_user.user_tag) {
        info.appendChild(tag);
      }
      info.appendChild(preview);
      userItem.appendChild(info);

      userItem.addEventListener('click', () => {
        selectRoom(room.room_id, room.other_user);
      });

      userList.appendChild(userItem);
    });
  }

  function selectRoom(roomId, otherUser) {
    currentRoomId = roomId;
    currentOtherUser = otherUser;

    // UI更新
    emptyState.style.display = 'none';
    chatThread.style.display = 'flex';
    chatInputArea.style.display = 'block';

    // ヘッダー更新
    if (otherUser.user_id) {
      threadUserName.innerHTML = `<a href="/user/${otherUser.user_id}" style="text-decoration: none; color: inherit; cursor: pointer;">${otherUser.username || 'ユーザー'}</a>`;
    } else {
      threadUserName.textContent = otherUser.username || 'ユーザー';
    }
    // 識別子を表示（既存のstatus要素の下に追加）
    if (otherUser.user_tag) {
      let tagEl = document.getElementById('threadUserTag');
      if (!tagEl) {
        tagEl = document.createElement('div');
        tagEl.id = 'threadUserTag';
        tagEl.className = 'muted';
        tagEl.style.fontSize = '12px';
        tagEl.style.marginTop = '2px';
        threadUserStatus.parentNode.insertBefore(tagEl, threadUserStatus.nextSibling);
      }
      tagEl.textContent = `#${otherUser.user_tag}`;
    }
    threadUserStatus.textContent = 'オンライン';

    // メッセージ取得
    fetchMessages(roomId);

    // ユーザー一覧のアクティブ状態を更新
    renderUserList();
  }

  function fmtTime(ts) {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function elMessage(msg) {
    const wrap = document.createElement("div");
    const currentUserId = getCurrentUserId();
    const isMe = currentUserId && msg.sender_id === currentUserId;
    wrap.className = `message-wrapper ${isMe ? "me" : ""}`;
    
    const row = document.createElement("div");
    row.className = `message-row ${isMe ? "me" : ""}`;
    
    if (!isMe) {
      const DEFAULT_ICON_PATH = '/static/img/default_icon.png';
      const av = document.createElement("div");
      av.className = "avatar seller";
      // メッセージにはsenderのprofile_image_urlが含まれていない可能性があるため、デフォルトアイコンを使用
      // 将来的にはメッセージにsenderのprofile_image_urlを含めることを推奨
      const senderAvatarUrl = msg.sender_profile_image_url || DEFAULT_ICON_PATH;
      av.innerHTML = `<img src="${senderAvatarUrl}" alt="${msg.sender_username || 'ユーザー'}" onerror="this.onerror=null; this.src='${DEFAULT_ICON_PATH}'">`;
      row.appendChild(av);
    }
    
    const bubble = document.createElement("div");
    bubble.className = `msg ${isMe ? "me" : "seller"}`;
    bubble.textContent = msg.message_text;
    row.appendChild(bubble);
    
    wrap.appendChild(row);
    
    const meta = document.createElement("div");
    meta.className = "msg-meta";
    const senderName = isMe ? "あなた" : ((msg.sender_username || "ユーザー") + (msg.sender_user_tag ? `#${msg.sender_user_tag}` : ''));
    meta.textContent = senderName + " ・ " + fmtTime(msg.created_at);
    wrap.appendChild(meta);
    
    return wrap;
  }

  function scrollToBottom() {
    list.scrollTop = list.scrollHeight;
  }

  function renderMessages(messages) {
    list.innerHTML = "";
    messages.forEach(msg => {
      list.appendChild(elMessage(msg));
    });
    scrollToBottom();
  }

  // メッセージ送信
  async function handleSend() {
    const val = text.value.trim();
    if (!val || !currentRoomId) return;
    
    text.value = "";
    text.disabled = true;
    send.disabled = true;

    try {
      const message = await sendMessage(currentRoomId, val);
      
      // メッセージを表示
      list.appendChild(elMessage(message));
      scrollToBottom();

      // ルーム一覧を更新
      await fetchChatRooms();
    } catch (error) {
      console.error('メッセージ送信エラー:', error);
      alert('メッセージの送信に失敗しました');
    } finally {
      text.disabled = false;
      send.disabled = false;
      text.focus();
    }
  }


  // 新しいチャット開始
  async function handleNewChat() {
    try {
      if (allUsers.length === 0) {
        await fetchAllUsers();
      }

      // 既にチャットがあるユーザーを除外
      const currentUserId = getCurrentUserId();
      if (!currentUserId) {
        alert('ログインが必要です');
        window.location.href = '/login';
        return;
      }
      
      const existingUserIds = new Set(rooms.map(r => r.other_user.user_id));
      const availableUsers = allUsers.filter(u => 
        u.user_id !== currentUserId && !existingUserIds.has(u.user_id)
      );

      if (availableUsers.length === 0) {
        alert('新しいチャットを開始できるユーザーがいません');
        return;
      }

      // 最初の利用可能なユーザーとチャットを開始
      const targetUser = availableUsers[0];
      console.log('新しいチャットを開始:', targetUser);
      
      const result = await createChatRoom(targetUser.user_id);
      console.log('ルーム作成結果:', result);
      
      // ルーム一覧を更新
      await fetchChatRooms();
      
      // 作成されたルームを探す
      const newRoom = rooms.find(r => r.room_id === result.room_id);
      console.log('見つかったルーム:', newRoom);
      
      if (newRoom) {
        selectRoom(result.room_id, newRoom.other_user);
      } else {
        // ルームが見つからない場合、直接選択
        selectRoom(result.room_id, targetUser);
      }
    } catch (error) {
      console.error('チャット開始エラー:', error);
      alert('チャットの開始に失敗しました: ' + (error.message || '不明なエラー'));
    }
  }

  // イベントリスナー
  send.addEventListener("click", handleSend);

  text.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  chips.addEventListener("click", (e) => {
    const t = e.target;
    if (t.classList && t.classList.contains("chip")) {
      text.value = t.textContent;
      text.focus();
    }
  });

  if (newChatBtn) {
    newChatBtn.addEventListener("click", handleNewChat);
  }

  // タブ切り替え
  function switchTab(tabName) {
    currentTab = tabName;
    
    // タブのアクティブ状態を更新
    if (tabChats) tabChats.classList.toggle("active", tabName === "chats");
    if (tabFollowing) tabFollowing.classList.toggle("active", tabName === "following");
    if (tabSearch) tabSearch.classList.toggle("active", tabName === "search");
    
    // コンテンツの表示/非表示
    if (tabName === "chats") {
      userList.style.display = "block";
      followingList.style.display = "none";
      searchBar.style.display = "none";
    } else if (tabName === "following") {
      userList.style.display = "none";
      followingList.style.display = "block";
      searchBar.style.display = "none";
      fetchFollowingUsers();
    } else if (tabName === "search") {
      userList.style.display = "none";
      followingList.style.display = "none";
      searchBar.style.display = "block";
      if (userSearchInput) userSearchInput.value = "";
      searchResults.innerHTML = "";
    }
  }

  // フォローしているユーザー一覧を取得
  async function fetchFollowingUsers() {
    try {
      const token = getAuthToken();
      const response = await fetch("/api/users/following", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('フォロー一覧の取得に失敗しました');
      const users = await response.json();
      renderFollowingUsers(users);
    } catch (error) {
      console.error('フォロー一覧取得エラー:', error);
      followingList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--muted);">エラーが発生しました</div>';
    }
  }

  // フォロー一覧を表示
  function renderFollowingUsers(users) {
    followingList.innerHTML = '';
    
    if (users.length === 0) {
      followingList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--muted);">フォローしているユーザーがいません</div>';
      return;
    }

    users.forEach(user => {
      const userItem = document.createElement('div');
      userItem.className = 'user-item';

      const info = document.createElement('div');
      info.className = 'user-item-info';

      const nameLink = document.createElement('a');
      nameLink.href = `/user/${user.user_id}`;
      nameLink.className = 'user-item-name';
      nameLink.style.textDecoration = 'none';
      nameLink.style.color = 'inherit';
      nameLink.style.cursor = 'pointer';
      nameLink.textContent = user.username || 'ユーザー';
      nameLink.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      
      const tag = document.createElement('div');
      tag.className = 'user-item-tag';
      tag.textContent = user.user_tag ? `#${user.user_tag}` : '';
      tag.style.fontSize = '11px';
      tag.style.color = 'var(--muted)';
      tag.style.marginTop = '2px';

      info.appendChild(nameLink);
      if (user.user_tag) {
        info.appendChild(tag);
      }
      userItem.appendChild(info);

      userItem.addEventListener('click', async () => {
        try {
          // 既存のルームを探す
          const existingRoom = rooms.find(r => r.other_user.user_id === user.user_id);
          if (existingRoom) {
            selectRoom(existingRoom.room_id, existingRoom.other_user);
          } else {
            // 新しいルームを作成
            const roomId = await createChatRoom(user.user_id);
            await fetchChatRooms();
            const newRoom = rooms.find(r => r.room_id === roomId);
            if (newRoom) {
              selectRoom(roomId, newRoom.other_user);
            } else {
              selectRoom(roomId, user);
            }
          }
          // チャットタブに切り替え
          switchTab("chats");
        } catch (error) {
          console.error('チャット開始エラー:', error);
          alert('チャットの開始に失敗しました');
        }
      });

      followingList.appendChild(userItem);
    });
  }

  // ユーザー検索
  async function searchUsers(query) {
    if (!query || query.length < 1) {
      searchResults.innerHTML = '';
      return;
    }

    try {
      const token = getAuthToken();
      const response = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('ユーザー検索に失敗しました');
      const users = await response.json();
      renderSearchResults(users);
    } catch (error) {
      console.error('ユーザー検索エラー:', error);
      searchResults.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--muted);">検索エラーが発生しました</div>';
    }
  }

  // 検索結果を表示
  function renderSearchResults(users) {
    searchResults.innerHTML = '';
    
    if (users.length === 0) {
      searchResults.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--muted);">該当するユーザーが見つかりませんでした</div>';
      return;
    }

    users.forEach(user => {
      const resultItem = document.createElement('div');
      resultItem.className = 'search-result-item';
      
      const info = document.createElement('div');
      info.className = 'search-result-info';

      const nameLink = document.createElement('a');
      nameLink.href = `/user/${user.user_id}`;
      nameLink.className = 'search-result-name';
      nameLink.style.textDecoration = 'none';
      nameLink.style.color = 'inherit';
      nameLink.style.cursor = 'pointer';
      nameLink.textContent = user.username || 'ユーザー';
      nameLink.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      
      const tag = document.createElement('div');
      tag.className = 'search-result-tag';
      tag.textContent = user.user_tag ? `#${user.user_tag}` : '';

      info.appendChild(nameLink);
      if (user.user_tag) {
        info.appendChild(tag);
      }

      const followBtn = document.createElement('button');
      followBtn.className = `follow-btn ${user.is_following ? 'following' : ''}`;
      followBtn.textContent = user.is_following ? 'フォロー中' : 'フォロー';
      followBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          const token = getAuthToken();
          const method = user.is_following ? 'DELETE' : 'POST';
          const response = await fetch(`/api/users/${user.user_id}/follow`, {
            method: method,
            headers: {
              "Authorization": `Bearer ${token}`
            }
          });
          if (response.ok) {
            user.is_following = !user.is_following;
            followBtn.textContent = user.is_following ? 'フォロー中' : 'フォロー';
            followBtn.classList.toggle('following', user.is_following);
            // フォロー一覧を更新
            if (currentTab === "following") {
              await fetchFollowingUsers();
            }
          }
        } catch (error) {
          console.error('フォロー操作エラー:', error);
          alert('フォロー操作に失敗しました');
        }
      });

      resultItem.appendChild(info);
      resultItem.appendChild(followBtn);

      resultItem.addEventListener('click', async () => {
        try {
          // 既存のルームを探す
          const existingRoom = rooms.find(r => r.other_user.user_id === user.user_id);
          if (existingRoom) {
            selectRoom(existingRoom.room_id, existingRoom.other_user);
          } else {
            // 新しいルームを作成
            const roomId = await createChatRoom(user.user_id);
            await fetchChatRooms();
            const newRoom = rooms.find(r => r.room_id === roomId);
            if (newRoom) {
              selectRoom(roomId, newRoom.other_user);
            } else {
              selectRoom(roomId, user);
            }
          }
          // チャットタブに切り替え
          switchTab("chats");
        } catch (error) {
          console.error('チャット開始エラー:', error);
          alert('チャットの開始に失敗しました');
        }
      });

      searchResults.appendChild(resultItem);
    });
  }

  // 初期化
  (async function init() {
    // ユーザー情報を取得
    await fetchCurrentUser();
    
    // ログインチェック
    const userId = getCurrentUserId();
    if (!userId) {
      alert('ログインが必要です');
      window.location.href = '/login';
      return;
    }
    
    updateCartCount();
    fetchChatRooms();
    fetchAllUsers();
    
    // タブイベント
    if (tabChats) {
      tabChats.addEventListener("click", () => switchTab("chats"));
    }
    if (tabFollowing) {
      tabFollowing.addEventListener("click", () => switchTab("following"));
    }
    if (tabSearch) {
      tabSearch.addEventListener("click", () => switchTab("search"));
    }
    
    // 検索入力
    if (userSearchInput) {
      userSearchInput.addEventListener("input", (e) => {
        const query = e.target.value.trim();
        if (searchTimeout) {
          clearTimeout(searchTimeout);
        }
        searchTimeout = setTimeout(() => {
          searchUsers(query);
        }, 300);
      });
    }
  })();
})();
