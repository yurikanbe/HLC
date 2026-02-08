"""
データベース接続とモデル定義
開発: SQLite / 本番: 環境変数 DATABASE_URL でクラウドDB（PostgreSQL/MySQL等）を指定可能
"""
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, DECIMAL, Boolean, ForeignKey, UniqueConstraint, Index
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import os

# 本番では環境変数 DATABASE_URL を設定（例: postgresql://user:pass@host:5432/dbname）
# 未設定の場合は SQLite（開発・デモ用）
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./nft_marketplace_disabled.db")
_is_sqlite = DATABASE_URL.strip().lower().startswith("sqlite")

# エンジンとセッションの作成（SQLite のときだけ check_same_thread、クラウドDB ではプール設定）
_connect_args = {"check_same_thread": False} if _is_sqlite else {}
engine = create_engine(
    DATABASE_URL,
    connect_args=_connect_args,
    pool_pre_ping=True,   # 死んだ接続を検知して再接続（本番向け）
    pool_size=5 if not _is_sqlite else 5,
    max_overflow=10 if not _is_sqlite else 0,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


# テーブル定義
class User(Base):
    __tablename__ = "users"
    
    user_id = Column(Integer, primary_key=True, autoincrement=True)
    wallet_address = Column(String(42), nullable=False, unique=True, index=True)
    username = Column(String(50), nullable=True, index=True)
    user_tag = Column(String(4), nullable=True, unique=True, index=True)  # 4桁の識別子（#0001-#9999）
    email = Column(String(100), nullable=True, index=True)
    password_hash = Column(String(255), nullable=True)  # 出品者のみ必須
    user_type = Column(String(20), nullable=False, default="user", index=True)  # user/seller
    profile_image_url = Column(String(500), nullable=True)
    bio = Column(Text, nullable=True)  # 自己紹介文
    balance = Column(DECIMAL(18, 8), nullable=False, default=0.0)  # コイン残高
    login_code = Column(String(4), nullable=True)  # 4桁ログインコード
    login_code_expires = Column(DateTime, nullable=True)  # ログインコード有効期限
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # リレーション
    created_nfts = relationship("NFT", foreign_keys="NFT.creator_id", back_populates="creator")
    owned_nfts = relationship("NFT", foreign_keys="NFT.owner_id", back_populates="owner")


class NFT(Base):
    __tablename__ = "nfts"
    
    nft_id = Column(Integer, primary_key=True, autoincrement=True)
    token_id = Column(Integer, nullable=True)
    contract_address = Column(String(42), nullable=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    image_url = Column(String(500), nullable=True)
    owner_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    creator_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    category = Column(String(50), nullable=True, index=True)
    status = Column(String(20), nullable=False, default="draft", index=True)  # draft/minted/listed/sold
    blockchain_hash = Column(String(66), nullable=True, unique=True, index=True)  # ブロックチェーン上のトランザクションハッシュ（現在のミントハッシュ）
    original_mint_hash = Column(String(66), nullable=True, index=True)  # 最初のミントハッシュ（永続化）
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # リレーション
    owner = relationship("User", foreign_keys=[owner_id], back_populates="owned_nfts")
    creator = relationship("User", foreign_keys=[creator_id], back_populates="created_nfts")
    listings = relationship("Listing", back_populates="nft")
    transactions = relationship("Transaction", back_populates="nft")
    
    # ユニーク制約
    __table_args__ = (
        UniqueConstraint('contract_address', 'token_id', name='uq_contract_token'),
    )


class Listing(Base):
    __tablename__ = "listings"
    
    listing_id = Column(Integer, primary_key=True, autoincrement=True)
    nft_id = Column(Integer, ForeignKey("nfts.nft_id"), nullable=False, index=True)
    seller_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    price = Column(DECIMAL(18, 8), nullable=False, index=True)
    currency = Column(String(10), nullable=False, default="ETH")
    status = Column(String(20), nullable=False, default="active", index=True)  # active/sold/cancelled
    listed_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    sold_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # リレーション
    nft = relationship("NFT", back_populates="listings")
    seller = relationship("User")


class Transaction(Base):
    __tablename__ = "transactions"
    
    transaction_id = Column(Integer, primary_key=True, autoincrement=True)
    nft_id = Column(Integer, ForeignKey("nfts.nft_id"), nullable=True, index=True)  # 送金の場合はNULL可
    buyer_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    seller_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    price = Column(DECIMAL(18, 8), nullable=False)
    currency = Column(String(10), nullable=False, default="ETH")
    transaction_hash = Column(String(66), nullable=True, unique=True, index=True)
    transaction_date = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    
    # リレーション
    nft = relationship("NFT", back_populates="transactions")
    buyer = relationship("User", foreign_keys=[buyer_id])
    seller = relationship("User", foreign_keys=[seller_id])


class Favorite(Base):
    __tablename__ = "favorites"
    
    favorite_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    nft_id = Column(Integer, ForeignKey("nfts.nft_id"), nullable=False, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    
    # ユニーク制約
    __table_args__ = (
        UniqueConstraint('user_id', 'nft_id', name='uq_user_nft'),
    )


class Category(Base):
    __tablename__ = "categories"
    
    category_id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(50), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0, index=True)
    is_active = Column(Boolean, nullable=False, default=True)


class ChatRoom(Base):
    __tablename__ = "chat_rooms"
    
    room_id = Column(Integer, primary_key=True, autoincrement=True)
    user1_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    user2_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # リレーション
    user1 = relationship("User", foreign_keys=[user1_id])
    user2 = relationship("User", foreign_keys=[user2_id])
    messages = relationship("ChatMessage", back_populates="room", order_by="ChatMessage.created_at")
    
    # ユニーク制約（同じユーザー間の重複を防ぐ）
    __table_args__ = (
        UniqueConstraint('user1_id', 'user2_id', name='uq_user_pair'),
    )


class Follow(Base):
    __tablename__ = "follows"
    
    follow_id = Column(Integer, primary_key=True, autoincrement=True)
    follower_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    following_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    
    # リレーション
    follower = relationship("User", foreign_keys=[follower_id])
    following = relationship("User", foreign_keys=[following_id])
    
    # ユニーク制約（同じユーザーを重複フォローできないようにする）
    __table_args__ = (
        UniqueConstraint('follower_id', 'following_id', name='uq_follower_following'),
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    
    message_id = Column(Integer, primary_key=True, autoincrement=True)
    room_id = Column(Integer, ForeignKey("chat_rooms.room_id"), nullable=False, index=True)
    sender_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    message_text = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    is_read = Column(Boolean, nullable=False, default=False)
    
    # リレーション
    room = relationship("ChatRoom", back_populates="messages")
    sender = relationship("User")


class Notification(Base):
    __tablename__ = "notifications"
    
    notification_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    type = Column(String(20), nullable=False, index=True)  # purchase/transfer/chat
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=True)
    related_id = Column(Integer, nullable=True)  # transaction_id, message_idなど
    is_read = Column(Boolean, nullable=False, default=False, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    
    # リレーション
    user = relationship("User")


# データベース初期化関数
def init_db():
    """データベースとテーブルを作成"""
    Base.metadata.create_all(bind=engine)
    
    # SQLite 用のマイグレーション（既存のローカル DB を更新するときのみ。Cloud SQL のときはスキップ）
    if not _is_sqlite:
        print("データベースを初期化しました")
        return
    import sqlite3
    db_file = "./nft_marketplace_disabled.db"
    if os.path.exists(db_file):
        conn = sqlite3.connect(db_file)
        cursor = conn.cursor()
        try:
            # blockchain_hashカラムの追加
            cursor.execute("PRAGMA table_info(nfts)")
            columns = [row[1] for row in cursor.fetchall()]
            
            if 'blockchain_hash' not in columns:
                print("blockchain_hashカラムを追加しています...")
                cursor.execute("""
                    ALTER TABLE nfts 
                    ADD COLUMN blockchain_hash VARCHAR(66) NULL
                """)
                try:
                    cursor.execute("""
                        CREATE INDEX IF NOT EXISTS ix_nfts_blockchain_hash 
                        ON nfts(blockchain_hash)
                    """)
                except sqlite3.OperationalError:
                    pass
                conn.commit()
                print("blockchain_hashカラムの追加が完了しました。")
            
            # original_mint_hashカラムの追加
            cursor.execute("PRAGMA table_info(nfts)")
            columns = [row[1] for row in cursor.fetchall()]
            
            if 'original_mint_hash' not in columns:
                print("original_mint_hashカラムを追加しています...")
                cursor.execute("""
                    ALTER TABLE nfts 
                    ADD COLUMN original_mint_hash VARCHAR(66) NULL
                """)
                try:
                    cursor.execute("""
                        CREATE INDEX IF NOT EXISTS ix_nfts_original_mint_hash 
                        ON nfts(original_mint_hash)
                    """)
                except sqlite3.OperationalError:
                    pass
                conn.commit()
                print("original_mint_hashカラムの追加が完了しました。")
            
            # balanceカラムの追加
            cursor.execute("PRAGMA table_info(users)")
            columns = [row[1] for row in cursor.fetchall()]
            
            if 'balance' not in columns:
                print("balanceカラムを追加しています...")
                cursor.execute("""
                    ALTER TABLE users 
                    ADD COLUMN balance DECIMAL(18, 8) NOT NULL DEFAULT 0.0
                """)
                conn.commit()
                print("balanceカラムの追加が完了しました。")
            
            # user_tagカラムの追加
            cursor.execute("PRAGMA table_info(users)")
            columns = [row[1] for row in cursor.fetchall()]
            
            if 'user_tag' not in columns:
                print("user_tagカラムを追加しています...")
                cursor.execute("""
                    ALTER TABLE users 
                    ADD COLUMN user_tag VARCHAR(4) NULL
                """)
                try:
                    cursor.execute("""
                        CREATE UNIQUE INDEX IF NOT EXISTS ix_users_user_tag 
                        ON users(user_tag)
                    """)
                except sqlite3.OperationalError:
                    pass
                conn.commit()
                print("user_tagカラムの追加が完了しました。")
            
            # transactions.nft_idをNULL可に変更（送金機能のため）
            cursor.execute("PRAGMA table_info(transactions)")
            columns = [row for row in cursor.fetchall()]
            nft_id_column = next((col for col in columns if col[1] == 'nft_id'), None)
            
            if nft_id_column and nft_id_column[3] == 1:  # NOT NULL制約がある場合
                print("transactions.nft_idをNULL可に変更しています...")
                # SQLiteではALTER COLUMNが直接できないため、テーブルを再作成
                # ただし、既存データがある場合は注意が必要
                try:
                    # 既存データをバックアップ
                    cursor.execute("SELECT COUNT(*) FROM transactions")
                    transaction_count = cursor.fetchone()[0]
                    
                    if transaction_count == 0:
                        # データがない場合はテーブルを再作成
                        cursor.execute("""
                            CREATE TABLE transactions_new (
                                transaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
                                nft_id INTEGER NULL,
                                buyer_id INTEGER NOT NULL,
                                seller_id INTEGER NOT NULL,
                                price DECIMAL(18, 8) NOT NULL,
                                currency VARCHAR(10) NOT NULL DEFAULT 'ETH',
                                transaction_hash VARCHAR(66) NULL UNIQUE,
                                transaction_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                FOREIGN KEY (nft_id) REFERENCES nfts(nft_id),
                                FOREIGN KEY (buyer_id) REFERENCES users(user_id),
                                FOREIGN KEY (seller_id) REFERENCES users(user_id)
                            )
                        """)
                        cursor.execute("""
                            CREATE INDEX IF NOT EXISTS ix_transactions_nft_id 
                            ON transactions_new(nft_id)
                        """)
                        cursor.execute("""
                            CREATE INDEX IF NOT EXISTS ix_transactions_buyer_id 
                            ON transactions_new(buyer_id)
                        """)
                        cursor.execute("""
                            CREATE INDEX IF NOT EXISTS ix_transactions_seller_id 
                            ON transactions_new(seller_id)
                        """)
                        cursor.execute("""
                            CREATE INDEX IF NOT EXISTS ix_transactions_transaction_hash 
                            ON transactions_new(transaction_hash)
                        """)
                        cursor.execute("""
                            CREATE INDEX IF NOT EXISTS ix_transactions_transaction_date 
                            ON transactions_new(transaction_date)
                        """)
                        cursor.execute("DROP TABLE transactions")
                        cursor.execute("ALTER TABLE transactions_new RENAME TO transactions")
                        conn.commit()
                        print("transactions.nft_idをNULL可に変更しました。")
                    else:
                        # データがある場合は、既存データを保持してテーブルを再作成
                        cursor.execute("""
                            CREATE TABLE transactions_new (
                                transaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
                                nft_id INTEGER NULL,
                                buyer_id INTEGER NOT NULL,
                                seller_id INTEGER NOT NULL,
                                price DECIMAL(18, 8) NOT NULL,
                                currency VARCHAR(10) NOT NULL DEFAULT 'ETH',
                                transaction_hash VARCHAR(66) NULL UNIQUE,
                                transaction_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                                FOREIGN KEY (nft_id) REFERENCES nfts(nft_id),
                                FOREIGN KEY (buyer_id) REFERENCES users(user_id),
                                FOREIGN KEY (seller_id) REFERENCES users(user_id)
                            )
                        """)
                        cursor.execute("""
                            INSERT INTO transactions_new 
                            (transaction_id, nft_id, buyer_id, seller_id, price, currency, transaction_hash, transaction_date)
                            SELECT transaction_id, nft_id, buyer_id, seller_id, price, currency, transaction_hash, transaction_date
                            FROM transactions
                        """)
                        cursor.execute("DROP TABLE transactions")
                        cursor.execute("ALTER TABLE transactions_new RENAME TO transactions")
                        cursor.execute("""
                            CREATE INDEX IF NOT EXISTS ix_transactions_nft_id 
                            ON transactions(nft_id)
                        """)
                        cursor.execute("""
                            CREATE INDEX IF NOT EXISTS ix_transactions_buyer_id 
                            ON transactions(buyer_id)
                        """)
                        cursor.execute("""
                            CREATE INDEX IF NOT EXISTS ix_transactions_seller_id 
                            ON transactions(seller_id)
                        """)
                        cursor.execute("""
                            CREATE INDEX IF NOT EXISTS ix_transactions_transaction_hash 
                            ON transactions(transaction_hash)
                        """)
                        cursor.execute("""
                            CREATE INDEX IF NOT EXISTS ix_transactions_transaction_date 
                            ON transactions(transaction_date)
                        """)
                        conn.commit()
                        print(f"transactions.nft_idをNULL可に変更しました（{transaction_count}件のデータを保持）。")
                except sqlite3.Error as e:
                    print(f"transactions.nft_idの変更エラー: {e}")
                    conn.rollback()
            
            # notificationsテーブルの作成
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='notifications'")
            if not cursor.fetchone():
                print("notificationsテーブルを作成しています...")
                cursor.execute("""
                    CREATE TABLE notifications (
                        notification_id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER NOT NULL,
                        type VARCHAR(20) NOT NULL,
                        title VARCHAR(200) NOT NULL,
                        message TEXT NULL,
                        related_id INTEGER NULL,
                        is_read BOOLEAN NOT NULL DEFAULT 0,
                        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(user_id)
                    )
                """)
                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS ix_notifications_user_id 
                    ON notifications(user_id)
                """)
                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS ix_notifications_type 
                    ON notifications(type)
                """)
                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS ix_notifications_is_read 
                    ON notifications(is_read)
                """)
                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS ix_notifications_created_at 
                    ON notifications(created_at)
                """)
                conn.commit()
                print("notificationsテーブルの作成が完了しました。")
        except sqlite3.Error as e:
            print(f"マイグレーションエラー: {e}")
            conn.rollback()
        finally:
            conn.close()
    
    print("データベースを初期化しました")


# セッション取得関数
def get_db():
    """データベースセッションを取得"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# 初期データ投入関数
def seed_initial_data(db):
    """初期データを投入（デモ用）"""
    # ユーザーが既に存在するか確認
    if db.query(User).count() > 0:
        return  # 既にデータがある場合はスキップ
    
    # デモユーザーの作成
    users = [
        User(wallet_address="0x0000000000000000000000000000000000000001", username="artist1", email="artist1@example.com"),
        User(wallet_address="0x0000000000000000000000000000000000000002", username="artist2", email="artist2@example.com"),
        User(wallet_address="0x0000000000000000000000000000000000000003", username="artist3", email="artist3@example.com"),
    ]
    db.add_all(users)
    db.commit()
    
    # デモNFTの作成（テスト用商品は削除）
    # nfts = [
    #     NFT(name="Aurora #001", description="美しいオーロラのアート作品", 
    #         image_url="https://images.unsplash.com/photo-1517694712202-14dd9538aa97?q=80&w=1600&auto=format&fit=crop",
    #         owner_id=1, creator_id=1, category="Art", status="listed"),
    #     ...
    # ]
    # db.add_all(nfts)
    # db.commit()
    
    # 出品情報の作成（テスト用商品は削除）
    # listings = [
    #     Listing(nft_id=1, seller_id=1, price=0.12, currency="ETH", status="active"),
    #     ...
    # ]
    # db.add_all(listings)
    # db.commit()
    
    # デモチャットルームの作成（ユーザー1とユーザー2の間）
    chat_room = ChatRoom(user1_id=1, user2_id=2)
    db.add(chat_room)
    db.commit()
    
    # デモメッセージの作成
    demo_messages = [
        ChatMessage(room_id=chat_room.room_id, sender_id=2, message_text="こんにちは！ご興味ありがとうございます。こちらは1/1のユニーク作品です。", is_read=True),
        ChatMessage(room_id=chat_room.room_id, sender_id=1, message_text="素敵ですね。どんなテーマで制作しましたか？", is_read=True),
        ChatMessage(room_id=chat_room.room_id, sender_id=2, message_text="夜の都市と自然光のコントラストがテーマです。原本は4K解像度です。", is_read=True),
    ]
    db.add_all(demo_messages)
    db.commit()
    
    print("初期データを投入しました")

