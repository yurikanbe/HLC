/**
 * signup.html専用のJavaScript
 * アカウント作成処理（OTP検証付き）
 */

// DOM要素の取得
const nameEl = document.getElementById("displayName");
const emailEl = document.getElementById("email");
const passEl = document.getElementById("password");
const signupBtn = document.getElementById("signup");
const msgEl = document.getElementById("msg");

// セッション管理
function setSession(token, userInfo) {
  localStorage.setItem("japanft_token", token);
  localStorage.setItem("japanft_user", JSON.stringify(userInfo));
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

// アカウント作成処理
async function initSignup() {
  if (!signupBtn) return;
  
  // ユーザータイプ選択UIを追加（簡易版）
  const userTypeSelect = document.createElement("select");
  userTypeSelect.id = "userType";
  userTypeSelect.className = "input";
  userTypeSelect.innerHTML = `
    <option value="user">一般ユーザー</option>
    <option value="seller">出品者</option>
  `;
  
  // フォームに挿入
  if (nameEl && nameEl.parentNode) {
    nameEl.parentNode.insertBefore(userTypeSelect, nameEl);
  }
  
  let step = 1; // 1: アカウント作成, 2: OTP検証
  
  // ユーザータイプ変更時の処理
  userTypeSelect.addEventListener("change", () => {
    const isSeller = userTypeSelect.value === "seller";
    if (nameEl) {
      nameEl.placeholder = isSeller ? "ユーザー名（5桁の英数字）" : "表示名（任意）";
      nameEl.required = isSeller;
    }
    if (passEl) {
      passEl.required = isSeller;
      passEl.placeholder = isSeller ? "パスワード（必須）" : "パスワード（任意）";
    }
  });
  
  // UI更新関数
  function updateUI() {
    if (step === 1) {
      // ステップ1: アカウント作成フォーム
      if (nameEl) nameEl.style.display = "block";
      if (emailEl) emailEl.style.display = "block";
      if (passEl) {
        passEl.style.display = "block";
        passEl.type = "password";
        passEl.maxLength = null; // 制限を削除
        passEl.removeAttribute("maxLength"); // maxLength属性を削除
        passEl.autocomplete = "new-password";
        passEl.placeholder = userTypeSelect.value === "seller" ? "パスワード（必須）" : "パスワード（任意）";
      }
      userTypeSelect.style.display = "block";
      signupBtn.textContent = "アカウント作成";
      if (msgEl) msgEl.textContent = "";
    } else {
      // ステップ2: OTP入力
      if (nameEl) nameEl.style.display = "none";
      if (emailEl) emailEl.style.display = "none";
      if (passEl) {
        passEl.style.display = "block";
        passEl.type = "text";
        passEl.placeholder = "6桁のOTPコード";
        passEl.maxLength = 6;
        passEl.autocomplete = "one-time-code";
        passEl.value = "";
      }
      userTypeSelect.style.display = "none";
      signupBtn.textContent = "OTPを確認";
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
        signupBtn.parentNode.insertBefore(resendBtn, signupBtn.nextSibling);
      }
      
      // タイマーを開始
      startResendTimer(resendBtn);
    }
  }
  
  updateUI();
  
  signupBtn.addEventListener("click", async () => {
    if (step === 1) {
      // ステップ1: アカウント作成
      const userType = userTypeSelect.value;
      const username = nameEl?.value.trim();
      const email = emailEl?.value.trim();
      const password = passEl?.value;
      
      // バリデーション
      if (userType === "seller") {
        if (!username || username.length !== 5) {
          if (msgEl) msgEl.textContent = "出品者は5桁のユーザー名が必須です";
          return;
        }
        if (!/^[a-zA-Z0-9]{5}$/.test(username)) {
          if (msgEl) msgEl.textContent = "ユーザー名は5桁の英数字である必要があります";
          return;
        }
        if (!password || password.length < 6) {
          if (msgEl) msgEl.textContent = "出品者は6文字以上のパスワードが必須です";
          return;
        }
      }
      
      if (!email) {
        if (msgEl) msgEl.textContent = "メールアドレスを入力してください";
        return;
      }
      
      try {
        signupBtn.disabled = true;
        signupBtn.textContent = "作成中...";
        const response = await fetch("/api/auth/signup", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: username || null,
            email: email,
            password: password || null,
            user_type: userType
          })
        });
        
        if (!response.ok) {
          let errorMessage = "アカウント作成に失敗しました";
          try {
            const error = await response.json();
            errorMessage = error.detail || error.message || errorMessage;
          } catch (e) {
            // JSONレスポンスがない場合
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
        signupBtn.disabled = false;
        signupBtn.textContent = "アカウント作成";
        step = 2;
        updateUI();
        if (passEl) passEl.focus();
      } catch (error) {
        console.error("アカウント作成エラー:", error);
        signupBtn.disabled = false;
        signupBtn.textContent = "アカウント作成";
        if (msgEl) msgEl.textContent = error.message || "エラーが発生しました";
      }
    } else {
      // ステップ2: OTP検証
      const email = emailEl?.value.trim();
      const otp = passEl?.value.trim();
      
      if (!otp || otp.length !== 6) {
        if (msgEl) msgEl.textContent = "6桁のOTPコードを入力してください";
        return;
      }
      
      try {
        signupBtn.disabled = true;
        signupBtn.textContent = "確認中...";
        const response = await fetch("/api/auth/signup/verify", {
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
        
        signupBtn.disabled = false;
        signupBtn.textContent = "OTPを確認";
        if (msgEl) msgEl.textContent = "アカウントを作成しました。リダイレクトします...";
        // トークンが確実に保存されるまで少し待つ
        await new Promise(resolve => setTimeout(resolve, 100));
        // トークンが保存されているか確認
        const token = localStorage.getItem("japanft_token");
        if (token) {
          window.location.href = "/";
        } else {
          if (msgEl) msgEl.textContent = "アカウント作成状態の保存に失敗しました";
        }
      } catch (error) {
        console.error("OTP認証エラー:", error);
        signupBtn.disabled = false;
        signupBtn.textContent = "OTPを確認";
        if (msgEl) msgEl.textContent = error.message || "エラーが発生しました";
      }
    }
  });
  
  // Enterキーで送信
  if (nameEl) {
    nameEl.addEventListener("keydown", async (e) => {
      if (e.key === "Enter" && step === 1) {
        e.preventDefault();
        signupBtn.click();
      }
    });
  }
  
  if (emailEl) {
    emailEl.addEventListener("keydown", async (e) => {
      if (e.key === "Enter" && step === 1) {
        e.preventDefault();
        signupBtn.click();
      }
    });
  }
  
  if (passEl) {
    passEl.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        signupBtn.click();
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
        const response = await fetch("/api/auth/signup/resend", {
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
  document.addEventListener('DOMContentLoaded', initSignup);
} else {
  initSignup();
}
