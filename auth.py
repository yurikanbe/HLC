"""
認証機能モジュール
- 4桁番号ログイン
- 出品者のみパスワード+5桁ユーザー名必須
"""
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
import secrets
import random
import smtplib
import os
from pathlib import Path
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr

# .envファイルを読み込む（python-dotenvを使用）
try:
    from dotenv import load_dotenv
    # プロジェクトのルートディレクトリを探す
    env_path = Path(__file__).parent / '.env'
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)
    else:
        # ルートディレクトリの.envも探す
        load_dotenv()
except ImportError:
    # python-dotenvがインストールされていない場合はスキップ
    pass

# パスワードハッシュ化
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT設定
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    raise ValueError(
        "JWT_SECRET_KEY環境変数が設定されていません。"
        "本番環境では必ず環境変数からシークレットキーを設定してください。"
    )
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30 * 24 * 60  # 30日間

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """パスワード検証"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """パスワードをハッシュ化"""
    return pwd_context.hash(password)

def generate_login_code() -> str:
    """4桁のログインコードを生成（後方互換性のため残す）"""
    return f"{random.randint(1000, 9999)}"

def generate_otp() -> str:
    """6桁のOTPを生成"""
    return f"{random.randint(100000, 999999)}"

def send_otp_email(email: str, otp: str, purpose: str = "ログイン", username: str = None) -> bool:
    """
    OTPをメールで送信
    
    Args:
        email: 送信先メールアドレス
        otp: 6桁のOTPコード
        purpose: メールの目的（ログイン/アカウント作成など）
    
    Returns:
        bool: 送信成功時True、失敗時False
    """
    # SMTP設定を環境変数から取得（設定されていない場合はデモモード）
    smtp_server = os.getenv("SMTP_SERVER", "")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_username = os.getenv("SMTP_USERNAME", "")
    smtp_password = os.getenv("SMTP_PASSWORD", "")
    smtp_from_email = os.getenv("SMTP_FROM_EMAIL", smtp_username)
    smtp_from_name = os.getenv("SMTP_FROM_NAME", "japanft")
    smtp_use_tls = os.getenv("SMTP_USE_TLS", "true").lower() == "true"
    
    # SMTP設定が無い場合はデモモード（コンソール出力）
    if not smtp_server or not smtp_username or not smtp_password:
        demo_greeting = f"こんにちは{username}さん、" if username else "こんにちは、"
        print(f"[デモ] メール送信: {email} に6桁のOTPコード {otp} を送信しました（{purpose}用）")
        print(f"      件名: 【japanft】{purpose}用のOTPコード")
        print(f"      本文: {demo_greeting}")
        print(f"      SMTP設定が未設定のため、実際のメールは送信されません。")
        print(f"      環境変数 SMTP_SERVER, SMTP_USERNAME, SMTP_PASSWORD を設定してください。")
        return True
    
    try:
        # メール本文を作成
        subject = f"【japanft】{purpose}用のOTPコード"
        
        # HTMLメール本文
        greeting = f"こんにちは{username}さん、" if username else "こんにちは、"
        html_body = f"""
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #4CAF50;">japanft - OTPコード</h2>
                <p>{greeting}</p>
                <p>{purpose}用のOTPコードをお送りします。</p>
                <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px;">
                    <h1 style="color: #4CAF50; font-size: 32px; margin: 0; letter-spacing: 5px;">{otp}</h1>
                </div>
                <p>このコードは10分間有効です。</p>
                <p>このメールに心当たりがない場合は、無視してください。</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="color: #999; font-size: 12px;">このメールは自動送信されています。返信しないでください。</p>
            </div>
        </body>
        </html>
        """
        
        # テキストメール本文
        text_greeting = f"こんにちは{username}さん、" if username else "こんにちは、"
        text_body = f"""
japanft - OTPコード

{text_greeting}

{purpose}用のOTPコードをお送りします。

OTPコード: {otp}

このコードは10分間有効です。

このメールに心当たりがない場合は、無視してください。

