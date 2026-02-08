// mining.html用のJavaScript

(function() {
  'use strict';

  const toggleEl = document.getElementById("toggle");
  const resetEl = document.getElementById("reset");
  const rateEl = document.getElementById("rate");
  const foundEl = document.getElementById("found");
  const rewardEl = document.getElementById("reward");
  const logEl = document.getElementById("log");
  const cartCountEl = document.getElementById("cartCount");

  if (!toggleEl || !resetEl || !rateEl || !foundEl || !rewardEl || !logEl || !cartCountEl) {
    console.error('必要な要素が見つかりません');
    return;
  }
  
  // ユーザーのウォレットアドレスを保持する変数
  let userWalletAddress = null;

  const REWARD_PER_BLOCK = 25; // HLC（表示用）

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

  // 認証関連
  function getAuthToken() {
    return localStorage.getItem("japanft_token");
  }

  async function fetchUserWallet() {
    const token = getAuthToken();
    if (!token) {
      return null;
    }

    try {
      const response = await fetch("/api/auth/me", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          // トークンが無効
          localStorage.removeItem("japanft_token");
          localStorage.removeItem("japanft_user");
          return null;
        }
        throw new Error("ユーザー情報の取得に失敗しました");
      }

      const userInfo = await response.json();
      return userInfo.wallet_address;
    } catch (error) {
      console.error("ウォレットアドレス取得エラー:", error);
      return null;
    }
  }

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem("japanft_mining") || "{}");
    } catch (error) {
      console.error('マイニング状態の読み込みエラー:', error);
      return {};
    }
  }

  function saveState(s) {
    try {
      localStorage.setItem("japanft_mining", JSON.stringify(s));
    } catch (error) {
      console.error('マイニング状態の保存エラー:', error);
    }
  }

  function loadRecords() {
    try {
      return JSON.parse(localStorage.getItem("japanft_mining_records") || "[]");
    } catch (error) {
      console.error('マイニング記録の読み込みエラー:', error);
      return [];
    }
  }

  function saveRecords(r) {
    try {
      localStorage.setItem("japanft_mining_records", JSON.stringify(r));
    } catch (error) {
      console.error('マイニング記録の保存エラー:', error);
    }
  }

  function fmt(n) {
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function appendLog(text) {
    try {
      const d = new Date();
      const t = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
      logEl.textContent += `\n[${t}] ${text}`;
      logEl.scrollTop = logEl.scrollHeight;
    } catch (error) {
      console.error('ログ追加でエラーが発生しました:', error);
    }
  }

  // 簡易PoW: 32bit値の上位ビットが0なら採掘成功とみなす（難易度固定：低）
  const FIXED_DIFFICULTY = 1; // 固定難易度（低）
  let mining = false;
  let attempts = 0;
  let lastRateAt = performance.now();
  let lastAttempts = 0;
  let seed = Date.now() >>> 0;

  function xorshift() {
    // xorshift32
    seed ^= seed << 13;
    seed >>>= 0;
    seed ^= seed >> 17;
    seed >>>= 0;
    seed ^= seed << 5;
    seed >>>= 0;
    return seed >>> 0;
  }

  function toHex32(v) {
    return v.toString(16).padStart(8, '0');
  }

  function targetFromDifficulty(d) {
    const bits = Math.min(28, d * 4);
    return 0xffffffff >>> bits;
  }

  function updateStatsUI(state) {
    rateEl.textContent = `${Math.max(0, state.lastRateHps || 0).toFixed(0)} H/s`;
    foundEl.textContent = String(state.totalMined || 0);
    rewardEl.textContent = fmt(state.totalRewardEth || 0);
  }

  function syncInputs(state) {
    // ウォレットアドレスは自動取得するため、ここでは何もしない
    toggleEl.textContent = state.running ? "停止" : "開始";
    updateStatsUI(state);
  }

  let rafId = 0;

  // 実際のマイニングを実行
  let miningInProgress = false;
  let lastActualMiningTime = 0;
  let lastErrorTime = 0;
  let lastErrorMessage = "";
  const ACTUAL_MINING_INTERVAL = 10000; // 10秒に1回実際のマイニングを実行（重い処理のため間隔を長く）
  const ERROR_LOG_INTERVAL = 30000; // 同じエラーは30秒に1回だけ表示
  
  async function performActualMining(walletAddress) {
    if (miningInProgress) return;
    
    // レート制限: 短時間に複数回実行されないようにする
    const now = Date.now();
    if (now - lastActualMiningTime < ACTUAL_MINING_INTERVAL) {
      return;
    }
    lastActualMiningTime = now;
    
    const token = getAuthToken();
    if (!token) {
      return; // ログインしていない場合は静かにスキップ
    }
    
    if (!walletAddress || !walletAddress.startsWith("0x")) {
      return;
    }
    
    miningInProgress = true;
    try {
      const response = await fetch("/api/mining/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          wallet_address: walletAddress
        })
      });
      
      if (!response.ok) {
        let errorMsg = "エラーが発生しました";
        try {
          const error = await response.json();
          errorMsg = error.detail || error.message || `HTTP ${response.status}: ${response.statusText}`;
        } catch (e) {
          errorMsg = `HTTP ${response.status}: ${response.statusText}`;
        }
        
        // 同じエラーを繰り返し表示しない
        const now = Date.now();
        if (errorMsg !== lastErrorMessage || now - lastErrorTime > ERROR_LOG_INTERVAL) {
          appendLog(`❌ マイニングに失敗: ${errorMsg}`);
          console.error("マイニングエラー詳細:", {
            status: response.status,
            statusText: response.statusText,
            errorMsg: errorMsg
          });
          lastErrorMessage = errorMsg;
          lastErrorTime = now;
        }
        return;
      }
      
      const result = await response.json();
      if (result.success) {
        // エラーメッセージをリセット（成功したら）
        lastErrorMessage = "";
        
        const state = loadState();
        state.totalMined = (state.totalMined || 0) + 1;
        state.totalRewardEth = +((state.totalRewardEth || 0) + result.reward).toFixed(6);
        saveState(state);
        
        const recs = loadRecords();
        recs.unshift({ 
          ts: Date.now(), 
          difficulty: "actual", 
          hash: result.block_hash, 
          reward: result.reward 
        });
        // 記録は最大100件までに制限
        if (recs.length > 100) recs.pop();
        saveRecords(recs);
        
        appendLog(`✅ ブロックマイニング成功! ブロック#${result.block_number} 報酬 +${result.reward}HLC`);
        if (result.transaction_count === 0) {
          appendLog(`   (トランザクションなし - 報酬トランザクションのみ)`);
        } else {
          appendLog(`   (${result.transaction_count}件のトランザクションを含む)`);
        }
        appendLog(`   残高: ${fmt(result.new_balance)}HLC`);
        
        // UIを更新
        updateStatsUI(state);
        updateBalanceDisplay();
      } else {
        // successがfalseの場合
        const errorMsg = result.message || "マイニングに失敗しました";
        const now = Date.now();
        if (errorMsg !== lastErrorMessage || now - lastErrorTime > ERROR_LOG_INTERVAL) {
          appendLog(`マイニングに失敗: ${errorMsg}`);
          lastErrorMessage = errorMsg;
          lastErrorTime = now;
        }
      }
    } catch (error) {
      console.error("マイニングエラー:", error);
      // ネットワークエラーなどの場合も重複表示を防ぐ
      const errorMsg = error.message || "ネットワークエラー";
      const now = Date.now();
      if (errorMsg !== lastErrorMessage || now - lastErrorTime > ERROR_LOG_INTERVAL) {
        appendLog(`マイニング中にエラーが発生しました: ${errorMsg}`);
        lastErrorMessage = errorMsg;
        lastErrorTime = now;
      }
    } finally {
      miningInProgress = false;
    }
  }

  function loop() {
    if (!mining) return;
    
    try {
      const state = loadState();
      
      // デモ用マイニングを無効化し、実際のマイニングのみを実行
      // 実際のマイニングはサーバー側で実行されるため、定期的にAPIを呼び出す
      // performActualMining内で間隔制限があるため、頻繁に呼び出しても問題ない
      if (userWalletAddress && userWalletAddress.startsWith("0x") && !miningInProgress) {
        performActualMining(userWalletAddress);
      }
      
      // ハッシュレートの計算（実際のマイニングの試行回数をシミュレート）
      // 実際のマイニングはサーバー側で実行されるため、クライアント側では概算値を表示
      attempts += 100; // 仮の試行回数（実際のマイニングの進行を表現、値を減らして軽量化）
      
      // 状態を保存（頻繁に保存しないように、1秒に1回だけ）
      const now = performance.now();
      if (now - lastRateAt >= 1000) {
        const hps = (attempts - lastAttempts) / ((now - lastRateAt) / 1000);
        lastAttempts = attempts;
        lastRateAt = now;
        const s = loadState();
        s.lastRateHps = hps;
        saveState(s);
        updateStatsUI(s);
      }
      
      // 次のフレームで再実行（実際のマイニングは間隔制限があるため、頻繁に呼ばれても問題ない）
      rafId = requestAnimationFrame(loop);
    } catch (error) {
      console.error('マイニングループでエラーが発生しました:', error);
      mining = false;
      toggleEl.textContent = "開始";
    }
  }

  // イベント
  toggleEl.addEventListener("click", async () => {
    try {
      // ウォレットアドレスが取得されていない場合は取得を試みる
      if (!userWalletAddress) {
        await loadWalletAddress();
      }
      
      if (!userWalletAddress || !userWalletAddress.startsWith("0x")) {
        appendLog("警告: ログインしてウォレットアドレスを設定してください");
        return;
      }
      
      const s = loadState();
      s.running = !s.running;
      mining = s.running;
      saveState(s);
      toggleEl.textContent = mining ? "停止" : "開始";
      appendLog(mining ? "マイニングを開始" : "マイニングを停止");
      if (mining) {
        lastRateAt = performance.now();
        lastAttempts = attempts;
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(loop);
      } else {
        cancelAnimationFrame(rafId);
      }
    } catch (error) {
      console.error('マイニング開始/停止でエラーが発生しました:', error);
    }
  });

  // 難易度選択は削除（固定難易度を使用）
  // ウォレットアドレス入力欄が削除されたため、イベントリスナーも削除

  resetEl.addEventListener("click", () => {
    try {
      const s = loadState();
      s.totalMined = 0;
      s.totalRewardEth = 0;
      s.lastRateHps = 0;
      saveState(s);
      updateStatsUI(s);
      appendLog("統計をリセット");
    } catch (error) {
      console.error('統計リセットでエラーが発生しました:', error);
    }
  });

  // マイニング報酬をサーバーに送信
  async function addMiningReward(walletAddress, rewardAmount) {
    const token = getAuthToken();
    if (!token) {
      appendLog("警告: ログインしていないため、報酬はローカルのみ記録されます");
      return;
    }
    
    if (!walletAddress || !walletAddress.startsWith("0x")) {
      appendLog("警告: 有効なウォレットアドレスが設定されていません");
      return;
    }
    
    try {
      const response = await fetch("/api/mining/reward", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          wallet_address: walletAddress,
          reward_amount: rewardAmount
        })
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: "エラーが発生しました" }));
        appendLog(`報酬の記録に失敗: ${error.detail || "エラーが発生しました"}`);
        return;
      }
      
      const result = await response.json();
        appendLog(`報酬が記録されました: 残高 ${fmt(result.new_balance)}HLC`);
      
      // 残高を更新表示
      updateBalanceDisplay();
    } catch (error) {
      console.error("報酬送信エラー:", error);
      appendLog("報酬の記録中にエラーが発生しました");
    }
  }
  
  // 残高を取得して表示
  async function updateBalanceDisplay() {
    const token = getAuthToken();
    if (!token) return;
    
    try {
      const response = await fetch("/api/wallet/balance", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        // 残高をログに表示（必要に応じてUIに追加可能）
        appendLog(`利用可能残高: ${fmt(data.total_balance)}HLC（DB） / ブロックチェーン: ${fmt(data.blockchain_balance)}HLC`);
      }
    } catch (error) {
      console.error("残高取得エラー:", error);
    }
  }

  // マイニングステータスを取得
  async function loadMiningStatus() {
    try {
      const response = await fetch("/api/mining/status");
      if (response.ok) {
        const status = await response.json();
        appendLog(`現在の難易度: ${status.current_difficulty}, ブロック数: ${status.block_count}, トランザクションプール: ${status.transaction_pool_count}`);
        if (status.transaction_pool_count === 0) {
          appendLog(`⚠️ トランザクションプールが空です。マイニングは可能ですが、報酬トランザクションのみのブロックになります。`);
        }
      }
    } catch (error) {
      console.error("マイニングステータス取得エラー:", error);
    }
  }

  // 初期化
  // ユーザーのウォレットアドレスを自動取得
  async function loadWalletAddress() {
    const walletAddress = await fetchUserWallet();
    if (walletAddress) {
      userWalletAddress = walletAddress;
      appendLog(`ウォレットアドレスを取得しました（自動設定）`);
      
      // 残高を表示
      await updateBalanceDisplay();
      // マイニングステータスを表示
      await loadMiningStatus();
    } else {
      userWalletAddress = null;
      appendLog("警告: ログインしていないため、マイニングできません");
    }
  }

  (async function init() {
    try {
      const s = Object.assign({ running: false, totalMined: 0, totalRewardEth: 0, lastRateHps: 0 }, loadState());
      saveState(s);
      await loadWalletAddress();
      syncInputs(s);
      updateCartCount();
      appendLog("準備完了");
      if (s.running) {
        mining = true;
        rafId = requestAnimationFrame(loop);
      }
    } catch (error) {
      console.error('初期化でエラーが発生しました:', error);
    }
  })();
})();

