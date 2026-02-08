import requests
import pandas as pd
from datatime import datetime, timezone
from ecdsa import SigningKey, SECP256k1
import binascii 
import json 
import node_list
import base64

def send_transaction(secret_key_sender_str,public_key_receiver_str,coin_num,nft_data,nft_origin):
    secret_key_sender = SigningKey.from_string(binascii.unhexlify(secret_key_sender_str),curve=SECP256kl)
    public_key_sender = secret_key_sender.verifying_key
    public_key_sender_str = public_key_sender.to_string().hex()
    time_now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    unsigned_transaction = { "time": time_now, "sender": public_key_sender_str, "receiver": public_key_receiver_str, "amount": coin_num, "nft_data": nft_data, "nft_origin": nft_origin }
    signature = secret_key_sender.sign(json.dumps(unsigned_transaction).encode('utf-8'))
    transaction = { "time": time_now, "sender": public_key_sender_str, "receiver": public_key_receiver_str, "amount": coin_num, "nft_data": nft_data, "nft_origin": nft_origin, "signature": signature.hex()}

    res = requests.post("http://" + node_list.Node_list[0] + ":8000/transaction_pool", json.dumps(transaction))
    print(res.text)

if __name__ == "__main__":
    coin_num = 0
    secret_key_sender_str = "415fae5a8a8b6ff39e587cd223d11124d9f7fc3a810495d53edfb70379b059ca"
    public_key_receiver_str = "2054c535b46f5a8526d3940b19754d76c39a4bee44563ad24ca6848e88245825ecd45aaa05e8080e3cf2ae3811a4efca57e09ab2eb488f1b044210059591cd08"
    send_transaction(secret_key_sender_str, public_key_receiver_str, coin_num, "NFT_A", "")





# # secret_key_sender_str="6a559a7ba42e9b407787bd24169cb061f90895b6110f4eb81e071b555f5b1641"#Aさん
# secret_key_sender_str="415fae5a8a8b6ff39e587cd223d11124d9f7fc3a810495d53edfb70379b059ca"#Cさん
# # public_key_receiver_str="a70aee515e9de618d145e7061935a093ab1238dbaa5ab8ba8b8246268214e5da7ca714e19820d04e48f3d50c8bb8280421181afd2092d82dfed221913f7e2fa6"#Bさん  
# # public_key_receiver_str="2054c535b46f5a8526d3940b19754d76c39a4bee44563ad24ca6848e88245825ecd45aaa05e8080e3cf2ae3811a4efca57e09ab2eb488f1b044210059591cd08"#Cさん
# public_key_receiver_str="3dff63e15d388046bd1fae2edc3b82ebc9054243bc214c510f14b2917452e1f07de1ee87bc076bfa0dfea1c88bd1eef6b059c4655f1dd4238f2d42a59abf96fa"#Dさん
