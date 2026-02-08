"""
テスト用商品を削除するスクリプト
"""
from database import SessionLocal, NFT, Listing, User, Transaction, Favorite
from sqlalchemy import or_

def delete_test_products():
    """テスト用のNFTとListingを削除"""
    db = SessionLocal()
    try:
        # テスト用のNFT名のリスト（seed_initial_dataで作成されたもの）
        test_nft_names = [
            "Aurora #001",
            "Nebula Cat #042",
            "Pixel Wave #777",
            "Night City #108",
            "Sphere #302",
            "Gradient Blob #096",
            "Mono Art #021",
            "Synth #909"
        ]
        
        # テスト用NFTを検索して削除
        test_nfts = db.query(NFT).filter(
            or_(*[NFT.name == name for name in test_nft_names])
        ).all()
        
        if test_nfts:
            print(f"テスト用NFT {len(test_nfts)}件を削除します...")
            for nft in test_nfts:
                # 関連するTransactionを削除
                from database import Transaction
                transactions = db.query(Transaction).filter(Transaction.nft_id == nft.nft_id).all()
                for transaction in transactions:
                    print(f"  - Transaction (ID: {transaction.transaction_id}) を削除")
                    db.delete(transaction)
                
                # 関連するListingも削除
                listings = db.query(Listing).filter(Listing.nft_id == nft.nft_id).all()
                for listing in listings:
                    print(f"  - Listing (ID: {listing.listing_id}) を削除")
                    db.delete(listing)
                
                # 関連するFavoriteも削除
                from database import Favorite
                favorites = db.query(Favorite).filter(Favorite.nft_id == nft.nft_id).all()
                for favorite in favorites:
                    print(f"  - Favorite (ID: {favorite.favorite_id}) を削除")
                    db.delete(favorite)
                
                print(f"  - NFT '{nft.name}' (ID: {nft.nft_id}) を削除")
                db.delete(nft)
            
            db.commit()
            print(f"テスト用商品 {len(test_nfts)}件の削除が完了しました。")
        else:
            print("テスト用商品が見つかりませんでした。")
        
        # デモユーザーも削除（オプション）
        demo_users = db.query(User).filter(
            or_(
                User.username == "artist1",
                User.username == "artist2",
                User.username == "artist3"
            )
        ).all()
        
        if demo_users:
            print(f"\nデモユーザー {len(demo_users)}人を削除しますか？")
            print("（デモユーザーを削除する場合は、このスクリプトを編集してコメントアウトを外してください）")
            # デモユーザーの削除はコメントアウト（必要に応じて有効化）
            # for user in demo_users:
            #     print(f"  - ユーザー '{user.username}' (ID: {user.user_id}) を削除")
            #     db.delete(user)
            # db.commit()
        
    except Exception as e:
        print(f"エラーが発生しました: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    print("テスト用商品を削除します...")
    delete_test_products()
    print("完了しました。")

