from fastapi import FastAPI, HTTPException, Request, Depends, UploadFile, File, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ValidationError
from fastapi.exceptions import RequestValidationError
import uvicorn
from ecdsa import SigningKey, VerifyingKey, SECP256k1
import binascii
import json
import blockchain
from typing import List, Dict, Any
from pathlib import Path
from sqlalchemy.orm import Session
import os
import uuid
import shutil
from database import init_db, get_db, seed_initial_data, NFT as NFTModel, Listing, User, ChatRoom, ChatMessage, Transaction as TransactionModel, Favorite, Follow, Notification
from auth import (
    get_password_hash, verify_password, generate_login_code, generate_wallet_address,
    create_access_token, decode_access_token, validate_username, validate_password,
    validate_wallet_address, verify_admin_credentials, create_admin_token, verify_admin_token,
    generate_user_tag, generate_otp, send_otp_email
)
from datetime import datetime, timedelta
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi import Depends
from fastapi import status

class Transaction(BaseModel):
    time: str
    sender: str
    receiver: str
    amount: int
    nft_data: str
    nft_origin: str
    signature: str



class Block(BaseModel):
    time: str
    transactions: List[Transaction]
    hash: str
    previous_hash: str | None = None
    nonce: int


class Chain(BaseModel):
    blocks: List[Block]


# NFT関連のモデル
class NFT(BaseModel):
    id: int
    name: str
    description: str | None = None
    image: str
    priceEth: float
    likes: int = 0
    is_liked: bool = False
    creator: str | None = None
    creator_id: int | None = None
    owner: str | None = None
    owner_id: int | None = None
    category: str | None = None
    created_at: str | None = None
    blockchain_hash: str | None = None  # ブロックチェーン上のトランザクションハッシュ


blockchain=blockchain.BlockChain()
blockchain.transaction_pool = blockchain.load_transaction_pool()
blockchain.chain = blockchain.load_blockchain()
blockchain.set_all_block_transactions()
blockchain.get_my_address()
app=FastAPI()

# データベース初期化（アプリ起動時）
@app.on_event("startup")
async def startup_event():
    """アプリケーション起動時の初期化処理"""
    try:
        init_db()
        print("データベースを初期化しました")
        
        # 初期データ投入（既にデータがある場合はスキップ）
        from database import SessionLocal
        db = SessionLocal()
        try:
            seed_initial_data(db)
            print("初期データの投入が完了しました")
            
            # 既存ユーザーに識別子を付与
            users_without_tag = db.query(User).filter(User.user_tag.is_(None)).all()
            if users_without_tag:
                print(f"既存ユーザー {len(users_without_tag)} 人に識別子を付与します...")
                for user in users_without_tag:
                    try:
                        user.user_tag = generate_user_tag(db)
                        print(f"  ユーザー {user.user_id} ({user.username}) に識別子 {user.user_tag} を付与")
                    except Exception as e:
                        print(f"  ユーザー {user.user_id} への識別子付与に失敗: {e}")
                db.commit()
                print("既存ユーザーへの識別子付与が完了しました")
        finally:
            db.close()
    except Exception as e:
        print(f"データベース初期化エラー: {e}")

# CORS設定（フロントエンドからのAPI呼び出しを許可）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 本番環境では適切なオリジンを指定
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 静的ファイルとテンプレートの設定
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# エラーハンドラー（templates定義後に配置）
@app.exception_handler(404)
async def not_found_handler(request: Request, exc: HTTPException):
    """404エラーハンドラー"""
    return templates.TemplateResponse("error.html", {
        "request": request,
        "code": 404
    }, status_code=404)

@app.exception_handler(500)
async def internal_error_handler(request: Request, exc: Exception):
    """500エラーハンドラー"""
    return templates.TemplateResponse("error.html", {
        "request": request,
        "code": 500
    }, status_code=500)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """バリデーションエラーハンドラー（422エラー）"""
    # APIエンドポイントの場合はJSONで返す
    if request.url.path.startswith("/api/"):
        return JSONResponse(
            status_code=422,
            content={
                "detail": exc.errors(),
                "body": exc.body
            }
        )
    else:
        # HTMLページの場合はエラーページを返す
        return templates.TemplateResponse("error.html", {
            "request": request,
            "code": 422,
            "message": f"バリデーションエラー: {exc.errors()}"
        }, status_code=422)

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """HTTP例外ハンドラー"""
    status_code = exc.status_code
    
    # APIエンドポイントの場合はJSONで返す
    if request.url.path.startswith("/api/"):
        return JSONResponse(
            status_code=status_code,
            content={"detail": exc.detail}
        )
    
    # HTMLページの場合はエラーページを返す
    if status_code == 404:
        return templates.TemplateResponse("error.html", {
            "request": request,
            "code": 404,
            "message": exc.detail
        }, status_code=404)
    elif status_code == 500:
        return templates.TemplateResponse("error.html", {
            "request": request,
            "code": 500,
            "message": exc.detail
        }, status_code=500)
    elif status_code == 403:
        return templates.TemplateResponse("error.html", {
            "request": request,
            "code": 403,
            "message": exc.detail
        }, status_code=403)
    elif status_code == 401:
        return templates.TemplateResponse("error.html", {
            "request": request,
            "code": 401,
            "message": exc.detail
        }, status_code=401)
    elif status_code == 503:
        return templates.TemplateResponse("error.html", {
            "request": request,
            "code": 503,
            "message": exc.detail
        }, status_code=503)
    else:
        # その他のHTTPエラー
        return templates.TemplateResponse("error.html", {
            "request": request,
            "code": status_code,
            "message": exc.detail
        }, status_code=status_code)

# アップロードファイル保存ディレクトリ
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)
# アップロードファイルを静的ファイルとして提供
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# HTMLページのルート（テンプレートレンダリング）
@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    """メインページ"""
    # ブロックチェーンの基本情報を取得
    chain_info = {
        "block_count": len(blockchain.chain.get("blocks", [])),
        "transaction_pool_count": len(blockchain.transaction_pool.get("transactions", []))
    }
    return templates.TemplateResponse("index.html", {
        "request": request,
        "chain_info": chain_info
    })

@app.get("/search", response_class=HTMLResponse)
async def search_page(request: Request, q: str = ""):
    """検索ページ"""
    return templates.TemplateResponse("search.html", {
        "request": request,
        "query": q
    })

@app.get("/purchases", response_class=HTMLResponse)
async def purchases_page(request: Request):
    """購入履歴ページ"""
    return templates.TemplateResponse("purchases.html", {
        "request": request
    })

@app.get("/cart", response_class=HTMLResponse)
async def cart_page(request: Request):
    """カートページ"""
    return templates.TemplateResponse("cart.html", {
        "request": request
    })

@app.get("/checkout", response_class=HTMLResponse)
async def checkout_page(request: Request):
    """チェックアウトページ"""
    return templates.TemplateResponse("checkout.html", {
        "request": request
    })

@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    """ログインページ"""
    return templates.TemplateResponse("login.html", {
        "request": request
    })

@app.get("/signup", response_class=HTMLResponse)
async def signup_page(request: Request):
    """アカウント作成ページ"""
    return templates.TemplateResponse("signup.html", {
        "request": request
    })

@app.get("/terms", response_class=HTMLResponse)
async def terms_page(request: Request):
    """利用規約ページ"""
    return templates.TemplateResponse("terms.html", {
        "request": request
    })

@app.get("/tutorial", response_class=HTMLResponse)
async def tutorial_page(request: Request):
    """使い方ガイドページ"""
    try:
        return templates.TemplateResponse("tutorial.html", {
            "request": request
        })
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"[TUTORIAL ERROR] Exception: {type(e).__name__}: {str(e)}")
        print(f"[TUTORIAL ERROR] Traceback:\n{error_trace}")
        raise HTTPException(status_code=500, detail=f"使い方ガイドページの読み込み中にエラーが発生しました: {type(e).__name__}: {str(e)}")

# ========== 認証API ==========

class LoginRequest(BaseModel):
    email: str
    password: str

class LoginVerifyRequest(BaseModel):
    email: str
    otp: str

class ResendOtpRequest(BaseModel):
    email: str

class SignupRequest(BaseModel):
    username: str | None = None
    email: str | None = None
    password: str | None = None
    user_type: str = "user"  # user or seller

class SignupVerifyRequest(BaseModel):
    email: str
    otp: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    username: str | None
    user_type: str
    user_tag: str | None = None

# セキュリティ
security = HTTPBearer(auto_error=False)

def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db)
):
    """現在のユーザーを取得（認証ミドルウェア）"""
    # HTTPBearerからトークンを取得を試みる
    token = None
    if credentials:
        token = credentials.credentials
    
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="認証が必要です")
    
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="無効なトークンです")
    
    user_id_str = payload.get("sub")
    if user_id_str is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="無効なトークンです")
    
    # user_idを整数に変換（JWTのsubは文字列として保存されている）
    try:
        user_id = int(user_id_str)
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="無効なトークンです")
    
    user = db.query(User).filter(User.user_id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="ユーザーが見つかりません")
    
    return user

def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db)
):
    """現在のユーザーを取得（認証オプショナル、失敗時はNoneを返す）"""
    if not credentials:
        return None
    
    token = credentials.credentials
    if not token:
        return None
    
    payload = decode_access_token(token)
    if payload is None:
        return None
    
    user_id_str = payload.get("sub")
    if user_id_str is None:
        return None
    
    try:
        user_id = int(user_id_str)
    except (ValueError, TypeError):
        return None
    
    user = db.query(User).filter(User.user_id == user_id).first()
    return user

def get_admin_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security)
):
    """管理者を取得（認証ミドルウェア）"""
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="認証が必要です")
    
    token = credentials.credentials
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="認証が必要です")
    
    if not verify_admin_token(token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="管理者権限が必要です")
    
    return {"role": "admin", "username": "hewbc1"}