---
このメールは自動送信されています。返信しないでください。
        """
        
        # メールメッセージを作成
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = formataddr((smtp_from_name, smtp_from_email))
        msg['To'] = email
        
        # HTMLとテキストの両方を追加
        part1 = MIMEText(text_body, 'plain', 'utf-8')
        part2 = MIMEText(html_body, 'html', 'utf-8')
        msg.attach(part1)
        msg.attach(part2)
        
        # SMTPサーバーに接続してメール送信
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            if smtp_use_tls:
                server.starttls()
            server.login(smtp_username, smtp_password)
            server.send_message(msg)
        
        print(f"[メール送信成功] {email} にOTPコードを送信しました（{purpose}用）")
        return True
        
    except smtplib.SMTPAuthenticationError as e:
        print(f"[メール送信エラー] SMTP認証に失敗しました: {str(e)}")
        print(f"      SMTP_USERNAME と SMTP_PASSWORD を確認してください。")
        return False
    except smtplib.SMTPException as e:
        print(f"[メール送信エラー] SMTPエラーが発生しました: {str(e)}")
        return False
    except Exception as e:
        print(f"[メール送信エラー] 予期しないエラーが発生しました: {str(e)}")
        return False

def generate_wallet_address() -> str:
    """仮想ウォレットアドレスを生成（デモ用）"""
    # 実際の実装では、ECDSA鍵ペアから生成
    return "0x" + secrets.token_hex(20)

def create_access_token(data: dict, expires_delta: timedelta = None):
    """JWTトークンを作成"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str):
    """JWTトークンをデコード"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError as e:
        print(f"DEBUG: decode_access_token - JWTError: {type(e).__name__}: {str(e)}")
        return None
    except Exception as e:
        print(f"DEBUG: decode_access_token - Unexpected error: {type(e).__name__}: {str(e)}")
        return None

def validate_username(username: str, user_type: str) -> tuple[bool, str]:
    """ユーザー名の検証（出品者のみ5桁必須）"""
    if user_type == "seller":
        if not username:
            return False, "出品者はユーザー名（5桁）が必須です"
        if len(username) != 5:
            return False, "出品者のユーザー名は5桁である必要があります"
        if not username.isalnum():
            return False, "ユーザー名は英数字のみ使用できます"
    return True, ""

def validate_password(password: str, user_type: str) -> tuple[bool, str]:
    """パスワードの検証（出品者のみ必須）"""
    if user_type == "seller":
        if not password:
            return False, "出品者はパスワードが必須です"
        if len(password) < 6:
            return False, "パスワードは6文字以上である必要があります"
    return True, ""

def generate_user_tag(db: Session) -> str:
    """4桁のユーザー識別子を生成（#0001-#9999）"""
    import random
    max_attempts = 1000
    
    for _ in range(max_attempts):
        # 0001から9999までのランダムな4桁の数字を生成
        tag = str(random.randint(1, 9999)).zfill(4)
        
        # 既存のユーザーで使用されていないか確認
        from database import User
        existing = db.query(User).filter(User.user_tag == tag).first()
        if not existing:
            return tag
    
    # 1000回試行しても見つからない場合は、連番で生成
    # これは非常に稀なケース（9999人以上のユーザーが存在する場合）
    for i in range(1, 10000):
        tag = str(i).zfill(4)
        existing = db.query(User).filter(User.user_tag == tag).first()
        if not existing:
            return tag
    
    # それでも見つからない場合はエラー
    raise ValueError("利用可能なユーザー識別子が見つかりません")

def validate_wallet_address(wallet_address: str) -> tuple[bool, str]:
    """ウォレットアドレスの検証"""
    if not wallet_address:
        return False, "ウォレットアドレスは必須です"
    
    # 0xで始まる42文字の16進数文字列かチェック
    if not wallet_address.startswith("0x"):
        return False, "ウォレットアドレスは0xで始まる必要があります"
    
    if len(wallet_address) != 42:
        return False, "ウォレットアドレスは42文字である必要があります（0xを含む）"
    
    # 16進数文字列かチェック（0x以降）
    hex_part = wallet_address[2:]
    try:
        int(hex_part, 16)
    except ValueError:
        return False, "ウォレットアドレスは有効な16進数である必要があります"
    
    return True, ""

# 管理者認証情報（環境変数から取得）
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")

if not ADMIN_USERNAME or not ADMIN_PASSWORD:
    raise ValueError(
        "ADMIN_USERNAME と ADMIN_PASSWORD 環境変数が設定されていません。"
        "管理者認証情報は必ず環境変数から設定してください。"
    )

def verify_admin_credentials(username: str, password: str) -> bool:
    """管理者認証情報を検証"""
    return username == ADMIN_USERNAME and password == ADMIN_PASSWORD

def create_admin_token() -> str:
    """管理者用のJWTトークンを作成"""
    return create_access_token(data={"sub": "admin", "role": "admin"})

def verify_admin_token(token: str) -> bool:
    """管理者トークンを検証"""
    payload = decode_access_token(token)
    if payload is None:
        return False
    return payload.get("role") == "admin" and payload.get("sub") == "admin"

