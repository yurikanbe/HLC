/**
 * login.html専用のJavaScript
 * メアド+パスワード → 6桁OTP認証実装
 */

// DOM要素の取得
const emailEl = document.getElementById("email");
const passEl = document.getElementById("password");
const loginBtn = document.getElementById("login");
const msgEl = document.getElementById("msg");

// セッション管理
function setSession(token, userInfo) {
  localStorage.setItem("japanft_token", token);
  localStorage.setItem("japanft_user", JSON.stringify(userInfo));
}

// ログイン処理（メアド+パスワードで認証、OTP送信）
async function requestLogin() {
  const email = emailEl?.value.trim();
  const password = passEl?.value;
  
  if (!email) {
    if (msgEl) msgEl.textContent = "メールアドレスを入力してください";
    return false;
  }
  
  if (!password) {
    if (msgEl) msgEl.textContent = "パスワードを入力してください";
    return false;
  }
  
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: email, password: password })
    });
    
    if (!response.ok) {
      let errorMessage = "ログインに失敗しました";
      try {
        const error = await response.json();
        errorMessage = error.detail || error.message || errorMessage;
      } catch (e) {
        if (response.status === 404) {
          errorMessage = "APIエンドポイントが見つかりません。サーバーが起動しているか確認してください。";
        } else if (response.status === 500) {
          errorMessage = "サーバーエラーが発生しました";
        } else {
          errorMessage = `エラーが発生しました (ステータス: ${response.status})`;
        }
      }
      throw new Error(errorMessage);
    }
    
    const data = await response.json();
    return true;
  } catch (error) {
    console.error("ログインエラー:", error);
    if (msgEl) msgEl.textContent = error.message || "エラーが発生しました";
    return false;
  }
}

// OTP検証
async function verifyOtp(otp) {
  const email = emailEl?.value.trim();
  
  if (!email || !otp) {
    if (msgEl) msgEl.textContent = "メールアドレスとOTPコードを入力してください";
    return false;
  }
  
  try {
    const response = await fetch("/api/auth/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: email,
        otp: otp
      })
    });
    
    if (!response.ok) {
      let errorMessage = "OTP認証に失敗しました";
      try {
        const error = await response.json();
        errorMessage = error.detail || error.message || errorMessage;
      } catch (e) {
        if (response.status === 404) {
          errorMessage = "APIエンドポイントが見つかりません。サーバーが起動しているか確認してください。";
        } else if (response.status === 500) {
          errorMessage = "サーバーエラーが発生しました";
        } else {
          errorMessage = `エラーが発生しました (ステータス: ${response.status})`;
        }
      }
      throw new Error(errorMessage);
    }
    
    const data = await response.json();
    
    // セッションを保存
    setSession(data.access_token, {
      user_id: data.user_id,
      username: data.username,
      user_type: data.user_type
    });
    
    return true;
  } catch (error) {
    console.error("OTP認証エラー:", error);
    if (msgEl) msgEl.textContent = error.message || "エラーが発生しました";
    return false;
  }
}

// 再送タイマー関数
function startResendTimer(resendBtn) {
  let countdown = 30;
  resendBtn.disabled = true;
  resendBtn.textContent = `OTPを再送 (${countdown}秒後)`;
  
  const timer = setInterval(() => {
    countdown--;
    resendBtn.textContent = `OTPを再送 (${countdown}秒後)`;
    
    if (countdown <= 0) {
      clearInterval(timer);
      resendBtn.disabled = false;
      resendBtn.textContent = "OTPを再送";
    }
  }, 1000);
}