@app.post("/api/auth/login", response_model=dict)
async def request_login(request: LoginRequest, db: Session = Depends(get_db)):
    """メアド+パスワードで認証し、6桁OTPをメール送信"""
    try:
        # メールアドレスでユーザーを検索
        user = db.query(User).filter(User.email == request.email).first()
        
        if not user:
            raise HTTPException(status_code=404, detail="ユーザーが見つかりません")
        
        # パスワード検証（出品者のみパスワード必須、一般ユーザーはパスワードが無い場合もある）
        if user.user_type == "seller":
            if not user.password_hash:
                raise HTTPException(status_code=400, detail="パスワードが設定されていません")
            if not verify_password(request.password, user.password_hash):
                raise HTTPException(status_code=401, detail="メールアドレスまたはパスワードが正しくありません")
        else:
            # 一般ユーザーの場合、パスワードが設定されている場合は検証
            if user.password_hash:
                if not verify_password(request.password, user.password_hash):
                    raise HTTPException(status_code=401, detail="メールアドレスまたはパスワードが正しくありません")
            # 一般ユーザーでパスワードが無い場合も許可（後方互換性）
        
        # 6桁のOTPを生成
        otp = generate_otp()
        user.login_code = otp
        user.login_code_expires = datetime.utcnow() + timedelta(minutes=10)  # 10分間有効
        db.commit()
        
        # OTPをメール送信
        send_otp_email(request.email, otp, purpose="ログイン", username=user.username)
        
        return {
            "message": "6桁のOTPコードをメールで送信しました",
            "expires_in": 600  # 10分
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")

@app.post("/api/auth/verify", response_model=TokenResponse)
async def verify_login(request: LoginVerifyRequest, db: Session = Depends(get_db)):
    """6桁OTPで認証"""
    try:
        # ユーザーを検索
        user = db.query(User).filter(User.email == request.email).first()
        
        if not user:
            raise HTTPException(status_code=404, detail="ユーザーが見つかりません")
        
        # OTPの検証
        if not user.login_code:
            raise HTTPException(status_code=400, detail="OTPが発行されていません")
        
        if user.login_code != request.otp:
            raise HTTPException(status_code=400, detail="OTPが正しくありません")
        
        if user.login_code_expires and user.login_code_expires < datetime.utcnow():
            raise HTTPException(status_code=400, detail="OTPの有効期限が切れています")
        
        # OTPをクリア
        user.login_code = None
        user.login_code_expires = None
        db.commit()
        
        # JWTトークンを発行（subは文字列である必要がある）
        access_token = create_access_token(data={"sub": str(user.user_id)})
        
        return TokenResponse(
            access_token=access_token,
            user_id=user.user_id,
            username=user.username,
            user_type=user.user_type
        )
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")

@app.post("/api/auth/login/resend", response_model=dict)
async def resend_login_otp(request: ResendOtpRequest, db: Session = Depends(get_db)):
    """ログインOTPを再送"""
    try:
        # ユーザーを検索
        user = db.query(User).filter(User.email == request.email).first()
        
        if not user:
            raise HTTPException(status_code=404, detail="ユーザーが見つかりません")
        
        # 新しいOTPを生成
        otp = generate_otp()
        user.login_code = otp
        user.login_code_expires = datetime.utcnow() + timedelta(minutes=10)  # 10分間有効
        db.commit()
        
        # OTPをメール送信
        send_otp_email(request.email, otp, purpose="ログイン", username=user.username)
        
        return {
            "message": "6桁のOTPコードをメールで再送信しました",
            "expires_in": 600  # 10分
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")

@app.post("/api/auth/signup", response_model=dict)
async def signup(request: SignupRequest, db: Session = Depends(get_db)):
    """アカウント作成後、6桁OTPをメール送信"""
    try:
        # バリデーション
        username_valid, username_msg = validate_username(request.username, request.user_type)
        if not username_valid:
            raise HTTPException(status_code=400, detail=username_msg)
        
        password_valid, password_msg = validate_password(request.password, request.user_type)
        if not password_valid:
            raise HTTPException(status_code=400, detail=password_msg)
        
        # 既存ユーザーのチェック
        if request.email:
            existing_user = db.query(User).filter(User.email == request.email).first()
            if existing_user:
                raise HTTPException(status_code=400, detail="このメールアドレスは既に使用されています")
        
        if request.username:
            existing_username = db.query(User).filter(User.username == request.username).first()
            if existing_username:
                raise HTTPException(status_code=400, detail="このユーザー名は既に使用されています")
        
        # ウォレットアドレスを生成
        wallet_address = generate_wallet_address()
        
        # 既存のウォレットアドレスと重複しないように確認
        while db.query(User).filter(User.wallet_address == wallet_address).first():
            wallet_address = generate_wallet_address()
        
        # パスワードハッシュ化（全てのユーザーでパスワードを保存）
        password_hash = None
        if request.password:
            password_hash = get_password_hash(request.password)
        
        # ユーザー識別子を生成
        user_tag = generate_user_tag(db)
        
        # 6桁のOTPを生成
        otp = generate_otp()
        
        # ユーザーを作成
        user = User(
            wallet_address=wallet_address,
            username=request.username,
            user_tag=user_tag,
            email=request.email,
            password_hash=password_hash,
            user_type=request.user_type,
            login_code=otp,
            login_code_expires=datetime.utcnow() + timedelta(minutes=10)  # 10分間有効
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        
        # OTPをメール送信
        send_otp_email(request.email, otp, purpose="アカウント作成", username=request.username)
        
        return {
            "message": "アカウントを作成しました。6桁のOTPコードをメールで送信しました",
            "expires_in": 600  # 10分
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")

@app.post("/api/auth/signup/verify", response_model=TokenResponse)
async def verify_signup(request: SignupVerifyRequest, db: Session = Depends(get_db)):
    """サインアップ時のOTP検証"""
    try:
        # ユーザーを検索
        user = db.query(User).filter(User.email == request.email).first()
        
        if not user:
            raise HTTPException(status_code=404, detail="ユーザーが見つかりません")
        
        # OTPの検証
        if not user.login_code:
            raise HTTPException(status_code=400, detail="OTPが発行されていません")
        
        if user.login_code != request.otp:
            raise HTTPException(status_code=400, detail="OTPが正しくありません")
        
        if user.login_code_expires and user.login_code_expires < datetime.utcnow():
            raise HTTPException(status_code=400, detail="OTPの有効期限が切れています")
        
        # OTPをクリア
        user.login_code = None
        user.login_code_expires = None
        db.commit()
        
        # JWTトークンを発行（subは文字列である必要がある）
        access_token = create_access_token(data={"sub": str(user.user_id)})
        
        return TokenResponse(
            access_token=access_token,
            user_id=user.user_id,
            username=user.username,
            user_type=user.user_type
        )
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")

@app.post("/api/auth/signup/resend", response_model=dict)
async def resend_signup_otp(request: ResendOtpRequest, db: Session = Depends(get_db)):
    """サインアップOTPを再送"""
    try:
        # ユーザーを検索
        user = db.query(User).filter(User.email == request.email).first()
        
        if not user:
            raise HTTPException(status_code=404, detail="ユーザーが見つかりません")
        
        # 新しいOTPを生成
        otp = generate_otp()
        user.login_code = otp
        user.login_code_expires = datetime.utcnow() + timedelta(minutes=10)  # 10分間有効
        db.commit()
        
        # OTPをメール送信
        send_otp_email(request.email, otp, purpose="アカウント作成", username=user.username)
        
        return {
            "message": "6桁のOTPコードをメールで再送信しました",
            "expires_in": 600  # 10分
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")

@app.get("/api/auth/me")
async def get_current_user_info(
    request: Request,
    current_user: User = Depends(get_current_user)
):
    """現在のユーザー情報を取得"""
    return {
        "user_id": current_user.user_id,
        "username": current_user.username,
        "user_tag": current_user.user_tag,
        "email": current_user.email,
        "wallet_address": current_user.wallet_address,
        "user_type": current_user.user_type,
        "profile_image_url": current_user.profile_image_url,
        "bio": current_user.bio,
        "balance": float(current_user.balance) if current_user.balance else 0.0
    }

@app.get("/product", response_class=HTMLResponse)
async def product_page(request: Request, id: int = None, db: Session = Depends(get_db)):
    """商品詳細ページ"""
    nft_data = None
    if id:
        try:
            nft = db.query(NFTModel).filter(NFTModel.nft_id == id).first()
            if nft:
                # アクティブな出品情報を取得
                listing = db.query(Listing).filter(
                    Listing.nft_id == nft.nft_id,
                    Listing.status == "active"
                ).first()
                
                nft_data = {
                    "id": nft.nft_id,
                    "name": nft.name,
                    "description": nft.description,
                    "image": nft.image_url,
                    "priceEth": float(listing.price) if listing else 0.0,
                    "likes": 0,  # お気に入り機能実装時に追加
                    "creator": nft.creator.username if nft.creator else None,
                    "owner": nft.owner.username if nft.owner else None,
                    "category": nft.category,
                    "created_at": nft.created_at.isoformat() if nft.created_at else None,
                    "blockchain_hash": nft.blockchain_hash
                }
        except Exception as e:
            print(f"商品データ取得エラー: {e}")
    
    return templates.TemplateResponse("product.html", {
        "request": request,
        "product_id": id,
        "nft": nft_data
    })

@app.get("/user/{user_id}", response_class=HTMLResponse)
async def user_profile_page(request: Request, user_id: int, db: Session = Depends(get_db)):
    """他のユーザーのプロフィールページ"""
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="ユーザーが見つかりません")
    
    return templates.TemplateResponse("user_profile.html", {
        "request": request,
        "user_id": user_id
    })

@app.get("/profile", response_class=HTMLResponse)
async def profile_page(request: Request):
    """プロフィールページ（認証必須）"""
    # HTMLページのリクエストではAuthorizationヘッダーが送信されないため、
    # フロントエンド側でリダイレクトする
    # サーバー側では常にHTMLを返し、JavaScriptで認証チェックを行う
    return templates.TemplateResponse("profile.html", {
        "request": request
    })

@app.get("/create", response_class=HTMLResponse)
async def create_page(request: Request):
    """NFT出品ページ（認証必須）"""
    return templates.TemplateResponse("create.html", {
        "request": request
    })

@app.get("/mint", response_class=HTMLResponse)
async def mint_page(request: Request):
    """NFTミント管理ページ（認証必須）"""
    return templates.TemplateResponse("mint.html", {
        "request": request
    })

# ========== プロフィール関連API ==========

class ProfileUpdateRequest(BaseModel):
    username: str | None = None
    wallet_address: str | None = None
    bio: str | None = None
    profile_image_url: str | None = None

@app.put("/api/profile")
async def update_profile(
    request: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """プロフィールを更新"""
    try:
        # ユーザー名の更新
        if request.username is not None:
            # ユーザー名の重複チェック（自分以外）
            existing_user = db.query(User).filter(
                User.username == request.username,
                User.user_id != current_user.user_id
            ).first()
            if existing_user:
                raise HTTPException(status_code=400, detail="このユーザー名は既に使用されています")
            
            # ユーザー名のバリデーション
            if request.username and len(request.username) > 50:
                raise HTTPException(status_code=400, detail="ユーザー名は50文字以内である必要があります")
            
            current_user.username = request.username
        
        # ウォレットアドレスの更新は許可しない（変更不可）
        # リクエストに含まれていても無視する
        if request.wallet_address is not None:
            # ウォレットアドレスは変更できないため、警告ログを出力するが処理は続行
            print(f"WARNING: User {current_user.user_id} attempted to change wallet_address, but it is not allowed")
        
        # 自己紹介の更新
        if request.bio is not None:
            current_user.bio = request.bio
        
        # プロフィール画像URLの更新
        # Noneまたは空文字列が送信された場合は削除、それ以外の値が送信された場合は更新
        if request.profile_image_url is not None:
            if request.profile_image_url == '':
                # 空文字列が送信された場合は削除
                current_user.profile_image_url = None
            else:
                current_user.profile_image_url = request.profile_image_url
        
        current_user.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(current_user)
        
        return {
            "user_id": current_user.user_id,
            "username": current_user.username,
            "email": current_user.email,
            "wallet_address": current_user.wallet_address,
            "user_type": current_user.user_type,
            "profile_image_url": current_user.profile_image_url,
            "bio": current_user.bio
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")

@app.get("/api/users/search")
async def search_users(
    request: Request,
    q: str = Query(default="", description="検索クエリ（ユーザー名または識別子）"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = Query(default=20, ge=1, le=100, description="取得件数の上限")
):
    """ユーザーを検索"""
    try:
        # クエリをトリム
        query_str = q.strip() if q else ""
        
        if not query_str or len(query_str) < 1:
            return []
        
        # ユーザー名またはユーザータグで検索（自分以外）
        from sqlalchemy import or_
        
        # 識別子の検索（#を除去）
        search_query = query_str.lstrip('#')
        
        users = db.query(User).filter(
            User.user_id != current_user.user_id,
            or_(
                User.username.contains(search_query),
                (User.user_tag != None) & (User.user_tag.contains(search_query))
            )
        ).limit(limit).all()
        
        # フォロー状態を取得
        following_ids = db.query(Follow.following_id).filter(
            Follow.follower_id == current_user.user_id
        ).all()
        following_id_set = {fid[0] for fid in following_ids}
        
        result = []
        for user in users:
            result.append({
                "user_id": user.user_id,
                "username": user.username,
                "user_tag": user.user_tag,
                "user_type": user.user_type,
                "profile_image_url": user.profile_image_url,
                "bio": user.bio,
                "wallet_address": user.wallet_address,  # 送金機能で必要
                "is_following": user.user_id in following_id_set
            })
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")

@app.get("/api/users/{user_id}")
async def get_user_info(
    user_id: int,
    current_user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    """指定されたユーザーの情報を取得（公開情報のみ、認証済みユーザーにはwallet_addressも返す）"""
    try:
        user = db.query(User).filter(User.user_id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="ユーザーが見つかりません")
        
        # 基本情報
        result = {
            "user_id": user.user_id,
            "username": user.username,
            "user_tag": user.user_tag,
            "user_type": user.user_type,
            "profile_image_url": user.profile_image_url,
            "bio": user.bio,
            "created_at": user.created_at.isoformat() if user.created_at else None
        }
        
        # 認証済みユーザーの場合、送金機能で必要なwallet_addressも返す
        if current_user:
            result["wallet_address"] = user.wallet_address
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")

@app.get("/api/users/{user_id}/listings")
async def get_user_listings(
    user_id: int,
    db: Session = Depends(get_db),
    limit: int = 100,
    offset: int = 0
):
    """指定されたユーザーの出品一覧を取得"""
    try:
        user = db.query(User).filter(User.user_id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="ユーザーが見つかりません")
        
        # ユーザーが作成したNFTで、出品されているものを取得
        listings = db.query(Listing).join(NFTModel).filter(
            Listing.seller_id == user_id,
            Listing.status == "active"
        ).order_by(Listing.listed_at.desc()).offset(offset).limit(limit).all()
        
        result = []
        for listing in listings:
            nft = listing.nft
            if not nft:
                continue  # NFTが存在しない場合はスキップ
            result.append({
                "listing_id": listing.listing_id,
                "nft_id": nft.nft_id,
                "name": nft.name,
                "description": nft.description,
                "image": nft.image_url,
                "priceEth": float(listing.price),
                "currency": listing.currency,
                "created_at": listing.listed_at.isoformat() if listing.listed_at else None,
                "blockchain_hash": nft.blockchain_hash
            })
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        print(f"出品一覧取得エラー: {error_detail}")
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")

@app.get("/api/profile/listings")
async def get_my_listings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 100,
    offset: int = 0
):
    """自分の出品一覧を取得"""
    try:
        # 現在のユーザーが出品したNFTを取得（購入された商品は除外：owner_idが現在のユーザーと一致するもののみ）
        listings = db.query(Listing).join(NFTModel).filter(
            Listing.seller_id == current_user.user_id,
            NFTModel.owner_id == current_user.user_id  # 購入された商品（owner_idが変更された商品）を除外
        ).order_by(Listing.listed_at.desc()).offset(offset).limit(limit).all()
        
        results = []
        for listing in listings:
            nft = listing.nft
            # 念のため、所有者が現在のユーザーであることを再確認
            if nft.owner_id != current_user.user_id:
                continue  # 所有者が変更されている場合はスキップ
            results.append({
                "listing_id": listing.listing_id,
                "nft_id": nft.nft_id,
                "name": nft.name,
                "description": nft.description,
                "image": nft.image_url,
                "priceEth": float(listing.price),
                "status": listing.status,
                "listed_at": listing.listed_at.isoformat() if listing.listed_at else None,
                "sold_at": listing.sold_at.isoformat() if listing.sold_at else None
            })
        
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")

@app.get("/api/profile/nfts")
async def get_my_nfts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 100,
    offset: int = 0
):
    """自分のNFT一覧を取得（作成者または所有者）"""
    try:
        # 現在のユーザーが作成または所有しているNFTを取得
        nfts = db.query(NFTModel).filter(
            (NFTModel.creator_id == current_user.user_id) | 
            (NFTModel.owner_id == current_user.user_id)
        ).order_by(NFTModel.created_at.desc()).offset(offset).limit(limit).all()
        
        results = []
        for nft in nfts:
            # アクティブな出品情報を取得
            listing = db.query(Listing).filter(
                Listing.nft_id == nft.nft_id,
                Listing.status == "active"
            ).first()
            
            # アクティブな出品情報を取得
            active_listing = db.query(Listing).filter(
                Listing.nft_id == nft.nft_id,
                Listing.status == "active"
            ).first()
            
            results.append({
                "nft_id": nft.nft_id,
                "name": nft.name,
                "description": nft.description,
                "image": nft.image_url,
                "priceEth": float(active_listing.price) if active_listing else None,
                "status": nft.status,
                "blockchain_hash": nft.blockchain_hash,
                "is_minted": nft.blockchain_hash is not None,
                "is_listed": active_listing is not None,  # 出品中かどうか
                "category": nft.category,
                "created_at": nft.created_at.isoformat() if nft.created_at else None,
                "is_creator": nft.creator_id == current_user.user_id,
                "is_owner": nft.owner_id == current_user.user_id
            })
        
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")

@app.get("/chat", response_class=HTMLResponse)
async def chat_page(request: Request):
    """チャットページ"""
    return templates.TemplateResponse("chat.html", {
        "request": request
    })

@app.get("/mining", response_class=HTMLResponse)
async def mining_page(request: Request):
    """マイニングページ"""
    return templates.TemplateResponse("mining.html", {
        "request": request
    })

@app.get("/access", response_class=HTMLResponse)
async def access_page(request: Request):
    """閲覧URL発行ページ"""
    return templates.TemplateResponse("access.html", {
        "request": request
    })

@app.get("/transfer", response_class=HTMLResponse)
async def transfer_page(request: Request):
    """送金ページ"""
    return templates.TemplateResponse("transfer.html", {
        "request": request
    })

@app.get("/admin", response_class=HTMLResponse)
async def admin_page(request: Request):
    """管理者ページ"""
    return templates.TemplateResponse("admin.html", {
        "request": request
    })

@app.get("/view", response_class=HTMLResponse)
async def view_page(request: Request, pid: str = None, t: str = None):
    """作品閲覧ページ"""
    return templates.TemplateResponse("view.html", {
        "request": request,
        "product_id": pid,
        "token": t
    })

# ========== API エンドポイント ==========

# NFT関連API
@app.get("/api/nfts", response_model=List[NFT])
async def get_nfts(
    q: str = None,  # 検索クエリ
    category: str = None,  # カテゴリフィルタ
    sort: str = "new",  # ソート順: new, price-asc, price-desc, hot
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user)
):
    """NFT一覧を取得"""
    try:
        # アクティブな出品があるNFTのみを取得
        query = db.query(NFTModel).join(Listing).filter(
            Listing.status == "active",
            NFTModel.status == "listed"
        )
        
        # 検索クエリでフィルタ
        if q:
            q_lower = f"%{q.lower()}%"
            query = query.filter(
                (NFTModel.name.ilike(q_lower)) |
                (NFTModel.description.ilike(q_lower))
            )
        
        # カテゴリでフィルタ
        if category:
            query = query.filter(NFTModel.category == category)
        
        # ソート
        if sort == "price-asc":
            query = query.order_by(Listing.price.asc())
        elif sort == "price-desc":
            query = query.order_by(Listing.price.desc())
        elif sort == "new":
            query = query.order_by(NFTModel.created_at.desc())
        elif sort == "hot":
            # いいね数でソート（サブクエリを使用）
            from sqlalchemy import func
            likes_subquery = db.query(
                Favorite.nft_id,
                func.count(Favorite.favorite_id).label('likes_count')
            ).group_by(Favorite.nft_id).subquery()
            
            query = query.outerjoin(
                likes_subquery, NFTModel.nft_id == likes_subquery.c.nft_id
            ).order_by(func.coalesce(likes_subquery.c.likes_count, 0).desc())
        else:
            query = query.order_by(NFTModel.created_at.desc())
        
        # ページネーション
        nfts = query.offset(offset).limit(limit).all()
        
        # 現在のユーザーがいいねしているNFTのIDリストを取得（認証されている場合のみ）
        liked_nft_ids = set()
        if current_user:
            favorites = db.query(Favorite).filter(
                Favorite.user_id == current_user.user_id
            ).all()
            liked_nft_ids = {f.nft_id for f in favorites}
        
        # NFTモデルをAPIレスポンス形式に変換
        result = []
        for nft in nfts:
            listing = db.query(Listing).filter(
                Listing.nft_id == nft.nft_id,
                Listing.status == "active"
            ).first()
            
            # いいね数を取得
            likes_count = db.query(Favorite).filter(Favorite.nft_id == nft.nft_id).count()
            
            result.append({
                "id": nft.nft_id,
                "name": nft.name,
                "description": nft.description,
                "image": nft.image_url,
                "priceEth": float(listing.price) if listing else 0.0,
                "likes": likes_count,
                "is_liked": nft.nft_id in liked_nft_ids,
                "creator": nft.creator.username if nft.creator else None,
                "owner": nft.owner.username if nft.owner else None,
                "category": nft.category,
                "created_at": nft.created_at.isoformat() if nft.created_at else None,
                "blockchain_hash": nft.blockchain_hash
            })
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")


@app.get("/api/nfts/{nft_id}", response_model=NFT)
async def get_nft(
    nft_id: int, 
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user)
):
    """NFT詳細を取得"""
    try:
        nft = db.query(NFTModel).filter(NFTModel.nft_id == nft_id).first()
        if not nft:
            raise HTTPException(status_code=404, detail="NFTが見つかりません")
        
        # アクティブな出品情報を取得
        listing = db.query(Listing).filter(
            Listing.nft_id == nft.nft_id,
            Listing.status == "active"
        ).first()
        
        # いいね数を取得
        likes_count = db.query(Favorite).filter(Favorite.nft_id == nft_id).count()
        
        # 現在のユーザーがいいねしているか確認（認証されている場合のみ）
        is_liked = False
        if current_user:
            favorite = db.query(Favorite).filter(
                Favorite.nft_id == nft_id,
                Favorite.user_id == current_user.user_id
            ).first()
            is_liked = favorite is not None
        
        # 現在のユーザーが作成者または所有者か確認
        is_creator = False
        is_owner = False
        if current_user:
            is_creator = nft.creator_id == current_user.user_id
            is_owner = nft.owner_id == current_user.user_id
        
        # 出品者情報を取得
        seller_info = None
        if listing and listing.seller_id:
            seller = db.query(User).filter(User.user_id == listing.seller_id).first()
            if seller:
                seller_info = {
                    "user_id": seller.user_id,
                    "username": seller.username,
                    "user_tag": seller.user_tag,
                    "profile_image_url": seller.profile_image_url,
                    "user_type": seller.user_type
                }
        
        # 出品者情報がない場合は、所有者または作成者の情報を返す
        if not seller_info:
            if nft.owner:
                seller_info = {
                    "user_id": nft.owner.user_id,
                    "username": nft.owner.username,
                    "user_tag": nft.owner.user_tag,
                    "profile_image_url": nft.owner.profile_image_url,
                    "user_type": nft.owner.user_type
                }
            elif nft.creator:
                seller_info = {
                    "user_id": nft.creator.user_id,
                    "username": nft.creator.username,
                    "user_tag": nft.creator.user_tag,
                    "profile_image_url": nft.creator.profile_image_url,
                    "user_type": nft.creator.user_type
                }
        
        # 所有者情報を取得
        owner_info = None
        if nft.owner:
            owner_info = {
                "user_id": nft.owner.user_id,
                "username": nft.owner.username,
                "user_tag": nft.owner.user_tag,
                "profile_image_url": nft.owner.profile_image_url,
                "user_type": nft.owner.user_type
            }
        
        # 作成者情報を取得
        creator_info = None
        if nft.creator:
            creator_info = {
                "user_id": nft.creator.user_id,
                "username": nft.creator.username,
                "user_tag": nft.creator.user_tag,
                "profile_image_url": nft.creator.profile_image_url,
                "user_type": nft.creator.user_type
            }
        
        return {
            "id": nft.nft_id,
            "name": nft.name,
            "description": nft.description,
            "image": nft.image_url,
            "priceEth": float(listing.price) if listing else 0.0,
            "likes": likes_count,
            "is_liked": is_liked,
            "creator": nft.creator.username if nft.creator else None,
            "creator_id": nft.creator_id if nft.creator else None,
            "creator_info": creator_info,  # 作成者情報の詳細
            "owner": nft.owner.username if nft.owner else None,
            "owner_id": nft.owner_id if nft.owner else None,
            "owner_info": owner_info,  # 所有者情報の詳細
            "seller": seller_info,  # 出品者情報を追加（出品者 > 所有者 > 作成者の順）
            "category": nft.category,
            "created_at": nft.created_at.isoformat() if nft.created_at else None,
            "blockchain_hash": nft.blockchain_hash,
            "is_creator": is_creator,
            "is_owner": is_owner,
            "is_my_nft": is_creator or is_owner  # 作成者または所有者の場合
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")


@app.post("/api/nfts/{nft_id}/like")
async def toggle_like(
    nft_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """いいねを追加/削除（トグル）"""
    try:
        # NFTの存在確認
        nft = db.query(NFTModel).filter(NFTModel.nft_id == nft_id).first()
        if not nft:
            raise HTTPException(status_code=404, detail="NFTが見つかりません")
        
        # 既存のお気に入りを確認
        favorite = db.query(Favorite).filter(
            Favorite.nft_id == nft_id,
            Favorite.user_id == current_user.user_id
        ).first()
        
        if favorite:
            # 既にいいねしている場合は削除
            db.delete(favorite)
            action = "removed"
        else:
            # いいねを追加
            favorite = Favorite(
                nft_id=nft_id,
                user_id=current_user.user_id
            )
            db.add(favorite)
            action = "added"
        
        db.commit()
        
        # 更新後のいいね数を取得
        likes_count = db.query(Favorite).filter(Favorite.nft_id == nft_id).count()
        
        return {
            "action": action,
            "likes": likes_count,
            "is_liked": action == "added"
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")


class OwnershipVerificationResponse(BaseModel):
    is_owner: bool
    blockchain_owner: str | None  # ブロックチェーン上の所有者（ウォレットアドレス）
    db_owner_id: int | None  # データベース上の所有者ID
    nft_hash: str | None  # NFTのハッシュ（original_mint_hash）
    verification_status: str  # verified/unverified/not_minted
    transfer_history_count: int  # 所有権移転回数

@app.get("/api/nfts/{nft_id}/verify-ownership", response_model=OwnershipVerificationResponse)
async def verify_nft_ownership(
    nft_id: int,
    current_user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    """
    NFTの所有権をブロックチェーンから検証
    
    本物のNFTの仕組み：ブロックチェーン上で所有権を検証し、データベースと照合
    """
    try:
        nft = db.query(NFTModel).filter(NFTModel.nft_id == nft_id).first()
        if not nft:
            raise HTTPException(status_code=404, detail="NFTが見つかりません")
        
        # ミントされていない場合は検証不可
        if not nft.original_mint_hash:
            return {
                "is_owner": False,
                "blockchain_owner": None,
                "db_owner_id": nft.owner_id,
                "nft_hash": None,
                "verification_status": "not_minted",
                "transfer_history_count": 0
            }
        
        # ブロックチェーンから所有権を取得
        blockchain.set_all_block_transactions()
        blockchain_owner = blockchain.get_nft_owner(nft.original_mint_hash)
        
        # 所有権移転履歴を取得
        transfer_history = blockchain.get_nft_transfer_history(nft.original_mint_hash)
        
        # 現在のユーザーが所有者か検証
        is_owner = False
        if current_user and current_user.wallet_address:
            is_owner = blockchain.verify_nft_ownership(nft.original_mint_hash, current_user.wallet_address)
        
        # 検証ステータスを決定
        verification_status = "verified" if blockchain_owner else "unverified"
        
        # データベースの所有者とブロックチェーンの所有者を照合
        db_owner = db.query(User).filter(User.user_id == nft.owner_id).first()
        if db_owner and blockchain_owner:
            # ウォレットアドレスを公開鍵形式に変換
            db_owner_public_key = db_owner.wallet_address.replace("0x", "").ljust(128, "0")[:128]
            if db_owner_public_key != blockchain_owner:
                verification_status = "mismatch"  # データベースとブロックチェーンが不一致
        
        return {
            "is_owner": is_owner,
            "blockchain_owner": blockchain_owner,
            "db_owner_id": nft.owner_id,
            "nft_hash": nft.original_mint_hash,
            "verification_status": verification_status,
            "transfer_history_count": len(transfer_history) - 1 if transfer_history else 0  # ミントを除く
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")


class MintRequest(BaseModel):
    price: float = 0  # 転売時のみ使用。最初の出品の場合は既存の出品価格を使うので不要

@app.post("/api/nfts/{nft_id}/mint")
async def mint_nft(
    nft_id: int,
    request: MintRequest = MintRequest(),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """NFTをブロックチェーン上にミントする。
    ・最初の出品: 出品時に決めた価格（既存のListing）を使う。価格入力不要。
    ・転売: 購入者が再ミントするときはミント時に価格を指定して出品する。
    """
    try:
        # レート制限チェック（1時間あたり10回まで）
        from datetime import datetime, timedelta
        one_hour_ago = datetime.utcnow() - timedelta(hours=1)
        recent_mints = db.query(NFTModel).filter(
            NFTModel.creator_id == current_user.user_id,
            NFTModel.blockchain_hash.isnot(None),
            NFTModel.updated_at >= one_hour_ago
        ).count()
        
        if recent_mints >= 10:
            raise HTTPException(
                status_code=429, 
                detail="レート制限: 1時間あたり10回までミントできます。しばらく時間をおいてから再度お試しください。"
            )
        
        # NFTの存在確認
        nft = db.query(NFTModel).filter(NFTModel.nft_id == nft_id).first()
        if not nft:
            raise HTTPException(status_code=404, detail="NFTが見つかりません")
        
        # 既にミントされているか確認
        if nft.blockchain_hash:
            raise HTTPException(status_code=400, detail="このNFTは既にミントされています")
        
        # 既存のアクティブな出品があるか（最初の出品＝作成時に価格を決めている）
        existing_listing = db.query(Listing).filter(
            Listing.nft_id == nft_id,
            Listing.status == "active"
        ).first()
        
        if existing_listing:
            # 最初の出品: 出品時に決めた価格をそのまま使う。request.price は使わない
            price_for_listing = float(existing_listing.price)
        else:
            # 転売: 購入者が再ミントするときはミント時に価格を指定する
            if request.price <= 0:
                raise HTTPException(
                    status_code=400,
                    detail="転売の場合はミント時に販売価格を入力してください。"
                )
            if request.price > 1000000:
                raise HTTPException(status_code=400, detail="価格が異常に高いです。正しい価格を入力してください。")
            price_for_listing = request.price
        
        # 所有者の確認（作成者または現在の所有者のみミント可能）
        if nft.creator_id != current_user.user_id and nft.owner_id != current_user.user_id:
            raise HTTPException(status_code=403, detail="このNFTをミントする権限がありません")
        
        # データサイズチェック（NFT情報のサイズ制限）
        nft_data_size = len(nft.name or "") + len(nft.description or "") + len(nft.image_url or "")
        if nft_data_size > 10000:  # 10KB制限
            raise HTTPException(status_code=400, detail="NFTデータが大きすぎます。名前、説明、画像URLを短くしてください。")
        
        # ウォレットアドレスを公開鍵として使用（0xプレフィックスを削除）
        # 実際の実装では、ウォレットアドレスから公開鍵を取得する必要があります
        # ここでは簡易的にウォレットアドレスを公開鍵として使用
        wallet_address = current_user.wallet_address
        # 0xプレフィックスを削除して、公開鍵形式に変換（64文字のhex文字列が必要）
        # 簡易実装：ウォレットアドレスを拡張して公開鍵形式にする
        public_key_str = wallet_address.replace("0x", "").ljust(128, "0")[:128]  # 128文字（64バイト）のhex文字列
        
        # NFTミント用のトランザクションを作成
        # amount=0でNFT情報を含むトランザクション
        from datetime import datetime, timezone
        import hashlib
        import json
        
        time_now = datetime.now(timezone.utc).isoformat()
        
        # NFT情報を含むトランザクション（簡易実装：署名なしの特別なトランザクション）
        # 実際の実装では、NFT情報をトランザクションに含める必要があります
        # データサイズを制限（セキュリティ対策）
        nft_name = (nft.name or "")[:200]  # 200文字制限
        nft_image_url = (nft.image_url or "")[:500]  # 500文字制限
        
        nft_data = {
            "nft_id": nft.nft_id,
            "name": nft_name,
            "image_url": nft_image_url,
            "creator_id": nft.creator_id,
            "owner_id": nft.owner_id
        }
        
        # トランザクションデータのサイズチェック
        transaction_data_size = len(json.dumps(nft_data))
        if transaction_data_size > 5000:  # 5KB制限
            raise HTTPException(status_code=400, detail="トランザクションデータが大きすぎます。")
        
        # ミント用トランザクション（Blockchainからユーザーへ、amount=0）
        mint_transaction = {
            "time": time_now,
            "sender": "Blockchain",  # ミントはBlockchainから発行
            "receiver": public_key_str,
            "amount": 0,  # NFTミントはamount=0
            "nft_data": json.dumps(nft_data),  # NFT情報を含む
            "signature": "mint"  # ミント用の特別な署名
        }
        
        # トランザクションハッシュを計算
        transaction_hash = hashlib.sha256(json.dumps(mint_transaction, sort_keys=True).encode('utf-8')).hexdigest()
        
        # トランザクションプールのサイズチェック（セキュリティ対策）
        pool_size = len(blockchain.transaction_pool.get("transactions", []))
        if pool_size > 10000:  # 10,000トランザクション制限
            raise HTTPException(
                status_code=503, 
                detail="トランザクションプールが満杯です。しばらく時間をおいてから再度お試しください。"
            )
        
        # トランザクションをブロックチェーンのトランザクションプールに追加
        # 注意：現在のblockchain.pyにはNFTトランザクションの検証機能がないため、
        # 簡易的にトランザクションプールに追加します
        # ミントトランザクションは特別な形式なので、検証をスキップして追加
        if blockchain.add_transaction_pool(mint_transaction):
            blockchain.save_transaction_pool()
            # ログ記録（セキュリティ対策）
            print(f"[MINT] User {current_user.user_id} minted NFT {nft_id} at {time_now}")
            # ブロードキャスト（オプション）
            try:
                blockchain.broadcast_transaction(mint_transaction)
            except:
                pass  # ブロードキャスト失敗は無視
        else:
            raise HTTPException(status_code=400, detail="トランザクションの追加に失敗しました。既に存在する可能性があります。")
        
        # NFTのblockchain_hashを更新
        nft.blockchain_hash = transaction_hash
        # 最初のミントハッシュを永続化（本物のNFTの仕組み）
        if not nft.original_mint_hash:
            nft.original_mint_hash = transaction_hash
        nft.status = "listed"  # ミント = 出品なので"listed"に設定
        nft.updated_at = datetime.utcnow()
        
        # 出品情報: 既存があればそのまま、なければ転売用に新規作成（price_for_listing は上で決定済み）
        if existing_listing:
            existing_listing.status = "active"
            existing_listing.updated_at = datetime.utcnow()
            listing_id = existing_listing.listing_id
        else:
            listing = Listing(
                nft_id=nft.nft_id,
                seller_id=current_user.user_id,
                price=price_for_listing,
                currency="ETH",
                status="active"
            )
            db.add(listing)
            db.flush()
            listing_id = listing.listing_id
        
        # ミントをトランザクション履歴に記録（管理画面のトランザクション一覧に表示するため必須）
        mint_tx_record = TransactionModel(
            nft_id=nft.nft_id,
            buyer_id=current_user.user_id,
            seller_id=current_user.user_id,
            price=0,
            currency="ETH",
            transaction_date=datetime.utcnow()
        )
        db.add(mint_tx_record)
        db.flush()  # 確実にINSERTを発行してからcommit（管理画面でミントが表示されない問題の対策）
        
        db.commit()
        db.refresh(nft)
        
        return {
            "nft_id": nft.nft_id,
            "name": nft.name,
            "blockchain_hash": nft.blockchain_hash,
            "listing_id": listing_id,
            "price": price_for_listing,
            "message": "NFTのミントと出品が完了しました"
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")


@app.post("/api/nfts/{nft_id}/stop-selling")
async def stop_selling(
    nft_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """出品を停止する（ミント状態は維持）"""
    try:
        # NFTの存在確認
        nft = db.query(NFTModel).filter(NFTModel.nft_id == nft_id).first()
        if not nft:
            raise HTTPException(status_code=404, detail="NFTが見つかりません")
        
        # 所有者の確認
        if nft.owner_id != current_user.user_id:
            raise HTTPException(status_code=403, detail="このNFTの出品を停止する権限がありません")
        
        # アクティブな出品情報を取得
        listings = db.query(Listing).filter(
            Listing.nft_id == nft_id,
            Listing.status == "active"
        ).all()
        
        if not listings:
            raise HTTPException(status_code=400, detail="このNFTは出品されていません")
        
        # すべてのアクティブな出品を停止
        for listing in listings:
            listing.status = "cancelled"
            listing.updated_at = datetime.utcnow()
        
        db.commit()
        
        return {
            "nft_id": nft.nft_id,
            "name": nft.name,
            "message": "出品を停止しました（ミント状態は維持されます）"
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")


class RelistRequest(BaseModel):
    price: float

@app.post("/api/nfts/{nft_id}/relist")
async def relist_nft(
    nft_id: int,
    request: RelistRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """再出品する（ミント済みNFTを再度出品）"""
    try:
        # NFTの存在確認
        nft = db.query(NFTModel).filter(NFTModel.nft_id == nft_id).first()
        if not nft:
            raise HTTPException(status_code=404, detail="NFTが見つかりません")
        
        # ミント済みか確認
        if not nft.blockchain_hash:
            raise HTTPException(status_code=400, detail="このNFTはまだミントされていません。まずミントしてください。")
        
        # 所有者の確認
        if nft.owner_id != current_user.user_id:
            raise HTTPException(status_code=403, detail="このNFTを再出品する権限がありません")
        
        # 価格のバリデーション
        if request.price <= 0:
            raise HTTPException(status_code=400, detail="価格は0より大きい値である必要があります")
        
        # 既存の出品情報を確認
        existing_listing = db.query(Listing).filter(
            Listing.nft_id == nft_id,
            Listing.status == "active"
        ).first()
        
        if existing_listing:
            # 既存の出品情報を更新
            existing_listing.price = request.price
            existing_listing.status = "active"
            existing_listing.updated_at = datetime.utcnow()
            listing_id = existing_listing.listing_id
        else:
            # 新しい出品情報を作成
            listing = Listing(
                nft_id=nft.nft_id,
                seller_id=current_user.user_id,
                price=request.price,
                currency="ETH",
                status="active"
            )
            db.add(listing)
            db.flush()
            listing_id = listing.listing_id
        
        # NFTのステータスを更新
        nft.status = "listed"
        nft.updated_at = datetime.utcnow()
        
        db.commit()
        db.refresh(nft)
        
        return {
            "nft_id": nft.nft_id,
            "name": nft.name,
            "listing_id": listing_id,
            "price": request.price,
            "message": "再出品が完了しました"
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")


# ========== ファイルアップロード関連API ==========

@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """ファイルをアップロード（画像またはMP3）"""
    try:
        # ファイルタイプの検証
        allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp", "audio/mpeg", "audio/mp3"]
        if file.content_type not in allowed_types:
            raise HTTPException(status_code=400, detail="対応していないファイル形式です。画像（JPEG, PNG, GIF, WebP）またはMP3のみ対応しています。")
        
        # ファイルサイズ制限（100MB）
        file_size = 0
        content = await file.read()
        file_size = len(content)
        if file_size > 100 * 1024 * 1024:  # 100MB
            raise HTTPException(status_code=400, detail="ファイルサイズは100MB以下である必要があります")
        
        # ファイル拡張子を取得
        file_ext = Path(file.filename).suffix.lower()
        if not file_ext:
            # コンテンツタイプから拡張子を推測
            if file.content_type.startswith("image/"):
                file_ext = ".jpg" if "jpeg" in file.content_type else ".png"
            elif file.content_type.startswith("audio/"):
                file_ext = ".mp3"
        
        # 一意のファイル名を生成
        file_id = str(uuid.uuid4())
        filename = f"{file_id}{file_ext}"
        file_path = UPLOAD_DIR / filename
        
        # ファイルを保存
        with open(file_path, "wb") as f:
            f.write(content)
        
        # URLを返す
        file_url = f"/uploads/{filename}"
        
        return {
            "url": file_url,
            "filename": filename,
            "content_type": file.content_type,
            "size": file_size
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ファイルアップロードエラー: {str(e)}")


# ========== NFT作成・出品関連API ==========

class CreateNFTRequest(BaseModel):
    name: str
    description: str | None = None
    image_url: str
    category: str | None = None
    price: float
    currency: str = "ETH"

class CreateNFTResponse(BaseModel):
    nft_id: int
    listing_id: int
    name: str
    message: str

@app.post("/api/nfts", response_model=CreateNFTResponse)
async def create_nft(
    request: CreateNFTRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """NFTを作成して出品する"""
    try:
        # バリデーション
        if not request.name or len(request.name.strip()) == 0:
            raise HTTPException(status_code=400, detail="作品名は必須です")
        
        if len(request.name) > 100:
            raise HTTPException(status_code=400, detail="作品名は100文字以内である必要があります")
        
        if not request.image_url or len(request.image_url.strip()) == 0:
            raise HTTPException(status_code=400, detail="画像URLは必須です")
        
        if request.price <= 0:
            raise HTTPException(status_code=400, detail="価格は0より大きい値である必要があります")
        
        # NFTを作成
        nft = NFTModel(
            name=request.name.strip(),
            description=request.description.strip() if request.description else None,
            image_url=request.image_url.strip(),
            owner_id=current_user.user_id,
            creator_id=current_user.user_id,
            category=request.category if request.category else None,
            status="listed"  # 作成と同時に出品
        )
        db.add(nft)
        db.flush()  # nft_idを取得するためにflush
        
        # 出品情報を作成
        listing = Listing(
            nft_id=nft.nft_id,
            seller_id=current_user.user_id,
            price=request.price,
            currency=request.currency,
            status="active"
        )
        db.add(listing)
        db.flush()  # listing_idを取得するためにflush
        
        db.commit()
        db.refresh(nft)
        db.refresh(listing)
        
        return CreateNFTResponse(
            nft_id=nft.nft_id,
            listing_id=listing.listing_id,
            name=nft.name,
            message="NFTの出品が完了しました"
        )
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")


@app.get("/api/blockchain/info")
async def get_blockchain_info():
    """ブロックチェーンの基本情報を取得"""
    try:
        # ブロックチェーンの存在確認
        if not hasattr(blockchain, 'chain') or blockchain.chain is None:
            return {
                "block_count": 0,
                "transaction_pool_count": 0,
                "my_address": getattr(blockchain, 'my_address', None),
                "chain_valid": False,
                "error": "ブロックチェーンが初期化されていません"
            }
        
        # トランザクションプールの存在確認
        if not hasattr(blockchain, 'transaction_pool') or blockchain.transaction_pool is None:
            transaction_pool_count = 0
        else:
            transaction_pool_count = len(blockchain.transaction_pool.get("transactions", []))
        
        # ブロック数の取得
        blocks = blockchain.chain.get("blocks", [])
        block_count = len(blocks) if blocks else 0
        
        # チェーンの検証（エラーが発生する可能性があるためtry-exceptで囲む）
        chain_valid = False
        if blocks:
            try:
                chain_valid = blockchain.verify_chain(blockchain.chain)
            except Exception as verify_error:
                print(f"[BLOCKCHAIN INFO] Chain verification error: {verify_error}")
                chain_valid = False
        
        return {
            "block_count": block_count,
            "transaction_pool_count": transaction_pool_count,
            "my_address": getattr(blockchain, 'my_address', None),
            "chain_valid": chain_valid
        }
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"[BLOCKCHAIN INFO ERROR] Exception: {str(e)}")
        print(f"[BLOCKCHAIN INFO ERROR] Traceback:\n{error_trace}")
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")

@app.get("/api/blockchain/balance/{wallet_address}")
async def get_wallet_balance(wallet_address: str, db: Session = Depends(get_db)):
    """ウォレットアドレスの残高を取得（ブロックチェーンから計算）"""
    try:
        # ウォレットアドレスのバリデーション
        wallet_valid, wallet_msg = validate_wallet_address(wallet_address)
        if not wallet_valid:
            raise HTTPException(status_code=400, detail=f"無効なウォレットアドレスです: {wallet_msg}")
        
        # ブロックチェーンから残高を計算
        blockchain.set_all_block_transactions()
        accounts = blockchain.account_calc(blockchain.all_block_transactions)
        
        # ウォレットアドレスを公開鍵形式に変換（0xを削除して拡張）
        public_key_str = wallet_address.replace("0x", "").ljust(128, "0")[:128]
        
        # ブロックチェーン上の残高を取得
        blockchain_balance = accounts.get(public_key_str, 0)
        
        # データベース上の残高も取得
        user = db.query(User).filter(User.wallet_address == wallet_address).first()
        db_balance = float(user.balance) if user and user.balance else 0.0
        
        # total_balance = 利用可能残高（DBのみ）。BCは同一報酬が記録されているので足すと二重計上になる
        return {
            "wallet_address": wallet_address,
            "blockchain_balance": float(blockchain_balance),
            "database_balance": db_balance,
            "total_balance": db_balance
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")

class MiningRewardRequest(BaseModel):
    wallet_address: str
    reward_amount: float

@app.post("/api/mining/reward")
async def add_mining_reward(
    request: MiningRewardRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """マイニング報酬を追加（認証必須）"""
    try:
        # ウォレットアドレスのバリデーション
        wallet_valid, wallet_msg = validate_wallet_address(request.wallet_address)
        if not wallet_valid:
            raise HTTPException(status_code=400, detail=f"無効なウォレットアドレスです: {wallet_msg}")
        
        # 現在のユーザーのウォレットアドレスと一致するか確認
        if current_user.wallet_address != request.wallet_address:
            raise HTTPException(
                status_code=403,
                detail="自分のウォレットアドレスのみ報酬を追加できます"
            )
        
        # 報酬額のバリデーション
        if request.reward_amount <= 0:
            raise HTTPException(status_code=400, detail="報酬額は0より大きい値である必要があります")
        
        if request.reward_amount > 1000:  # 異常値チェック
            raise HTTPException(status_code=400, detail="報酬額が異常に高いです")
        
        # 残高を更新
        if current_user.balance is None:
            current_user.balance = 0.0
        current_user.balance = float(current_user.balance) + request.reward_amount
        current_user.updated_at = datetime.utcnow()
        
        db.commit()
        db.refresh(current_user)
        
        return {
            "wallet_address": current_user.wallet_address,
            "reward_amount": request.reward_amount,
            "new_balance": float(current_user.balance),
            "message": "マイニング報酬が追加されました"
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")

@app.get("/api/wallet/balance")
async def get_my_balance(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """現在のユーザーの残高を取得"""
    try:
        # データベース上の残高（購入・送金で使用する利用可能残高）
        db_balance = float(current_user.balance) if current_user.balance else 0.0
        
        # ブロックチェーンから残高を計算（参照用。マイニング報酬はBCにも記録されているので足すと二重計上になる）
        blockchain.set_all_block_transactions()
        accounts = blockchain.account_calc(blockchain.all_block_transactions)
        public_key_str = current_user.wallet_address.replace("0x", "").ljust(128, "0")[:128]
        blockchain_balance = accounts.get(public_key_str, 0)
        
        return {
            "wallet_address": current_user.wallet_address,
            "database_balance": db_balance,
            "blockchain_balance": float(blockchain_balance),
            "total_balance": db_balance
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")

class MiningRequest(BaseModel):
    wallet_address: str

@app.post("/api/mining/start")
async def start_mining(
    request: MiningRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """実際のブロックチェーンマイニングを開始"""
    try:
        # ブロックチェーンの初期化チェック
        if not hasattr(blockchain, 'chain') or blockchain.chain is None:
            raise HTTPException(status_code=500, detail="ブロックチェーンが初期化されていません")
        if not hasattr(blockchain, 'transaction_pool') or blockchain.transaction_pool is None:
            blockchain.transaction_pool = {"transactions": []}
        
        # ウォレットアドレスのバリデーション
        wallet_valid, wallet_msg = validate_wallet_address(request.wallet_address)
        if not wallet_valid:
            raise HTTPException(status_code=400, detail=f"無効なウォレットアドレスです: {wallet_msg}")
        
        # 現在のユーザーのウォレットアドレスと一致するか確認
        if current_user.wallet_address != request.wallet_address:
            raise HTTPException(
                status_code=403,
                detail="自分のウォレットアドレスのみマイニングできます"
            )
        
        # ウォレットアドレスを公開鍵形式に変換
        public_key_str = request.wallet_address.replace("0x", "").ljust(128, "0")[:128]
        
        # ブロックチェーンの状態を更新
        try:
            blockchain.set_all_block_transactions()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"ブロックチェーンの状態更新に失敗しました: {str(e)}")
        
        # トランザクションプールから有効なトランザクションを取得
        try:
            transactions = blockchain.transaction_pool.get("transactions", []).copy()
            all_block_transactions_copy = blockchain.all_block_transactions.copy() if hasattr(blockchain, 'all_block_transactions') else []
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"トランザクションプールの取得に失敗しました: {str(e)}")
        
        # 有効なトランザクションのみをフィルタリング
        valid_transactions = []
        try:
            for transaction in transactions:
                try:
                    if (transaction not in all_block_transactions_copy) and blockchain.verify_transaction(transaction):
                        all_block_transactions_copy.append(transaction)
                        # 残高が負にならないかチェック
                        account_balances = blockchain.account_calc(all_block_transactions_copy)
                        if account_balances and min(account_balances.values()) >= 0:
                            valid_transactions.append(transaction)
                        else:
                            all_block_transactions_copy.remove(transaction)
                except Exception as e:
                    # 個別のトランザクション検証エラーは無視して続行
                    print(f"[MINING] Transaction verification error (skipping): {str(e)}")
                    continue
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"トランザクションのフィルタリングに失敗しました: {str(e)}")
        
        # トランザクションがなくてもマイニングは可能（報酬トランザクションだけのブロック）
        # ただし、トランザクションがない場合はメッセージを追加
        transaction_count = len(valid_transactions)
        
        # ブロックを作成（実際のPoWを実行）
        # トランザクションがなくても、報酬トランザクションだけのブロックは作成可能
        try:
            # マイニング前の状態をログに記録
            print(f"[MINING] Starting mining for user {current_user.user_id}, wallet: {request.wallet_address[:10]}...")
            print(f"[MINING] Current difficulty: {blockchain.current_pow_difficulty}")
            print(f"[MINING] Transaction pool size: {len(blockchain.transaction_pool.get('transactions', []))}")
            print(f"[MINING] Valid transactions: {transaction_count}")
            print(f"[MINING] Current block count: {len(blockchain.chain.get('blocks', []))}")
            
            # ブロック作成（PoW計算）
            blockchain.create_new_block(public_key_str)
            
            print(f"[MINING] Block created successfully, new block count: {len(blockchain.chain.get('blocks', []))}")
            
            blockchain.save_blockchain()
            blockchain.save_transaction_pool()
            
            # 報酬を計算（ブロックチェーン上の報酬トランザクションから計算）
            reward = blockchain.get_reward(len(blockchain.chain["blocks"]))
            
            # マイニング報酬をDBの残高にも追加（NFT購入や送金で使用できるようにするため）
            if current_user.balance is None:
                current_user.balance = 0.0
            current_user.balance = float(current_user.balance) + float(reward)
            current_user.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(current_user)
            
            db_balance = float(current_user.balance) if current_user.balance else 0.0
            print(f"[MINING] Mining successful! Reward: {reward}, DB balance: {db_balance}")
            
            # メッセージを構築
            if transaction_count == 0:
                message = "ブロックのマイニングに成功しました（報酬トランザクションのみ）"
            else:
                message = f"ブロックのマイニングに成功しました（{transaction_count}件のトランザクションを含む）"
            
            return {
                "success": True,
                "message": message,
                "block_number": len(blockchain.chain["blocks"]) - 1,
                "reward": float(reward),
                "new_balance": float(db_balance),
                "block_hash": blockchain.chain["blocks"][-1]["hash"][:16] + "...",
                "transaction_count": transaction_count
            }
        except Exception as e:
            import traceback
            error_trace = traceback.format_exc()
            error_type = type(e).__name__
            error_msg = str(e)
            print(f"[MINING ERROR] Exception occurred: {error_type}: {error_msg}")
            print(f"[MINING ERROR] Traceback:\n{error_trace}")
            db.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"マイニング処理中にエラーが発生しました: {error_type}: {error_msg}"
            )
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        error_type = type(e).__name__
        error_msg = str(e)
        print(f"[MINING ERROR] Outer exception: {error_type}: {error_msg}")
        print(f"[MINING ERROR] Traceback:\n{error_trace}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {error_type}: {error_msg}")

@app.get("/api/mining/status")
async def get_mining_status():
    """マイニングの状態を取得"""
    try:
        blockchain.set_all_block_transactions()
        current_difficulty = blockchain.current_pow_difficulty
        block_count = len(blockchain.chain.get("blocks", []))
        transaction_pool_count = len(blockchain.transaction_pool.get("transactions", []))
        
        # POW_TARGET_SECはblockchainモジュールの定数として定義されている
        from blockchain import POW_TARGET_SEC
        
        return {
            "current_difficulty": current_difficulty,
            "block_count": block_count,
            "transaction_pool_count": transaction_pool_count,
            "target_seconds": POW_TARGET_SEC
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")

# ========== 管理者関連API ==========

class AdminLoginRequest(BaseModel):
    username: str
    password: str

class AdminTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str = "admin"

@app.post("/api/admin/login", response_model=AdminTokenResponse)
async def admin_login(request: AdminLoginRequest):
    """管理者ログイン"""
    try:
        if not verify_admin_credentials(request.username, request.password):
            raise HTTPException(
                status_code=401,
                detail="ユーザー名またはパスワードが正しくありません"
            )
        
        access_token = create_admin_token()
        
        return AdminTokenResponse(
            access_token=access_token,
            role="admin"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")

@app.get("/api/admin/me")
async def get_admin_info(
    admin: dict = Depends(get_admin_user)
):
    """現在の管理者情報を取得"""
    return {
        "role": admin["role"],
        "username": admin["username"]
    }


@app.get("/api/admin/transactions")
async def get_admin_transactions(
    admin: dict = Depends(get_admin_user),
    db: Session = Depends(get_db),
    limit: int = 200,
    offset: int = 0
):
    """管理者用: 全トランザクション一覧を取得"""
    try:
        transactions = db.query(TransactionModel).order_by(
            TransactionModel.transaction_date.desc()
        ).offset(offset).limit(limit).all()

        results = []
        for tx in transactions:
            seller = db.query(User).filter(User.user_id == tx.seller_id).first()
            buyer = db.query(User).filter(User.user_id == tx.buyer_id).first()
            # ミント = NFT取引かつ売り手＝買い手（このシステムではその組み合わせはミントのみ）
            is_mint = tx.nft_id is not None and tx.seller_id == tx.buyer_id
            tx_type = "ミント" if is_mint else ("NFT取引" if tx.nft_id else "送金")
            results.append({
                "transaction_id": tx.transaction_id,
                "nft_id": tx.nft_id,
                "type": tx_type,
                "seller_id": tx.seller_id,
                "seller_username": seller.username if seller else None,
                "seller_user_tag": seller.user_tag if seller else None,
                "buyer_id": tx.buyer_id,
                "buyer_username": buyer.username if buyer else None,
                "buyer_user_tag": buyer.user_tag if buyer else None,
                "price": float(tx.price),
                "currency": tx.currency,
                "transaction_date": tx.transaction_date.isoformat() if tx.transaction_date else None,
            })
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")


# チャット関連API
@app.get("/api/chat/rooms")
async def get_chat_rooms(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """チャットルーム一覧を取得"""
    try:
        current_user_id = current_user.user_id
        # 現在のユーザーが参加しているルームを取得
        rooms = db.query(ChatRoom).filter(
            (ChatRoom.user1_id == current_user_id) | (ChatRoom.user2_id == current_user_id)
        ).all()
        
        result = []
        for room in rooms:
            # 相手のユーザー情報を取得
            other_user = room.user2 if room.user1_id == current_user_id else room.user1
            
            # 最新メッセージを取得
            latest_message = db.query(ChatMessage).filter(
                ChatMessage.room_id == room.room_id
            ).order_by(ChatMessage.created_at.desc()).first()
            
            result.append({
                "room_id": room.room_id,
                "other_user": {
                    "user_id": other_user.user_id,
                    "username": other_user.username,
                    "user_tag": other_user.user_tag,
                    "wallet_address": other_user.wallet_address
                },
                "latest_message": {
                    "text": latest_message.message_text if latest_message else "",
                    "created_at": latest_message.created_at.isoformat() if latest_message else None
                } if latest_message else None,
                "updated_at": room.updated_at.isoformat() if room.updated_at else None
            })
        
        # 更新日時でソート
        result.sort(key=lambda x: x["updated_at"] or "", reverse=True)
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")


@app.get("/api/chat/rooms/{room_id}/messages")
async def get_chat_messages(
    room_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """チャットメッセージ一覧を取得"""
    try:
        # ルームの存在確認とアクセス権限チェック
        room = db.query(ChatRoom).filter(ChatRoom.room_id == room_id).first()
        if not room:
            raise HTTPException(status_code=404, detail="チャットルームが見つかりません")
        
        # 現在のユーザーがルームに参加しているか確認
        if room.user1_id != current_user.user_id and room.user2_id != current_user.user_id:
            raise HTTPException(status_code=403, detail="このチャットルームにアクセスする権限がありません")
        
        messages = db.query(ChatMessage).filter(
            ChatMessage.room_id == room_id
        ).order_by(ChatMessage.created_at.asc()).all()
        
        result = []
        for msg in messages:
            result.append({
                "message_id": msg.message_id,
                "sender_id": msg.sender_id,
                "sender_username": msg.sender.username if msg.sender else None,
                "sender_user_tag": msg.sender.user_tag if msg.sender else None,
                "sender_profile_image_url": msg.sender.profile_image_url if msg.sender else None,
                "message_text": msg.message_text,
                "created_at": msg.created_at.isoformat() if msg.created_at else None,
                "is_read": msg.is_read
            })
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")


class ChatMessageRequest(BaseModel):
    message_text: str

@app.post("/api/chat/rooms/{room_id}/messages")
async def send_chat_message(
    room_id: int,
    request: ChatMessageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """メッセージを送信"""
    try:
        # ルームの存在確認
        room = db.query(ChatRoom).filter(ChatRoom.room_id == room_id).first()
        if not room:
            raise HTTPException(status_code=404, detail="チャットルームが見つかりません")
        
        # 現在のユーザーがルームに参加しているか確認
        if room.user1_id != current_user.user_id and room.user2_id != current_user.user_id:
            raise HTTPException(status_code=403, detail="このチャットルームにアクセスする権限がありません")
        
        # メッセージを作成
        message = ChatMessage(
            room_id=room_id,
            sender_id=current_user.user_id,
            message_text=request.message_text,
            is_read=False
        )
        db.add(message)
        
        # ルームの更新日時を更新
        from datetime import datetime
        room.updated_at = datetime.utcnow()
        
        # 受信者に通知を送信（送信者以外のユーザー）
        recipient_id = room.user2_id if room.user1_id == current_user.user_id else room.user1_id
        notification = Notification(
            user_id=recipient_id,
            type="chat",
            title="新しいメッセージ",
            message=request.message_text[:100] if len(request.message_text) > 100 else request.message_text,
            related_id=message.message_id,
            is_read=False
        )
        db.add(notification)
        
        db.commit()
        db.refresh(message)
        
        return {
            "message_id": message.message_id,
            "sender_id": message.sender_id,
            "sender_username": message.sender.username if message.sender else None,
            "sender_user_tag": message.sender.user_tag if message.sender else None,
            "sender_profile_image_url": message.sender.profile_image_url if message.sender else None,
            "message_text": message.message_text,
            "created_at": message.created_at.isoformat() if message.created_at else None,
            "is_read": message.is_read
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")


@app.get("/api/chat/users")
async def get_chat_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """チャット可能なユーザー一覧を取得（フォローしているユーザーのみ）"""
    try:
        # フォローしているユーザーIDを取得
        following_ids = db.query(Follow.following_id).filter(
            Follow.follower_id == current_user.user_id
        ).all()
        following_id_set = {fid[0] for fid in following_ids}
        
        # フォローしているユーザーのみを取得
        users = db.query(User).filter(User.user_id.in_(following_id_set)).all()
        result = []
        for user in users:
            result.append({
                "user_id": user.user_id,
                "username": user.username,
                "user_tag": user.user_tag,
                "wallet_address": user.wallet_address
            })
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")

@app.get("/api/users/following")
async def get_following_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """フォローしているユーザー一覧を取得"""
    try:
        follows = db.query(Follow).filter(
            Follow.follower_id == current_user.user_id
        ).all()
        
        result = []
        for follow in follows:
            user = follow.following
            result.append({
                "user_id": user.user_id,
                "username": user.username,
                "user_tag": user.user_tag,
                "user_type": user.user_type,
                "profile_image_url": user.profile_image_url,
                "bio": user.bio,
                "followed_at": follow.created_at.isoformat() if follow.created_at else None
            })
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")

@app.post("/api/users/{user_id}/follow")
async def follow_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """ユーザーをフォロー"""
    try:
        # 自分自身をフォローできないようにする
        if user_id == current_user.user_id:
            raise HTTPException(status_code=400, detail="自分自身をフォローすることはできません")
        
        # 対象ユーザーの存在確認
        target_user = db.query(User).filter(User.user_id == user_id).first()
        if not target_user:
            raise HTTPException(status_code=404, detail="ユーザーが見つかりません")
        
        # 既にフォローしているか確認
        existing_follow = db.query(Follow).filter(
            Follow.follower_id == current_user.user_id,
            Follow.following_id == user_id
        ).first()
        
        if existing_follow:
            raise HTTPException(status_code=400, detail="既にフォローしています")
        
        # フォロー関係を作成
        follow = Follow(
            follower_id=current_user.user_id,
            following_id=user_id
        )
        db.add(follow)
        db.commit()
        db.refresh(follow)
        
        return {
            "message": "フォローしました",
            "follow_id": follow.follow_id
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")

@app.delete("/api/users/{user_id}/follow")
async def unfollow_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """ユーザーのフォローを解除"""
    try:
        # フォロー関係を取得
        follow = db.query(Follow).filter(
            Follow.follower_id == current_user.user_id,
            Follow.following_id == user_id
        ).first()
        
        if not follow:
            raise HTTPException(status_code=404, detail="フォロー関係が見つかりません")
        
        db.delete(follow)
        db.commit()
        
        return {"message": "フォローを解除しました"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")


class CreateRoomRequest(BaseModel):
    user2_id: int  # user1_idは現在のユーザーIDを使用

@app.post("/api/chat/rooms")
async def create_chat_room(
    request: CreateRoomRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """チャットルームを作成"""
    try:
        # user1_idは現在のユーザーIDを使用
        user1_id = current_user.user_id
        user2_id = request.user2_id
        
        if user1_id == user2_id:
            raise HTTPException(status_code=400, detail="自分自身とのチャットは作成できません")
        
        # 既存のルームを確認
        existing_room = db.query(ChatRoom).filter(
            ((ChatRoom.user1_id == user1_id) & (ChatRoom.user2_id == user2_id)) |
            ((ChatRoom.user1_id == user2_id) & (ChatRoom.user2_id == user1_id))
        ).first()
        
        if existing_room:
            return {"room_id": existing_room.room_id, "message": "既存のルームを返しました"}
        
        # 新しいルームを作成
        room = ChatRoom(user1_id=user1_id, user2_id=user2_id)
        db.add(room)
        db.commit()
        db.refresh(room)
        
        return {"room_id": room.room_id, "message": "新しいルームを作成しました"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")


# ========== 購入関連API ==========

class PurchaseRequest(BaseModel):
    nft_ids: List[int]  # 購入するNFTのIDリスト

class PurchaseResponse(BaseModel):
    transaction_id: int
    nft_id: int
    buyer_id: int
    seller_id: int
    price: float
    currency: str
    transaction_date: str

@app.post("/api/purchases", response_model=List[PurchaseResponse])
async def create_purchase(
    request: PurchaseRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """NFTを購入する"""
    try:
        if not request.nft_ids:
            raise HTTPException(status_code=400, detail="購入するNFTを選択してください")
        
        # ウォレットアドレスの存在確認
        if not current_user.wallet_address:
            raise HTTPException(
                status_code=400, 
                detail="ウォレットアドレスが設定されていません。プロフィールページでウォレットアドレスを設定してください。"
            )
        
        # ウォレットアドレスのバリデーション
        wallet_valid, wallet_msg = validate_wallet_address(current_user.wallet_address)
        if not wallet_valid:
            raise HTTPException(
                status_code=400,
                detail=f"ウォレットアドレスが無効です: {wallet_msg}。プロフィールページで正しいウォレットアドレスを設定してください。"
            )
        
        results = []
        
        for nft_id in request.nft_ids:
            # NFTの存在確認
            nft = db.query(NFTModel).filter(NFTModel.nft_id == nft_id).first()
            if not nft:
                raise HTTPException(status_code=404, detail=f"NFT ID {nft_id} が見つかりません")
            
            # アクティブな出品情報を取得
            listing = db.query(Listing).filter(
                Listing.nft_id == nft_id,
                Listing.status == "active"
            ).first()
            
            if not listing:
                raise HTTPException(status_code=400, detail=f"NFT ID {nft_id} は現在出品されていません")
            
            # 自分が所有しているNFTは購入できない
            if nft.owner_id == current_user.user_id:
                raise HTTPException(status_code=400, detail=f"NFT ID {nft_id} は既に所有しています")
            
            # 出品者を取得
            seller = db.query(User).filter(User.user_id == listing.seller_id).first()
            if not seller:
                raise HTTPException(status_code=404, detail="出品者が見つかりません")
            
            # 出品者のウォレットアドレス確認
            if not seller.wallet_address:
                raise HTTPException(
                    status_code=400,
                    detail=f"出品者のウォレットアドレスが設定されていません。NFT ID {nft_id} の購入を完了できません。"
                )
            
            # 購入者の残高をチェック（利用可能残高はDBのみ。BCは別枠で参照用）
            db_balance = float(current_user.balance) if current_user.balance else 0.0
            purchase_price = float(listing.price)
            if db_balance < purchase_price:
                raise HTTPException(
                    status_code=400,
                    detail=f"残高が不足しています。必要: {purchase_price}HLC, 現在: {db_balance}HLC"
                )
            
            # 購入者の残高から価格を減算（DBの残高から減算）
            current_user.balance = float(current_user.balance) - purchase_price
            buyer_public_key = current_user.wallet_address.replace("0x", "").ljust(128, "0")[:128]
            
            # 出品者の残高に価格を加算（DBの残高を増やす）
            if seller.balance is None:
                seller.balance = 0.0
            seller.balance = float(seller.balance) + purchase_price
            
            # ブロックチェーン上にトランザクションを作成（所有権移転のみ、支払いはDBで処理済み）
            buyer_public_key_str = current_user.wallet_address.replace("0x", "").ljust(128, "0")[:128]
            seller_public_key_str = seller.wallet_address.replace("0x", "").ljust(128, "0")[:128]
            
            # 前のミントハッシュを取得（所有権移転の記録用）
            # original_mint_hashが存在する場合はそれを使用、なければblockchain_hashを使用
            previous_mint_hash = nft.original_mint_hash or nft.blockchain_hash or ""
            
            # 所有権移転トランザクションを作成（支払いはDBで処理済みのため、amount: 0）
            transfer_transaction = {
                "time": datetime.utcnow().isoformat(),
                "sender": seller_public_key_str,  # 前の所有者から
                "receiver": buyer_public_key_str,  # 新しい所有者へ
                "amount": 0,  # 支払いはDBで処理済みのため、金額0
                "nft_data": json.dumps({
                    "nft_id": nft_id,
                    "action": "transfer",
                    "name": nft.name,
                    "image_url": nft.image_url,
                    "price": purchase_price  # 記録用に価格を含める
                }),
                "nft_origin": previous_mint_hash,  # 前のミントハッシュを記録
                "signature": "transfer"  # 所有権移転を示す
            }
            
            # トランザクションプールに追加（所有権移転のみ）
            transfer_added = blockchain.add_transaction_pool(transfer_transaction)
            
            if transfer_added:
                blockchain.save_transaction_pool()
                print(f"[PURCHASE] User {current_user.user_id} purchased NFT {nft_id} for {purchase_price}HLC (DB balance deducted)")
                print(f"[TRANSFER] Ownership transferred from {seller.user_id} to {current_user.user_id} (NFT {nft_id})")
            else:
                # トランザクションが既に存在する場合は警告のみ（重複防止）
                print(f"[PURCHASE WARNING] Transaction already exists for NFT {nft_id}")
            
            # データベースのトランザクションを作成（ブロックチェーンとして正しい挙動: 資産移動＝購入時のみ記録）
            # ※出品(Listing)時点では記録しない。購入＝売買成立の時点で1トランザクション
            transaction = TransactionModel(
                nft_id=nft_id,
                buyer_id=current_user.user_id,
                seller_id=listing.seller_id,
                price=listing.price,
                currency=listing.currency,
                transaction_date=datetime.utcnow()
            )
            db.add(transaction)
            
            # NFTの所有権を更新（本物のNFTのように、前の所有者は所有権を持たない）
            nft.owner_id = current_user.user_id
            nft.status = "owned"  # 購入後は"owned"ステータスに変更
            nft.blockchain_hash = None  # 購入時にミントをオフにする（購入者が再ミントできるように）
            # original_mint_hashは永続化（最初のミントハッシュを保持）
            if not nft.original_mint_hash and previous_mint_hash:
                nft.original_mint_hash = previous_mint_hash
            nft.updated_at = datetime.utcnow()
            
            # 出品情報を更新
            listing.status = "sold"
            listing.sold_at = datetime.utcnow()
            listing.updated_at = datetime.utcnow()
            
            # 同じNFTの他のアクティブな出品をキャンセル
            other_listings = db.query(Listing).filter(
                Listing.nft_id == nft_id,
                Listing.status == "active",
                Listing.listing_id != listing.listing_id
            ).all()
            for other_listing in other_listings:
                other_listing.status = "cancelled"
                other_listing.updated_at = datetime.utcnow()
            
            # 出品者に通知を送信
            notification = Notification(
                user_id=listing.seller_id,
                type="purchase",
                title="NFTが購入されました",
                message=f"{nft.name}が{float(listing.price)}HLCで購入されました",
                related_id=transaction.transaction_id,
                is_read=False
            )
            db.add(notification)
            
            db.commit()
            db.refresh(transaction)
            
            results.append({
                "transaction_id": transaction.transaction_id,
                "nft_id": nft_id,
                "buyer_id": current_user.user_id,
                "seller_id": listing.seller_id,
                "price": float(transaction.price),
                "currency": transaction.currency,
                "transaction_date": transaction.transaction_date.isoformat() if transaction.transaction_date else None
            })
        
        return results
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")


class TransferRequest(BaseModel):
    recipient_user_id: int
    recipient_wallet_address: str
    amount: float
    memo: str | None = None


class TransferResponse(BaseModel):
    transfer_id: int
    sender_id: int
    recipient_id: int
    amount: float
    memo: str | None = None
    created_at: str


@app.get("/api/transfer/history")
async def get_transfer_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """送金履歴を取得（認証必須）"""
    try:
        # 送金履歴を取得（送金者としての履歴、nft_idがNoneのもの）
        transfers = db.query(TransactionModel).filter(
            TransactionModel.seller_id == current_user.user_id,  # 送金者
            TransactionModel.nft_id.is_(None)  # NFT購入ではない送金
        ).order_by(TransactionModel.transaction_date.desc()).limit(50).all()
        
        results = []
        for transfer in transfers:
            # 受取人情報を取得
            recipient = db.query(User).filter(User.user_id == transfer.buyer_id).first()
            
            results.append({
                "transaction_id": transfer.transaction_id,
                "recipient_user_id": transfer.buyer_id,
                "recipient_username": recipient.username if recipient else None,
                "recipient_user_tag": recipient.user_tag if recipient else None,
                "amount": float(transfer.price),
                "memo": None,  # メモは現在保存していない
                "created_at": transfer.transaction_date.isoformat() if transfer.transaction_date else None
            })
        
        return results
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        error_type = type(e).__name__
        error_msg = str(e)
        print(f"[TRANSFER HISTORY ERROR] Exception: {error_type}: {error_msg}")
        print(f"[TRANSFER HISTORY ERROR] Traceback:\n{error_trace}")
        raise HTTPException(status_code=500, detail=f"送金履歴の取得中にエラーが発生しました: {error_type}: {error_msg}")


@app.post("/api/transfer", response_model=TransferResponse)
async def create_transfer(
    request: TransferRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """送金処理（認証必須）"""
    try:
        # 送金額のバリデーション
        if request.amount <= 0:
            raise HTTPException(status_code=400, detail="送金額は0より大きい値である必要があります")
        
        if request.amount > 1000000:  # 異常値チェック
            raise HTTPException(status_code=400, detail="送金額が異常に高いです")
        
        # 送金先ユーザーの存在確認
        recipient = db.query(User).filter(User.user_id == request.recipient_user_id).first()
        if not recipient:
            raise HTTPException(status_code=404, detail="送金先ユーザーが見つかりません")
        
        # 送金先のウォレットアドレスが一致するか確認
        if recipient.wallet_address != request.recipient_wallet_address:
            raise HTTPException(
                status_code=400,
                detail="送金先のウォレットアドレスが一致しません"
            )
        
        # 自分自身への送金を防止
        if current_user.user_id == request.recipient_user_id:
            raise HTTPException(status_code=400, detail="自分自身への送金はできません")
        
        # 送金者の残高をチェック（利用可能残高はDBのみ）
        db_balance = float(current_user.balance) if current_user.balance else 0.0
        if db_balance < request.amount:
            raise HTTPException(
                status_code=400,
                detail=f"残高が不足しています。必要: {request.amount}HLC, 現在: {db_balance}HLC"
            )
        
        # 送金者の残高から減算（DBの残高から減算）
        current_user.balance = float(current_user.balance) - request.amount
        
        # 受取人の残高に加算（DBの残高を増やす）
        if recipient.balance is None:
            recipient.balance = 0.0
        recipient.balance = float(recipient.balance) + request.amount
        
        # 送金履歴をデータベースに保存（Transactionテーブルを使用、nft_idはNone）
        transfer_record = TransactionModel(
            nft_id=None,  # 送金の場合はNFT IDなし
            buyer_id=request.recipient_user_id,  # 受取人
            seller_id=current_user.user_id,  # 送金者
            price=request.amount,
            currency="HLC",
            transaction_date=datetime.utcnow()
        )
        db.add(transfer_record)
        
        # 受取人に通知を送信
        notification = Notification(
            user_id=request.recipient_user_id,
            type="transfer",
            title="送金を受け取りました",
            message=f"{current_user.username or 'ユーザー'}から{request.amount}HLCの送金を受け取りました",
            related_id=transfer_record.transaction_id,
            is_read=False
        )
        db.add(notification)
        
        db.commit()
        db.refresh(transfer_record)
        
        print(f"[TRANSFER] User {current_user.user_id} transferred {request.amount}HLC to user {request.recipient_user_id}")
        
        return {
            "transfer_id": transfer_record.transaction_id,
            "sender_id": current_user.user_id,
            "recipient_id": request.recipient_user_id,
            "amount": float(request.amount),
            "memo": request.memo,
            "created_at": transfer_record.transaction_date.isoformat() if transfer_record.transaction_date else None
        }
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        error_type = type(e).__name__
        error_msg = str(e)
        print(f"[TRANSFER ERROR] Exception: {error_type}: {error_msg}")
        print(f"[TRANSFER ERROR] Traceback:\n{error_trace}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"送金処理中にエラーが発生しました: {error_type}: {error_msg}")


class NotificationResponse(BaseModel):
    notification_id: int
    type: str
    title: str
    message: str | None
    related_id: int | None
    is_read: bool
    created_at: str


@app.get("/api/notifications/unread-count")
async def get_unread_notification_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """未読通知数を取得（認証必須）"""
    try:
        count = db.query(Notification).filter(
            Notification.user_id == current_user.user_id,
            Notification.is_read == False
        ).count()
        
        return {"unread_count": count}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"未読通知数の取得中にエラーが発生しました: {str(e)}")


@app.get("/api/notifications", response_model=List[NotificationResponse])
async def get_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 50,
    unread_only: bool = False
):
    """通知一覧を取得（認証必須）"""
    try:
        query = db.query(Notification).filter(Notification.user_id == current_user.user_id)
        
        if unread_only:
            query = query.filter(Notification.is_read == False)
        
        notifications = query.order_by(Notification.created_at.desc()).limit(limit).all()
        
        results = []
        for notification in notifications:
            results.append({
                "notification_id": notification.notification_id,
                "type": notification.type,
                "title": notification.title,
                "message": notification.message,
                "related_id": notification.related_id,
                "is_read": notification.is_read,
                "created_at": notification.created_at.isoformat() if notification.created_at else None
            })
        
        return results
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        error_type = type(e).__name__
        error_msg = str(e)
        print(f"[NOTIFICATIONS ERROR] Exception: {error_type}: {error_msg}")
        print(f"[NOTIFICATIONS ERROR] Traceback:\n{error_trace}")
        raise HTTPException(status_code=500, detail=f"通知の取得中にエラーが発生しました: {error_type}: {error_msg}")


@app.put("/api/notifications/{notification_id}/read")
async def mark_notification_as_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """通知を既読にする（認証必須）"""
    try:
        notification = db.query(Notification).filter(
            Notification.notification_id == notification_id,
            Notification.user_id == current_user.user_id
        ).first()
        
        if not notification:
            raise HTTPException(status_code=404, detail="通知が見つかりません")
        
        notification.is_read = True
        db.commit()
        
        return {"message": "通知を既読にしました"}
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"通知の既読処理中にエラーが発生しました: {str(e)}")

@app.get("/api/purchases", response_model=List[PurchaseResponse])
async def get_purchases(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 100,
    offset: int = 0
):
    """購入履歴を取得"""
    try:
        transactions = db.query(TransactionModel).filter(
            TransactionModel.buyer_id == current_user.user_id
        ).order_by(TransactionModel.transaction_date.desc()).offset(offset).limit(limit).all()
        
        results = []
        for transaction in transactions:
            results.append({
                "transaction_id": transaction.transaction_id,
                "nft_id": transaction.nft_id,
                "buyer_id": transaction.buyer_id,
                "seller_id": transaction.seller_id,
                "price": float(transaction.price),
                "currency": transaction.currency,
                "transaction_date": transaction.transaction_date.isoformat() if transaction.transaction_date else None
            })
        
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")

@app.get("/api/nfts/{nft_id}/transaction-history")
async def get_nft_transaction_history(
    nft_id: int,
    current_user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    """NFTの取引履歴を取得（所有者と取引価格）- 認証不要"""
    try:
        # NFTが存在するか確認
        nft = db.query(NFTModel).filter(NFTModel.nft_id == nft_id).first()
        if not nft:
            raise HTTPException(status_code=404, detail="NFTが見つかりません")
        
        # 取引履歴を取得（時系列順）
        transactions = db.query(TransactionModel).filter(
            TransactionModel.nft_id == nft_id
        ).order_by(TransactionModel.transaction_date.asc()).all()
        
        results = []
        for transaction in transactions:
            # 売り手と買い手の情報を取得
            seller = db.query(User).filter(User.user_id == transaction.seller_id).first()
            buyer = db.query(User).filter(User.user_id == transaction.buyer_id).first()
            
            results.append({
                "transaction_id": transaction.transaction_id,
                "seller_id": transaction.seller_id,
                "seller_username": seller.username if seller else "不明",
                "buyer_id": transaction.buyer_id,
                "buyer_username": buyer.username if buyer else "不明",
                "price": float(transaction.price),
                "currency": transaction.currency,
                "transaction_date": transaction.transaction_date.isoformat() if transaction.transaction_date else None
            })
        
        return results
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"エラーが発生しました: {str(e)}")

@app.get("/transaction_pool")
def get_transaction_pool():
    return blockchain.transaction_pool

@app.post("/transaction_pool")
def post_transaction_pool(transaction: Transaction):
    transaction_dict = transaction.dict()
    if blockchain.verify_transaction(transaction_dict):
        if blockchain.add_transaction_pool(transaction_dict):
            blockchain.save_transaction_pool()
            blockchain.broadcast_transaction(transaction_dict)
            return {"message": "Transaction is posted."}

@app.post("/receive_transaction")
def receive_transaction(transaction :Transaction):
    transaction_dict = transaction.dict()
    if blockchain.verify_transaction(transaction_dict):
        if blockchain.add_transaction_pool(transaction_dict):
            blockchain.save_transaction_pool()
            return{"message":"Transaction is received."}

@app.get("/chain")
def get_chain():
    return blockchain.chain

@app.post("/chain")
def post_chain(chain: Chain):
    chain_dict = chain.dict()
    
    if len(chain_dict["blocks"]) <= len(blockchain.chain["blocks"]):
        return {"message":"Received chain is ignored."}
    
    if blockchain.verify_chain(chain_dict):
        blockchain.replace_chain(chain_dict)
        blockchain.save_blockchain()
        blockchain.save_transaction_pool()
        return {"message":"Chain is posted."}
    else:
        return {"message":"Chain verification failed."}

if __name__=="__main__":
    uvicorn.run("main:app",host="0.0.0.0",port=8000)