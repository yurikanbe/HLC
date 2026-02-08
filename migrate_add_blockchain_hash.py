"""
データベースマイグレーション: blockchain_hashカラムを追加
"""
import sqlite3
import os

DATABASE_URL = "sqlite:///./nft_marketplace_disabled.db"
DB_FILE = "./nft_marketplace_disabled.db"

def migrate():
    """blockchain_hashカラムをnftsテーブルに追加"""
    if not os.path.exists(DB_FILE):
        print(f"データベースファイル {DB_FILE} が見つかりません。")
        return
    
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    try:
        # カラムが既に存在するか確認
        cursor.execute("PRAGMA table_info(nfts)")
        columns = [row[1] for row in cursor.fetchall()]
        
        if 'blockchain_hash' in columns:
            print("blockchain_hashカラムは既に存在します。")
            return
        
        # blockchain_hashカラムを追加
        print("blockchain_hashカラムを追加しています...")
        cursor.execute("""
            ALTER TABLE nfts 
            ADD COLUMN blockchain_hash VARCHAR(66) NULL
        """)
        
        # インデックスを追加（ユニーク制約がある場合はスキップ）
        try:
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS ix_nfts_blockchain_hash 
                ON nfts(blockchain_hash)
            """)
        except sqlite3.OperationalError as e:
            print(f"インデックス作成時に警告: {e}")
        
        conn.commit()
        print("マイグレーションが完了しました。")
        
    except sqlite3.Error as e:
        print(f"エラーが発生しました: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()