// ログイン処理
async function initLogin() {
  if (!loginBtn) return;
  
  let step = 1; // 1: メアド+パスワード入力, 2: OTP入力
  
  // UI更新関数
  function updateUI() {
    if (step === 1) {
      // ステップ1: メアド+パスワード入力
      if (passEl) {
        passEl.style.display = "block";
        passEl.type = "password";
        passEl.placeholder = "パスワード";
        passEl.maxLength = null; // 制限を削除
        passEl.removeAttribute("maxLength"); // maxLength属性を削除
        passEl.autocomplete = "current-password";
        passEl.value = "";
      }
      loginBtn.textContent = "ログイン";
      if (msgEl) msgEl.textContent = "";
    } else {
      // ステップ2: OTP入力
      if (passEl) {
        passEl.style.display = "block";
        passEl.type = "text";
        passEl.placeholder = "6桁のOTPコード";
        passEl.maxLength = 6;
        passEl.autocomplete = "one-time-code";
        passEl.value = "";
      }
      loginBtn.textContent = "OTPを確認";
      if (msgEl) msgEl.textContent = "メールに送信された6桁のOTPコードを入力してください";
      
      // 再送ボタンを追加
      let resendBtn = document.getElementById("resend-btn");
      if (!resendBtn) {
        resendBtn = document.createElement("button");
        resendBtn.id = "resend-btn";
        resendBtn.className = "btn";
        resendBtn.type = "button";
        resendBtn.textContent = "OTPを再送 (30秒後)";
        resendBtn.disabled = true;
        resendBtn.style.marginTop = "10px";
        resendBtn.style.display = "block";
        loginBtn.parentNode.insertBefore(resendBtn, loginBtn.nextSibling);
      }
      
      // タイマーを開始
      startResendTimer(resendBtn);
    }
  }
  
  updateUI();
  
  loginBtn.addEventListener("click", async () => {
    if (step === 1) {
      // ステップ1: メアド+パスワードで認証、OTP送信
      loginBtn.disabled = true;
      loginBtn.textContent = "処理中...";
      const success = await requestLogin();
      loginBtn.disabled = false;
      loginBtn.textContent = "ログイン";
      if (success) {
        step = 2;
        updateUI();
        if (passEl) passEl.focus();
      }
    } else {
      // ステップ2: OTPで認証
      const otp = passEl?.value.trim();
      if (!otp || otp.length !== 6) {
        if (msgEl) msgEl.textContent = "6桁のOTPコードを入力してください";
        return;
      }
      
      loginBtn.disabled = true;
      loginBtn.textContent = "確認中...";
      const success = await verifyOtp(otp);
      loginBtn.disabled = false;
      loginBtn.textContent = "OTPを確認";
      if (success) {
        if (msgEl) msgEl.textContent = "ログインしました。リダイレクトします...";
        // トークンが確実に保存されるまで少し待つ
        await new Promise(resolve => setTimeout(resolve, 100));
        // トークンが保存されているか確認
        const token = localStorage.getItem("japanft_token");
        if (token) {
          window.location.href = "/";
        } else {
          if (msgEl) msgEl.textContent = "ログイン状態の保存に失敗しました";
        }
      }
    }
  });
  
  // Enterキーで送信
  if (emailEl) {
    emailEl.addEventListener("keydown", async (e) => {
      if (e.key === "Enter" && step === 1) {
        e.preventDefault();
        loginBtn.click();
      }
    });
  }
  
  if (passEl) {
    passEl.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        loginBtn.click();
      }
    });
  }
  
  // 再送ボタンのイベント
  document.addEventListener("click", async (e) => {
    if (e.target.id === "resend-btn" && !e.target.disabled) {
      const email = emailEl?.value.trim();
      if (!email) {
        if (msgEl) msgEl.textContent = "メールアドレスが入力されていません";
        return;
      }
      
      e.target.disabled = true;
      e.target.textContent = "再送中...";
      
      try {
        const response = await fetch("/api/auth/login/resend", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email: email })
        });
        
        if (!response.ok) {
          let errorMessage = "OTP再送に失敗しました";
          try {
            const error = await response.json();
            errorMessage = error.detail || error.message || errorMessage;
          } catch (e) {
            // エラーハンドリング
          }
          throw new Error(errorMessage);
        }
        
        const data = await response.json();
        if (msgEl) msgEl.textContent = data.message || "OTPを再送信しました";
        // タイマーを再開
        startResendTimer(e.target);
      } catch (error) {
        console.error("OTP再送エラー:", error);
        if (msgEl) msgEl.textContent = error.message || "エラーが発生しました";
        e.target.disabled = false;
        e.target.textContent = "OTPを再送";
      }
    }
  });
}

// 初期化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLogin);
} else {
  initLogin();
}
